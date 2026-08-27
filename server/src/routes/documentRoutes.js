const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { processUploadedFile } = require("../services/fileService");
const { supabase, fetchAllSegments } = require("../config/supabase");
const { checkAuth, getDocumentPermission, checkDocumentAccess } = require("../utils/authMiddleware");
const { getDocumentRoomId, getIo } = require("../services/socket");

const documentRouter = express.Router();

const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

// 1. Single File Upload
documentRouter.post(["/upload", "/api/upload"], checkAuth, upload.single("file"), async (request, response) => {
  try {
    if (!request.file) {
      console.error("[HTTP_UPLOAD_ERROR] No file present in upload request");
      return response.status(400).json({ error: "No file was uploaded." });
    }

    console.log(`\n========================================`);
    console.log(`[HTTP_UPLOAD_START] Received upload request for file: "${request.file.originalname}" (${request.file.size} bytes)`);

    const ext = path.extname(request.file.originalname).toLowerCase();
    const DANGEROUS_EXTS = [".exe", ".php", ".sh", ".bat", ".cmd", ".js", ".py", ".vbs", ".ps1", ".dll", ".so", ".app", ".cgi", ".msi", ".scr", ".pif"];
    if (DANGEROUS_EXTS.includes(ext)) {
      console.error(`[HTTP_UPLOAD_SECURITY_BLOCK] Blocked dangerous file extension: ${ext}`);
      if (fs.existsSync(request.file.path)) fs.unlinkSync(request.file.path);
      return response.status(400).json({ error: `Security Error: Executable or script files (${ext}) are not permitted.` });
    }

    const result = await processUploadedFile(request.file);
    const userId = request.user.id;
    const documentId = result.fileId;
    const activeTenantId = request.tenant?.id || request.organization?.id || request.profile?.organization_id || null;

    const srcLang = request.body.source || "en";
    const tgtLang = request.body.target || "hi";

    if (srcLang === tgtLang) {
      console.error(`[HTTP_UPLOAD_ERROR] Source and target languages are identical (${srcLang})`);
      return response.status(400).json({ error: "Source and target language cannot be the same." });
    }

    const totalWordCount = (result.segments || []).reduce((sum, seg) => {
      const clean = (seg.source || seg.source_text || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/__TAG_\d+__/g, " ")
        .replace(/&nbsp;/g, " ")
        .trim();
      return sum + (clean && /[\p{L}\p{N}]/u.test(clean) ? clean.split(/\s+/).filter(Boolean).length : 0);
    }, 0);

    console.log(`[DB_CREATE_DOCUMENT] Inserting record into "documents" table (DocId: ${documentId}, Name: "${request.file.originalname}", Words: ${totalWordCount})...`);
    // Create document record
    const { error: docError } = await supabase
      .from("documents")
      .insert({
        id: documentId,
        file_id: documentId,
        name: request.file.originalname,
        source_lang: srcLang,
        target_lang: tgtLang,
        owner_id: userId,
        organization_id: activeTenantId,
        file_extension: ext,
        word_count: totalWordCount,
        file_size: request.file.size || 0,
        status: "active"
      });

    if (docError) {
      console.error("[DB_CREATE_DOCUMENT_ERROR] Documents insert error:", docError);
    } else {
      console.log(`[DB_CREATE_DOCUMENT_SUCCESS] Document record created successfully!`);
    }

    // Automatically insert document_access entry for creator
    await supabase.from("document_access").upsert({
      document_id: documentId,
      user_id: userId,
      permission: "write",
      status: "approved"
    }, { onConflict: "document_id,user_id" }).catch(() => {});

    // Persist parsed template segments to DB in parallel batches (target_lang: null)
    console.log(`[DB_PERSIST_TEMPLATE_SEGMENTS] Persisting ${result.segments.length} template segments to "document_segments" (target_lang: null)...`);
    const segmentInserts = result.segments.map((seg, idx) => ({
      document_id: documentId,
      segment_index: idx + 1,
      target_lang: null,
      source_text: seg.source || "",
      target_text: "",
      status: "draft"
    }));

    const BATCH_SIZE = 1000;
    const batches = [];
    for (let i = 0; i < segmentInserts.length; i += BATCH_SIZE) {
      batches.push(segmentInserts.slice(i, i + BATCH_SIZE));
    }

    const batchResults = await Promise.all(
      batches.map(batch => supabase.from("document_segments").insert(batch))
    );

    const failed = batchResults.find(res => res.error);
    if (failed) {
      console.error(`[DB_PERSIST_TEMPLATE_SEGMENTS_ERROR] Failed inserting template segments:`, failed.error);
      await supabase.from("documents").delete().eq("id", documentId);
      return response.status(500).json({ error: `Failed to persist segments: ${failed.error.message || "Database error"}` });
    }

    console.log(`[HTTP_UPLOAD_COMPLETE] Successfully uploaded and persisted document ${documentId} with ${result.segments.length} segments!`);
    console.log(`========================================\n`);

    response.json({
      documentId: documentId,
      fileId: documentId,
      segments: result.segments,
      type: result.type,
      name: request.file.originalname
    });
  } catch (error) {
    console.error("Upload Route Exception:", error);
    if (request.file && request.file.path && fs.existsSync(request.file.path)) {
      fs.unlinkSync(request.file.path);
    }
    response.status(500).json({ error: error.message || "Failed to process uploaded file" });
  }
});

// 1.5 Fetch Assigned Documents for Current User (MUST BE DECLARED BEFORE /documents/:id TO PREVENT ROUTE TRAPPING)
documentRouter.get(["/documents/assigned", "/api/documents/assigned"], checkAuth, async (request, response) => {
  try {
    const userId = request.user.id;
    const userEmail = request.user.email?.trim().toLowerCase();

    // Find all matching profile IDs for this user email to guarantee no missing access records
    const { data: userProfiles } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", userEmail || "");

    const validUserIds = Array.from(new Set([userId, ...(userProfiles || []).map(p => p.id)].filter(Boolean)));

    // Query document_access for this user
    const { data: accessRows, error: accessErr } = await supabase
      .from("document_access")
      .select("*, documents(*, projects(*))")
      .in("user_id", validUserIds)
      .order("created_at", { ascending: false });

    if (accessErr) {
      console.error("[FETCH_ASSIGNED_ERR]", accessErr);
    }

    const assignedList = [];
    const seenKeys = new Set();

    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    if (accessRows && accessRows.length > 0) {
      for (const row of accessRows) {
        const doc = row.documents;
        if (!doc) continue;

        // STRICT MULTI-TENANT ISOLATION: Filter out assigned documents belonging to another client workspace
        if (!isSuperAdmin && activeTenantId && doc.organization_id && doc.organization_id !== activeTenantId) {
          continue;
        }

        const proj = doc.projects || {};
        const ownerId = doc.owner_id || proj.owner_id;

        let assignerEmail = "Project Coordinator";
        if (ownerId) {
          const { data: ownerProf } = await supabase
            .from("profiles")
            .select("email")
            .eq("id", ownerId)
            .maybeSingle();
          if (ownerProf?.email) {
            assignerEmail = ownerProf.email;
          }
        }

        // Check if specific target languages were assigned to this linguist in project settings
        const linguistAssignments = proj.settings?.linguistAssignments || {};
        const userAssignments = validUserIds.flatMap(uId => linguistAssignments[uId] || []);
        const matchingDocAssignments = userAssignments.filter(a => a.documentId === doc.id);

        if (matchingDocAssignments.length > 0) {
          for (const assignment of matchingDocAssignments) {
            const assignedLang = assignment.targetLang;
            const key = `${doc.id}_${assignedLang}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);

            assignedList.push({
              id: `${row.id}_${assignedLang}`,
              documentId: doc.id,
              fileId: doc.file_id || doc.id,
              documentName: doc.name || "Untitled Document",
              projectId: doc.project_id || proj.id || "",
              projectName: proj.name || "Translation Project",
              sourceLang: doc.source_lang || proj.source_lang || "en",
              targetLang: assignedLang,
              permission: assignment.permission || row.permission || "write",
              assignedAt: row.created_at || doc.created_at,
              assignerEmail,
              assignerRole: "Project Coordinator"
            });
          }
        } else {
          // Detect exact target language code fallback
          let tLang = doc.target_lang;
          if (!tLang || tLang === "hi") {
            const match = doc.name?.match(/_([a-z]{2,3})\.[a-z0-9]+$/i);
            if (match && match[1]) {
              tLang = match[1].toLowerCase();
            }
          }
          if (!tLang && proj.target_languages && proj.target_languages.length > 0) {
            tLang = proj.target_languages[0];
          }
          if (!tLang) {
            tLang = "hi";
          }

          const key = `${doc.id}_${tLang}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          assignedList.push({
            id: row.id,
            documentId: doc.id,
            fileId: doc.file_id || doc.id,
            documentName: doc.name || "Untitled Document",
            projectId: doc.project_id || proj.id || "",
            projectName: proj.name || "Translation Project",
            sourceLang: doc.source_lang || proj.source_lang || "en",
            targetLang: tLang,
            permission: row.permission || "write",
            assignedAt: row.created_at || doc.created_at,
            assignerEmail,
            assignerRole: "Project Coordinator"
          });
        }
      }
    }

    response.json({ assignments: assignedList });
  } catch (error) {
    console.error("Fetch Assigned Documents Error:", error);
    response.json({ assignments: [] });
  }
});

// 2. Get Single Document Metadata and Segments (STRICT PERMISSION GUARD ENFORCED)
documentRouter.get(["/documents/:id", "/api/documents/:id"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const reqTarget = request.query.target || request.query.target_lang || null;
    
    // Strict Access Verification with Job-Level Language Authorization
    const access = await getDocumentPermission(id, request.user, request.profile, null, reqTarget);
    if (!access.hasAccess) {
      return response.status(403).json({
        error: access.errorMessage || "Access Denied: You do not have permission to access this document or language job. Please request access from the owner or administrator to participate."
      });
    }

    const doc = access.document;
    const targetLang = reqTarget || (access.assignedLanguages && access.assignedLanguages.length > 0 ? access.assignedLanguages[0] : (doc.target_lang || "hi"));
    const segments = await fetchAllSegments(id, "*", targetLang);

    const docName = doc.name || "Untitled Document";
    const extIndex = docName.lastIndexOf(".");
    const computedExt = doc.file_extension || (extIndex !== -1 ? docName.substring(extIndex) : ".html");

    let contextSettings = {};
    if (doc.project_id) {
      const { data: proj } = await supabase
        .from("projects")
        .select("settings")
        .eq("id", doc.project_id)
        .maybeSingle();
      if (proj?.settings) {
        contextSettings = proj.settings.contextSettings || proj.settings || {};
      }
    }

    response.json({
      id: doc.id,
      name: docName,
      fileId: doc.file_id || doc.id,
      fileExtension: computedExt,
      sourceLang: doc.source_lang || "en",
      targetLang: doc.target_lang || "hi",
      ownerId: doc.owner_id,
      permission: access.permission,
      trackChangesEnabled: doc.track_changes_enabled || false,
      contextSettings: contextSettings,
      segments: segments || []
    });
  } catch (error) {
    console.error("Get Document Error:", error);
    response.status(500).json({ error: "Failed to fetch document." });
  }
});

// 3.4 Auto-detect Document Context Settings
documentRouter.post(
  ["/documents/:id/auto-detect-context", "/api/documents/:id/auto-detect-context"],
  checkAuth,
  async (request, response) => {
    try {
      const documentId = request.params.id;
      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .select("id, name, project_id")
        .eq("id", documentId)
        .single();

      if (docErr || !doc) {
        return response.status(404).json({ error: "Document not found." });
      }

      // Fetch segments to extract source text sample
      const segments = await fetchAllSegments(documentId, "source_text", null);
      const textSample = (segments || []).map(s => s.source_text || "").filter(Boolean).slice(0, 40).join("\n");

      const { analyzeDocumentTextContext } = require("../utils/referenceSampler");
      const detectedContext = await analyzeDocumentTextContext(textSample, doc.name || "Document");

      // Merge and save to projects table if project_id exists
      if (doc.project_id) {
        const { data: proj } = await supabase
          .from("projects")
          .select("settings")
          .eq("id", doc.project_id)
          .maybeSingle();
        
        const currentSettings = proj?.settings || {};
        const mergedSettings = {
          ...currentSettings,
          ...detectedContext,
          contextSettings: {
            ...(currentSettings.contextSettings || {}),
            ...detectedContext
          }
        };

        await supabase
          .from("projects")
          .update({ settings: mergedSettings })
          .eq("id", doc.project_id);
      }

      response.json({
        success: true,
        contextSettings: detectedContext,
        message: "Context detected and saved successfully."
      });
    } catch (error) {
      console.error("Auto-detect context error:", error);
      response.status(500).json({ error: error.message || "Failed to auto-detect context." });
    }
  }
);

// 3.5 QC Audit Endpoints (Pre-flight estimate, Start AI MQM Audit, Cancel, Status)
documentRouter.post(["/documents/:id/audit/estimate", "/api/documents/:id/audit/estimate"], checkAuth, async (request, response) => {
  try {
    // ── Server-side role guard: only owner, admin, or staff can run audits ──
    const role = request.profile?.role || "";
    const documentId = request.params.id;
    const isPrivileged = ["super_admin", "admin", "verbolabs_staff", "vendor"].includes(role);
    if (!isPrivileged) {
      // Check if this user is the document owner
      const { data: doc } = await supabase
        .from("documents")
        .select("owner_id, project_id")
        .eq("id", documentId)
        .maybeSingle();
      const isOwner = doc && doc.owner_id === request.user.id;
      // Also check project owner
      let isProjectOwner = false;
      if (!isOwner && doc?.project_id) {
        const { data: proj } = await supabase
          .from("projects")
          .select("owner_id")
          .eq("id", doc.project_id)
          .maybeSingle();
        isProjectOwner = proj && proj.owner_id === request.user.id;
      }
      if (!isOwner && !isProjectOwner) {
        return response.status(403).json({ error: "Access Denied: Only document owners and administrators can run QC Audits." });
      }
    }
    const targetLang = request.body.contextSettings?.targetLang || request.body.contextSettings?.targetLanguage || request.body.targetLang || request.query.target || "ja";

    let segments;
    try {
      segments = await fetchAllSegments(documentId, "*", targetLang);
    } catch (fetchErr) {
      console.error("Failed to fetch document segments:", fetchErr);
      return response.status(500).json({ error: "Failed to fetch document segments." });
    }

    const segmentCount = (segments || []).length;
    let totalWordCount = 0;
    (segments || []).forEach(seg => {
      const words = (seg.source_text || "").trim().split(/\s+/).filter(Boolean).length;
      totalWordCount += words;
    });

    const pass1Calls = Math.ceil(segmentCount / 8);
    const estErrSegments = Math.ceil(segmentCount * 0.15);
    const estimatedCalls = pass1Calls + (estErrSegments * 2);
    const estimatedDurationMin = Math.max(1, Math.round((segmentCount * 0.4) / 60 * 10) / 10);
    const estimatedCostUsd = Math.round((segmentCount * 0.00015) * 10000) / 10000;

    response.json({
      segmentCount,
      totalWordCount,
      estimatedCalls,
      estimatedDurationMin,
      estimatedCostUsd
    });
  } catch (error) {
    console.error("Audit estimate failed:", error);
    response.status(500).json({ error: "Internal server error." });
  }
});

documentRouter.post(["/documents/:id/audit/start", "/api/documents/:id/audit/start"], checkAuth, async (request, response) => {
  try {
    // ── Server-side role guard: only owner, admin, or staff can start audits ──
    const role = request.profile?.role || "";
    const documentId = request.params.id;
    const isPrivileged = ["super_admin", "admin", "verbolabs_staff", "vendor"].includes(role);
    if (!isPrivileged) {
      const { data: doc } = await supabase
        .from("documents")
        .select("owner_id, project_id")
        .eq("id", documentId)
        .maybeSingle();
      const isOwner = doc && doc.owner_id === request.user.id;
      let isProjectOwner = false;
      if (!isOwner && doc?.project_id) {
        const { data: proj } = await supabase
          .from("projects")
          .select("owner_id")
          .eq("id", doc.project_id)
          .maybeSingle();
        isProjectOwner = proj && proj.owner_id === request.user.id;
      }
      if (!isOwner && !isProjectOwner) {
        return response.status(403).json({ error: "Access Denied: Only document owners and administrators can start QC Audits." });
      }
    }
    const targetLang = request.body.contextSettings?.targetLang || request.body.contextSettings?.targetLanguage || request.body.targetLang || request.query.target || "ja";

    const { data: activeJobs } = await supabase
      .from("audit_jobs")
      .select("*")
      .eq("document_id", documentId)
      .in("status", ["pending", "in_progress"]);

    if (activeJobs && activeJobs.length > 0) {
      return response.status(400).json({ error: "An audit is already running for this document." });
    }

    let segments;
    try {
      segments = await fetchAllSegments(documentId, "*", targetLang);
    } catch (fetchErr) {
      console.error("Failed to fetch document segments for audit check:", fetchErr);
      return response.status(500).json({ error: "Failed to fetch document segments for credit check." });
    }

    if (!segments || segments.length === 0) {
      return response.status(400).json({ error: "No segments found in this document to audit." });
    }

    let wordCount = 0;
    segments.forEach(seg => {
      wordCount += (seg.source_text || "").trim().split(/\s+/).filter(Boolean).length;
    });

    if (request.profile && request.profile.role !== "admin" && request.profile.role !== "super_admin") {
      if ((request.profile.credits_consumed || 0) + wordCount > (request.profile.credits_allowed || 50000)) {
        return response.status(403).json({
          error: `Credit limit exceeded. Reached ${request.profile.credits_consumed}/${request.profile.credits_allowed} words allowance. Contact admin.`
        });
      }
    }

    const { data: job, error: jobErr } = await supabase
      .from("audit_jobs")
      .insert({
        document_id: documentId,
        status: "pending",
        total_segments: segments.length,
        completed_segments: 0,
        failed_segments: 0
      })
      .select()
      .single();

    if (jobErr || !job) {
      console.error("Failed to create audit job:", jobErr);
      return response.status(500).json({ error: jobErr?.message || "Failed to initiate audit job." });
    }

    if (wordCount > 0 && request.profile) {
      const isSeo = request.body.contextSettings?.purpose === "SEO";
      const actionName = isSeo ? "qc-audit (SEO)" : "qc-audit";
      await supabase.from("credit_logs").insert({
        user_id: request.profile.id,
        email: request.profile.email,
        action: actionName,
        word_count: wordCount
      });

      const newConsumed = (request.profile.credits_consumed || 0) + wordCount;
      await supabase
        .from("profiles")
        .update({ credits_consumed: newConsumed })
        .eq("id", request.profile.id);
    }

    response.json({
      success: true,
      jobId: job.id,
      message: "Background audit started."
    });

    (async () => {
      try {
        const { auditDocumentMQM } = require("../services/mqmService");
        const activeSettings = {
          ...request.body.contextSettings,
          targetLang
        };
        await auditDocumentMQM(documentId, job.id, activeSettings, request.user.id);
      } catch (err) {
        console.error(`[Background Audit Crash] Job ${job.id}:`, err);
      }
    })();
  } catch (error) {
    console.error("Start audit failed:", error);
    response.status(500).json({ error: error.message || "Internal server error." });
  }
});

documentRouter.post(["/documents/:id/audit/cancel/:jobId", "/api/documents/:id/audit/cancel/:jobId"], checkAuth, async (request, response) => {
  try {
    const documentId = request.params.id;
    const jobId = request.params.jobId;

    const { error } = await supabase
      .from("audit_jobs")
      .update({
        status: "cancelled",
        error_message: "Cancelled by user",
        updated_at: new Date().toISOString()
      })
      .eq("id", jobId)
      .eq("document_id", documentId);

    if (error) throw error;
    response.json({ success: true, message: "Audit cancellation requested successfully." });
  } catch (error) {
    console.error("Cancel audit failed:", error);
    response.status(500).json({ error: error.message || "Failed to cancel audit." });
  }
});

documentRouter.get(["/documents/:id/audit/status/:jobId", "/api/documents/:id/audit/status/:jobId"], checkAuth, async (request, response) => {
  try {
    const documentId = request.params.id;
    const jobId = request.params.jobId;

    const staleLimit = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await supabase
      .from("audit_jobs")
      .update({
        status: "failed",
        error_message: "Job stale / timed out.",
        updated_at: new Date().toISOString()
      })
      .eq("status", "in_progress")
      .lt("updated_at", staleLimit);

    const { data: job, error } = await supabase
      .from("audit_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("document_id", documentId)
      .maybeSingle();

    if (error || !job) {
      return response.status(404).json({ error: "Audit job not found." });
    }

    if (job.status === "pending") {
      const { count } = await supabase
        .from("audit_jobs")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending")
        .lt("created_at", job.created_at);
      job.queuePosition = (count || 0) + 1;
    } else {
      job.queuePosition = 0;
    }

    response.json(job);
  } catch (error) {
    console.error("Fetch audit status failed:", error);
    response.status(500).json({ error: error.message || "Failed to fetch audit status" });
  }
});

// 3. Rename Document
documentRouter.put(["/documents/:id/rename", "/api/documents/:id/rename"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { name } = request.body;
    if (!name) return response.status(400).json({ error: "Name is required" });

    const { data, error } = await supabase
      .from("documents")
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    response.json({ document: data });
  } catch (error) {
    console.error("Rename Document Error:", error);
    response.status(500).json({ error: "Failed to rename document" });
  }
});

// 4. Track Changes Toggle & Approvals
documentRouter.post(["/documents/:id/track-changes", "/api/documents/:id/track-changes"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { enabled } = request.body;
    await supabase.from("documents").update({ track_changes_enabled: !!enabled }).eq("id", id);
    response.json({ success: true, enabled: !!enabled });
  } catch (error) {
    response.status(500).json({ error: "Failed to update track changes" });
  }
});

documentRouter.post(["/documents/:id/accept-all-changes", "/api/documents/:id/accept-all-changes"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { data: segs } = await supabase.from("document_segments").select("*").eq("document_id", id);
    if (segs) {
      for (const s of segs) {
        if (s.original_target_text) {
          await supabase.from("document_segments").update({
            original_target_text: null,
            tracked_by: null,
            status: "approved"
          }).eq("id", s.id);
        }
      }
    }
    response.json({ success: true });
  } catch (error) {
    response.status(500).json({ error: "Failed to accept all changes" });
  }
});

// Single Tracked Change Accept / Reject
documentRouter.post(["/documents/:id/segments/:segmentIndex/accept-change", "/api/documents/:id/segments/:segmentIndex/accept-change"], checkAuth, async (request, response) => {
  try {
    const { id, segmentIndex } = request.params;
    const idx = parseInt(segmentIndex, 10);
    const targetLang = request.query?.target_lang || request.body?.target_lang || null;

    let query = supabase.from("document_segments").select("*").eq("document_id", id).eq("segment_index", idx);
    if (targetLang) {
      query = query.eq("target_lang", targetLang);
    }
    let { data: segs, error: fetchErr } = await query;

    if (fetchErr || !segs || segs.length === 0) {
      // Fallback query without target_lang filter if target_lang row doesn't exist yet
      const { data: fallbackSegs } = await supabase.from("document_segments").select("*").eq("document_id", id).eq("segment_index", idx);
      if (!fallbackSegs || fallbackSegs.length === 0) {
        return response.status(404).json({ error: `Segment ${idx} not found for document ${id}` });
      }
      segs = fallbackSegs;
    }

    const seg = segs[0];

    const { data: updated, error: updateErr } = await supabase
      .from("document_segments")
      .update({
        original_target_text: null,
        tracked_by: null,
        status: "translated"
      })
      .eq("id", seg.id)
      .select()
      .single();

    if (updateErr) {
      console.error("[ACCEPT_CHANGE_ERROR]", updateErr);
      return response.status(500).json({ error: updateErr.message });
    }

    response.json({ success: true, segment: updated });
  } catch (error) {
    console.error("Accept change exception:", error);
    response.status(500).json({ error: "Failed to accept tracked change" });
  }
});

documentRouter.post(["/documents/:id/segments/:segmentIndex/reject-change", "/api/documents/:id/segments/:segmentIndex/reject-change"], checkAuth, async (request, response) => {
  try {
    const { id, segmentIndex } = request.params;
    const idx = parseInt(segmentIndex, 10);
    const targetLang = request.query?.target_lang || request.body?.target_lang || null;

    let query = supabase.from("document_segments").select("*").eq("document_id", id).eq("segment_index", idx);
    if (targetLang) {
      query = query.eq("target_lang", targetLang);
    }
    let { data: segs, error: fetchErr } = await query;

    if (fetchErr || !segs || segs.length === 0) {
      const { data: fallbackSegs } = await supabase.from("document_segments").select("*").eq("document_id", id).eq("segment_index", idx);
      if (!fallbackSegs || fallbackSegs.length === 0) {
        return response.status(404).json({ error: `Segment ${idx} not found for document ${id}` });
      }
      segs = fallbackSegs;
    }

    const seg = segs[0];
    const revertedTargetText = seg.original_target_text !== null && seg.original_target_text !== undefined ? seg.original_target_text : seg.target_text;

    const { data: updated, error: updateErr } = await supabase
      .from("document_segments")
      .update({
        target_text: revertedTargetText,
        original_target_text: null,
        tracked_by: null
      })
      .eq("id", seg.id)
      .select()
      .single();

    if (updateErr) {
      console.error("[REJECT_CHANGE_ERROR]", updateErr);
      return response.status(500).json({ error: updateErr.message });
    }

    response.json({ success: true, segment: updated });
  } catch (error) {
    console.error("Reject change exception:", error);
    response.status(500).json({ error: "Failed to reject tracked change" });
  }
});



// 5. Access Management & Public Access Endpoints
documentRouter.get(["/documents/:id/access", "/api/documents/:id/access"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const reqTargetLang = (request.query.targetLang || request.query.target || "").toLowerCase();

    const { data: doc } = await supabase.from("documents").select("owner_id, project_id, target_lang").eq("id", id).maybeSingle();
    let owner = null;
    if (doc?.owner_id) {
      const { data: ownerProf } = await supabase.from("profiles").select("id, email, role").eq("id", doc.owner_id).maybeSingle();
      owner = ownerProf;
    }

    let jobAssignments = {};
    let linguistAssignments = {};
    if (doc?.project_id) {
      const { data: proj } = await supabase.from("projects").select("settings").eq("id", doc.project_id).maybeSingle();
      jobAssignments = proj?.settings?.jobAssignments || {};
      linguistAssignments = proj?.settings?.linguistAssignments || {};
    }

    const { data: shares } = await supabase.from("document_access").select("*, profiles(id, email, role)").eq("document_id", id);
    
    const accessList = (shares || []).map(s => {
      const userEmail = s.profiles?.email || "";
      const userRole = s.profiles?.role || "linguist";
      let assignedTargetLang = null;

      // 1. Check jobAssignments
      for (const [key, val] of Object.entries(jobAssignments)) {
        if (key.startsWith(`${id}_`) && (val.userId === s.user_id || val.email?.toLowerCase() === userEmail.toLowerCase())) {
          assignedTargetLang = val.targetLang;
          break;
        }
      }

      // 2. Check linguistAssignments fallback
      if (!assignedTargetLang && linguistAssignments[s.user_id]) {
        const userList = linguistAssignments[s.user_id];
        const docAssign = Array.isArray(userList) ? userList.find(a => a.documentId === id) : null;
        if (docAssign?.targetLang) {
          assignedTargetLang = docAssign.targetLang;
        }
      }

      // 3. Fallback for linguists if still null
      if (!assignedTargetLang && userRole === "linguist") {
        assignedTargetLang = doc?.target_lang || "hi";
      }

      const isStaffOrAdmin = ["super_admin", "admin", "project_manager", "verbolabs_staff", "vendor"].includes(userRole);
      const isOwnerUser = owner && owner.id === s.user_id;

      return {
        id: s.id,
        accessId: s.id,
        shareId: s.id,
        userId: s.user_id,
        email: userEmail,
        fullName: s.profiles?.email || "User",
        role: userRole,
        permission: s.permission || "write",
        targetLang: assignedTargetLang,
        isGlobalAccess: isStaffOrAdmin || isOwnerUser,
        createdAt: s.created_at
      };
    });

    response.json({ 
      access: accessList, 
      collaborators: accessList, 
      owner,
      currentLanguage: reqTargetLang || doc?.target_lang || "hi"
    });
  } catch (error) {
    console.error("Fetch Document Access Error:", error);
    response.json({ access: [], collaborators: [], owner: null });
  }
});

documentRouter.post(["/documents/:id/access", "/api/documents/:id/access"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { email, emails, permission = "write", targetLang } = request.body;
    
    const rawEmails = emails || email;
    if (!rawEmails) return response.status(400).json({ error: "At least one email address is required" });

    const emailList = (Array.isArray(rawEmails) ? rawEmails : [rawEmails])
      .flatMap(e => String(e).split(","))
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    if (emailList.length === 0) {
      return response.status(400).json({ error: "At least one valid email address is required" });
    }

    const resolvedProfiles = [];
    for (const cleanEmail of emailList) {
      let { data: targetProfile } = await supabase
        .from("profiles")
        .select("id, email, role")
        .ilike("email", cleanEmail)
        .maybeSingle();

      if (!targetProfile) {
        // Auto-create profile if giving access to a new user email
        const { data: newProf, error: createErr } = await supabase
          .from("profiles")
          .insert({
            email: cleanEmail,
            role: "linguist",
            status: "active"
          })
          .select("id, email, role")
          .single();

        if (!createErr && newProf) {
          targetProfile = newProf;
        } else {
          console.error(`[CREATE_PROFILE_WARN] Could not find or create profile for ${cleanEmail}:`, createErr);
        }
      }

      if (targetProfile) {
        resolvedProfiles.push(targetProfile);
      }
    }

    if (resolvedProfiles.length === 0) {
      return response.status(404).json({ error: "No valid user profiles could be found or created for the provided emails." });
    }

    // Fetch target document to check target_lang and file_id
    const { data: targetDoc } = await supabase
      .from("documents")
      .select("id, file_id, project_id, target_lang")
      .eq("id", id)
      .maybeSingle();

    const langToUse = targetLang || targetDoc?.target_lang;
    let docIdsToShare = [id];

    // Strictly scope sibling sharing to the SPECIFIC target language requested
    if (targetDoc?.file_id && langToUse) {
      const { data: siblingDocs } = await supabase
        .from("documents")
        .select("id")
        .eq("file_id", targetDoc.file_id)
        .eq("target_lang", langToUse);
      if (siblingDocs && siblingDocs.length > 0) {
        docIdsToShare = Array.from(new Set([...docIdsToShare, ...siblingDocs.map(d => d.id)]));
      }
    }

    const inserts = [];
    for (const dId of docIdsToShare) {
      for (const prof of resolvedProfiles) {
        inserts.push({
          document_id: dId,
          user_id: prof.id,
          permission: permission || "write"
        });
      }
    }

    const { data: shareRow, error: upsertErr } = await supabase
      .from("document_access")
      .upsert(inserts, { onConflict: "document_id,user_id" })
      .select("*, profiles(id, email, role)");

    if (upsertErr) throw upsertErr;

    // Save language assignment in project settings
    if (targetDoc?.project_id && langToUse) {
      try {
        const { data: proj } = await supabase.from("projects").select("id, settings").eq("id", targetDoc.project_id).maybeSingle();
        if (proj) {
          const settings = proj.settings || {};
          const jobAssignments = { ...(settings.jobAssignments || {}) };
          const linguistAssignments = { ...(settings.linguistAssignments || {}) };

          for (const dId of docIdsToShare) {
            for (const prof of resolvedProfiles) {
              const assignKey = `${dId}_${langToUse}`;
              jobAssignments[assignKey] = {
                userId: prof.id,
                email: prof.email,
                targetLang: langToUse,
                permission: permission || "write",
                assignedAt: new Date().toISOString()
              };

              const userList = [...(linguistAssignments[prof.id] || [])];
              const exists = userList.some(item => item.documentId === dId && item.targetLang === langToUse);
              if (!exists) {
                userList.push({ documentId: dId, targetLang: langToUse, permission: permission || "write" });
              }
              linguistAssignments[prof.id] = userList;
            }
          }

          await supabase.from("projects").update({
            settings: {
              ...settings,
              jobAssignments,
              linguistAssignments
            }
          }).eq("id", proj.id);
        }
      } catch (saveAssignErr) {
        console.error("[SAVE_ASSIGNMENT_WARN]", saveAssignErr);
      }
    }

    const collaborators = resolvedProfiles.map(p => ({
      userId: p.id,
      email: p.email,
      fullName: p.email,
      role: p.role || "linguist",
      permission: permission || "write",
      targetLang: langToUse
    }));

    response.json({
      success: true,
      message: `Access granted to ${resolvedProfiles.length} user(s).`,
      shares: shareRow || [],
      share: shareRow?.[0] || shareRow,
      collaborator: collaborators[0],
      collaborators
    });
  } catch (error) {
    console.error("Grant Document Access Error:", error);
    response.status(500).json({ error: error.message || "Failed to grant document access" });
  }
});

documentRouter.delete(["/documents/:id/access/:userId", "/api/documents/:id/access/:userId"], checkAuth, async (request, response) => {
  try {
    const { id, userId } = request.params;
    const targetLang = (request.query.targetLang || request.query.target || request.body?.targetLang || "").toLowerCase();

    // Check project settings
    const { data: doc } = await supabase.from("documents").select("project_id").eq("id", id).maybeSingle();
    let remainingAssignments = 0;

    if (doc?.project_id) {
      try {
        const { data: proj } = await supabase.from("projects").select("id, settings").eq("id", doc.project_id).maybeSingle();
        if (proj) {
          const settings = proj.settings || {};
          const jobAssignments = { ...(settings.jobAssignments || {}) };
          const linguistAssignments = { ...(settings.linguistAssignments || {}) };

          if (targetLang) {
            delete jobAssignments[`${id}_${targetLang}`];
            if (linguistAssignments[userId]) {
              linguistAssignments[userId] = linguistAssignments[userId].filter(
                a => !(a.documentId === id && a.targetLang?.toLowerCase() === targetLang)
              );
              remainingAssignments = linguistAssignments[userId].filter(a => a.documentId === id).length;
            }
          } else {
            for (const key of Object.keys(jobAssignments)) {
              if (key.startsWith(`${id}_`) && jobAssignments[key]?.userId === userId) {
                delete jobAssignments[key];
              }
            }
            if (linguistAssignments[userId]) {
              linguistAssignments[userId] = linguistAssignments[userId].filter(a => a.documentId !== id);
            }
            remainingAssignments = 0;
          }

          await supabase.from("projects").update({
            settings: {
              ...settings,
              jobAssignments,
              linguistAssignments
            }
          }).eq("id", proj.id);
        }
      } catch (assignErr) {
        console.error("[REVOKE_ASSIGNMENT_WARN]", assignErr);
      }
    }

    // Only delete row from document_access if the linguist has no remaining language assignments for this document
    if (remainingAssignments === 0) {
      const { error } = await supabase
        .from("document_access")
        .delete()
        .eq("document_id", id)
        .eq("user_id", userId);

      if (error) throw error;
    }

    response.json({ success: true, message: "Access revoked successfully" });
  } catch (error) {
    console.error("Revoke Document Access Error:", error);
    response.status(500).json({ error: "Failed to revoke document access" });
  }
});

documentRouter.get(["/documents/:id/public-access", "/api/documents/:id/public-access"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { data: doc } = await supabase.from("documents").select("public_access").eq("id", id).maybeSingle();
    response.json({ publicAccess: doc?.public_access || "none" });
  } catch (error) {
    response.json({ publicAccess: "none" });
  }
});

documentRouter.post(["/documents/:id/public-access", "/api/documents/:id/public-access"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { publicAccess } = request.body;
    await supabase.from("documents").update({ public_access: publicAccess || "none" }).eq("id", id);
    response.json({ success: true, publicAccess: publicAccess || "none" });
  } catch (error) {
    response.status(500).json({ error: "Failed to update public access" });
  }
});

documentRouter.put(["/documents/:id/public-access", "/api/documents/:id/public-access"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { publicAccess } = request.body;
    await supabase.from("documents").update({ public_access: publicAccess || "none" }).eq("id", id);
    response.json({ success: true, publicAccess: publicAccess || "none" });
  } catch (error) {
    response.status(500).json({ error: "Failed to update public access" });
  }
});

documentRouter.get(["/documents/:id/request-status", "/api/documents/:id/request-status"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { data: reqRow } = await supabase
      .from("document_access_requests")
      .select("status")
      .eq("document_id", id)
      .eq("user_id", request.user.id)
      .maybeSingle();

    return response.json({
      hasPendingRequest: reqRow?.status === "pending",
      status: reqRow?.status || "none"
    });
  } catch (err) {
    return response.json({ hasPendingRequest: false, status: "none" });
  }
});

documentRouter.post(["/documents/:id/request-access", "/api/documents/:id/request-access"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { permission = "write", targetLang } = request.body;

    // 1. Fetch document and project info
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, name, owner_id, project_id")
      .eq("id", id)
      .single();

    if (docErr || !doc) {
      return response.status(404).json({ error: "Document not found." });
    }

    let proj = null;
    if (doc.project_id) {
      const { data: projData } = await supabase
        .from("projects")
        .select("id, owner_id, settings")
        .eq("id", doc.project_id)
        .maybeSingle();
      proj = projData;
    }

    // 2. Upsert document_access_requests row
    const { error: reqErr } = await supabase
      .from("document_access_requests")
      .upsert(
        {
          document_id: id,
          user_id: request.user.id,
          status: "pending"
        },
        { onConflict: "document_id,user_id" }
      );

    if (reqErr) throw reqErr;

    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const userDisplayName = request.profile?.full_name || request.user.email?.split("@")[0] || "Linguist";

    // 3. Store rich request in project settings if project exists
    if (proj) {
      try {
        const projSettings = proj.settings || {};
        const accessRequests = { ...(projSettings.accessRequests || {}) };
        const reqKey = `${id}_${targetLang || "all"}_${request.user.id}`;
        
        accessRequests[reqKey] = {
          id: reqId,
          key: reqKey,
          documentId: id,
          documentName: doc.name,
          targetLang: targetLang || null,
          userId: request.user.id,
          userEmail: request.user.email,
          userName: userDisplayName,
          permission: permission || "write",
          status: "pending",
          createdAt: new Date().toISOString()
        };

        await supabase
          .from("projects")
          .update({
            settings: { ...projSettings, accessRequests }
          })
          .eq("id", proj.id);
      } catch (projSaveErr) {
        console.error("Failed to save access request to project settings:", projSaveErr);
      }
    }

    // 4. Targeted Socket Notification ONLY to file owner / project owner
    try {
      const io = getIo();
      if (io) {
        const socketPayload = {
          id: reqId,
          documentId: id,
          docName: doc.name,
          targetLang: targetLang || null,
          userId: request.user.id,
          userEmail: request.user.email,
          userName: userDisplayName,
          permission: permission || "write"
        };

        // Targeted to document owner's personal room
        if (doc.owner_id) {
          io.to(`user:${doc.owner_id}`).emit("access-request-received", socketPayload);
        }
        // If project owner is distinct from document owner, target project owner
        if (proj?.owner_id && proj.owner_id !== doc.owner_id) {
          io.to(`user:${proj.owner_id}`).emit("access-request-received", socketPayload);
        }
        // Notify project room if anyone is on project screen
        if (proj?.id) {
          io.to(`project:${proj.id}`).emit("access-request-received", socketPayload);
        }
      }
    } catch (socketErr) {
      console.error("Socket notification error on request-access:", socketErr);
    }

    return response.json({ success: true, message: "Access request submitted to document owner." });
  } catch (err) {
    console.error("Request Access Error:", err);
    return response.status(500).json({ error: err.message || "Failed to submit access request" });
  }
});

documentRouter.get(["/documents/:id/access-requests", "/api/documents/:id/access-requests"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { targetLang } = request.query;

    // Fetch document & project to check permissions & rich requests
    const { data: doc } = await supabase.from("documents").select("id, project_id, owner_id").eq("id", id).maybeSingle();
    let richRequests = [];

    if (doc?.project_id) {
      const { data: proj } = await supabase.from("projects").select("settings").eq("id", doc.project_id).maybeSingle();
      const accessRequests = proj?.settings?.accessRequests || {};
      richRequests = Object.values(accessRequests).filter(r => r.documentId === id && r.status === "pending");
      if (targetLang) {
        richRequests = richRequests.filter(r => !r.targetLang || r.targetLang.toLowerCase() === targetLang.toLowerCase());
      }
    }

    if (richRequests.length > 0) {
      return response.json(richRequests);
    }

    const { data: reqs } = await supabase
      .from("document_access_requests")
      .select("*, profiles(*)")
      .eq("document_id", id)
      .eq("status", "pending");

    return response.json(reqs || []);
  } catch (err) {
    return response.json([]);
  }
});

documentRouter.post(
  [
    "/documents/:id/respond-request",
    "/api/documents/:id/respond-request",
    "/documents/:id/access-requests/:requestId/respond",
    "/api/documents/:id/access-requests/:requestId/respond"
  ],
  checkAuth,
  async (request, response) => {
    try {
      const { id, requestId: paramReqId } = request.params;
      const { requestId: bodyReqId, action, permission = "write", targetLang } = request.body; // action: 'approve' or 'reject'
      const requestId = paramReqId || bodyReqId;

      // 1. Resolve target user from document_access_requests or project settings
      let targetUserId = null;
      let reqTargetLang = targetLang || null;
      let requestedPermission = permission || "write";

      const { data: doc } = await supabase.from("documents").select("id, name, owner_id, project_id").eq("id", id).maybeSingle();
      
      let proj = null;
      if (doc?.project_id) {
        const { data: projData } = await supabase.from("projects").select("id, owner_id, settings").eq("id", doc.project_id).maybeSingle();
        proj = projData;
      }

      if (proj && proj.settings?.accessRequests) {
        const accessRequests = proj.settings.accessRequests;
        for (const [key, reqObj] of Object.entries(accessRequests)) {
          if (reqObj.id === requestId || key.includes(requestId) || reqObj.documentId === id) {
            targetUserId = reqObj.userId;
            reqTargetLang = reqTargetLang || reqObj.targetLang;
            requestedPermission = permission || reqObj.permission || "write";
            break;
          }
        }
      }

      if (!targetUserId) {
        const { data: reqRow } = await supabase
          .from("document_access_requests")
          .select("user_id")
          .eq("id", requestId)
          .maybeSingle();

        if (reqRow) {
          targetUserId = reqRow.user_id;
        } else {
          // If requestId is a UUID or user_id
          const { data: userReq } = await supabase
            .from("document_access_requests")
            .select("user_id")
            .eq("document_id", id)
            .eq("status", "pending")
            .maybeSingle();
          if (userReq) targetUserId = userReq.user_id;
        }
      }

      if (!targetUserId) {
        return response.status(404).json({ error: "Access request not found" });
      }

      const newStatus = action === "approve" ? "approved" : "rejected";

      // 2. Update document_access_requests table status
      await supabase
        .from("document_access_requests")
        .update({ status: newStatus })
        .eq("document_id", id)
        .eq("user_id", targetUserId);

      // 3. Update project settings accessRequests and assignments
      if (proj) {
        try {
          const projSettings = proj.settings || {};
          const accessRequests = { ...(projSettings.accessRequests || {}) };
          const jobAssignments = { ...(projSettings.jobAssignments || {}) };
          const linguistAssignments = { ...(projSettings.linguistAssignments || {}) };

          for (const [key, reqObj] of Object.entries(accessRequests)) {
            if (reqObj.documentId === id && reqObj.userId === targetUserId && reqObj.status === "pending") {
              accessRequests[key] = {
                ...reqObj,
                status: newStatus,
                respondedAt: new Date().toISOString(),
                respondedBy: request.user.id
              };
            }
          }

          if (action === "approve" && reqTargetLang) {
            const assignKey = `${id}_${reqTargetLang}`;
            jobAssignments[assignKey] = {
              userId: targetUserId,
              targetLang: reqTargetLang,
              permission: requestedPermission,
              assignedAt: new Date().toISOString()
            };

            const userList = [...(linguistAssignments[targetUserId] || [])];
            const exists = userList.some(item => item.documentId === id && item.targetLang === reqTargetLang);
            if (!exists) {
              userList.push({ documentId: id, targetLang: reqTargetLang, permission: requestedPermission });
            }
            linguistAssignments[targetUserId] = userList;
          }

          await supabase.from("projects").update({
            settings: { ...projSettings, accessRequests, jobAssignments, linguistAssignments }
          }).eq("id", proj.id);
        } catch (projUpdateErr) {
          console.error("Failed to update project settings on respond-request:", projUpdateErr);
        }
      }

      // 4. If approved, grant permission in document_access table
      if (action === "approve") {
        await supabase
          .from("document_access")
          .upsert(
            {
              document_id: id,
              user_id: targetUserId,
              permission: requestedPermission
            },
            { onConflict: "document_id,user_id" }
          );
      }

      // 5. Emit real-time socket events
      try {
        const io = getIo();
        if (io) {
          io.to(`user:${targetUserId}`).emit("access-request-responded", {
            documentId: id,
            targetLang: reqTargetLang,
            action,
            userId: targetUserId,
            permission: requestedPermission
          });

          io.to(`user:${request.user.id}`).emit("access-request-processed", { requestId, action });
          if (doc?.owner_id) io.to(`user:${doc.owner_id}`).emit("access-request-processed", { requestId, action });
          if (proj?.id) io.to(`project:${proj.id}`).emit("access-request-processed", { requestId, action });
        }
      } catch (socketEmitErr) {
        console.error("Socket emit error on respond-request:", socketEmitErr);
      }

      return response.json({ success: true, status: newStatus });
    } catch (err) {
      console.error("Respond Access Request Error:", err);
      return response.status(500).json({ error: "Failed to respond to access request" });
    }
  }
);

// 6. Delete Document
documentRouter.delete(["/documents/:id", "/api/documents/:id"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    let query = supabase.from("documents").delete().eq("id", id);
    if (!isSuperAdmin && activeTenantId) {
      query = query.eq("organization_id", activeTenantId);
    }

    const { error } = await query;
    if (error) throw error;

    response.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Delete Document Error:", error);
    response.status(500).json({ error: "Failed to delete document" });
  }
});

// 7. Bulk Share Documents with Multiple Users/Linguists
documentRouter.post(["/documents/bulk-share", "/api/documents/bulk-share"], checkAuth, async (request, response) => {
  try {
    const { documentIds = [], emails = [], permission = "write", targetLang } = request.body;
    
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return response.status(400).json({ error: "At least one document ID is required for bulk share." });
    }

    const emailList = (Array.isArray(emails) ? emails : [emails])
      .map(e => String(e).trim().toLowerCase())
      .filter(Boolean);

    if (emailList.length === 0) {
      return response.status(400).json({ error: "At least one valid user email is required." });
    }

    // 1. Resolve or auto-create profiles for each email
    const targetUserIds = [];
    const resolvedEmails = [];

    for (const cleanEmail of emailList) {
      let { data: targetProfile } = await supabase
        .from("profiles")
        .select("id, email, role")
        .ilike("email", cleanEmail)
        .maybeSingle();

      if (!targetProfile) {
        // Auto-create profile if giving access to a new user email
        const { data: newProf, error: createErr } = await supabase
          .from("profiles")
          .insert({
            email: cleanEmail,
            role: "linguist",
            status: "active"
          })
          .select("id, email, role")
          .single();

        if (!createErr && newProf) {
          targetProfile = newProf;
        }
      }

      if (targetProfile) {
        targetUserIds.push(targetProfile.id);
        resolvedEmails.push(targetProfile.email);
      }
    }

    if (targetUserIds.length === 0) {
      return response.status(404).json({ error: "No valid profiles could be found or created for provided emails." });
    }

    // 2. Expand document IDs scoped STRICTLY to targetLang if provided
    const { data: targetDocs } = await supabase
      .from("documents")
      .select("id, file_id, target_lang")
      .in("id", documentIds);

    const fileIds = Array.from(new Set((targetDocs || []).map(d => d.file_id).filter(Boolean)));
    let allDocIds = Array.from(new Set(documentIds));

    if (fileIds.length > 0) {
      let query = supabase.from("documents").select("id").in("file_id", fileIds);
      if (targetLang) {
        query = query.eq("target_lang", targetLang);
      }
      const { data: siblingDocs } = await query;
      if (siblingDocs && siblingDocs.length > 0) {
        allDocIds = Array.from(new Set([...allDocIds, ...siblingDocs.map(d => d.id)]));
      }
    }

    // 3. Build access insert rows for all combinations of document and user
    const accessInserts = [];
    for (const docId of allDocIds) {
      for (const uId of targetUserIds) {
        accessInserts.push({
          document_id: docId,
          user_id: uId,
          permission: permission || "write"
        });
      }
    }

    if (accessInserts.length > 0) {
      const { error: upsertErr } = await supabase
        .from("document_access")
        .upsert(accessInserts, { onConflict: "document_id,user_id" });

      if (upsertErr) throw upsertErr;

      // Save language assignment in project settings
      if (targetLang) {
        try {
          const { data: firstDoc } = await supabase.from("documents").select("project_id").in("id", allDocIds).limit(1).maybeSingle();
          if (firstDoc?.project_id) {
            const { data: proj } = await supabase.from("projects").select("id, settings").eq("id", firstDoc.project_id).maybeSingle();
            if (proj) {
              const settings = proj.settings || {};
              const jobAssignments = { ...(settings.jobAssignments || {}) };
              const linguistAssignments = { ...(settings.linguistAssignments || {}) };

              for (const docId of allDocIds) {
                for (let i = 0; i < targetUserIds.length; i++) {
                  const uId = targetUserIds[i];
                  const email = resolvedEmails[i];
                  const assignKey = `${docId}_${targetLang}`;
                  jobAssignments[assignKey] = {
                    userId: uId,
                    email,
                    targetLang,
                    permission: permission || "write",
                    assignedAt: new Date().toISOString()
                  };

                  const userList = [...(linguistAssignments[uId] || [])];
                  const exists = userList.some(item => item.documentId === docId && item.targetLang === targetLang);
                  if (!exists) {
                    userList.push({ documentId: docId, targetLang, permission: permission || "write" });
                  }
                  linguistAssignments[uId] = userList;
                }
              }

              await supabase.from("projects").update({
                settings: {
                  ...settings,
                  jobAssignments,
                  linguistAssignments
                }
              }).eq("id", proj.id);
            }
          }
        } catch (saveAssignErr) {
          console.error("[BULK_SAVE_ASSIGNMENT_WARN]", saveAssignErr);
        }
      }
    }

    response.json({
      success: true,
      message: `Successfully shared ${allDocIds.length} document(s) with ${resolvedEmails.length} user(s).`,
      sharedEmails: resolvedEmails,
      documentCount: allDocIds.length,
      accessCount: accessInserts.length
    });
  } catch (error) {
    console.error("Bulk Share Documents Error:", error);
    response.status(500).json({ error: error.message || "Failed to bulk share documents" });
  }
});

module.exports = {
  documentRouter
};

