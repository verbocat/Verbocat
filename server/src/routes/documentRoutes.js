const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { processUploadedFile } = require("../services/fileService");
const { supabase, fetchAllSegments } = require("../config/supabase");
const { checkAuth, getDocumentPermission, checkDocumentAccess } = require("../utils/authMiddleware");
const { getDocumentRoomId } = require("../services/socket");

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

    console.log(`[DB_CREATE_DOCUMENT] Inserting record into "documents" table (DocId: ${documentId}, Name: "${request.file.originalname}")...`);
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

    if (accessRows && accessRows.length > 0) {
      for (const row of accessRows) {
        const doc = row.documents;
        if (!doc) continue;

        const proj = doc.projects || {};
        
        // Detect exact target language code
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
          tLang = "ar";
        }

        const key = `${doc.id}_${tLang}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

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
    
    // Strict Access Verification
    const access = await getDocumentPermission(id, request.user, request.profile);
    if (!access.hasAccess) {
      return response.status(403).json({
        error: "Access Denied: You do not have permission to access this document workspace. Please request access from the owner or administrator to participate."
      });
    }

    const doc = access.document;
    const targetLang = request.query.target || doc.target_lang || "hi";
    const segments = await fetchAllSegments(id, "*", targetLang);

    const docName = doc.name || "Untitled Document";
    const extIndex = docName.lastIndexOf(".");
    const computedExt = doc.file_extension || (extIndex !== -1 ? docName.substring(extIndex) : ".html");

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
      contextSettings: doc.context_settings || {},
      segments: segments || []
    });
  } catch (error) {
    console.error("Get Document Error:", error);
    response.status(500).json({ error: "Failed to fetch document." });
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
    const { data: doc } = await supabase.from("documents").select("owner_id").eq("id", id).maybeSingle();
    let owner = null;
    if (doc?.owner_id) {
      const { data: ownerProf } = await supabase.from("profiles").select("id, email, role").eq("id", doc.owner_id).maybeSingle();
      owner = ownerProf;
    }
    const { data: shares } = await supabase.from("document_access").select("*, profiles(id, email, role)").eq("document_id", id);
    const collaborators = (shares || []).map(s => ({
      userId: s.user_id,
      shareId: s.id,
      email: s.profiles?.email || "",
      fullName: s.profiles?.email || "User",
      permission: s.permission || "write"
    }));
    response.json({ access: shares || [], collaborators, owner });
  } catch (error) {
    response.json({ access: [], collaborators: [], owner: null });
  }
});

documentRouter.post(["/documents/:id/access", "/api/documents/:id/access"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { email, permission = "write" } = request.body;
    if (!email) return response.status(400).json({ error: "Email is required" });

    const cleanEmail = String(email).trim().toLowerCase();
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
        return response.status(404).json({ error: `User with email '${cleanEmail}' not found.` });
      }
    }

    // Fetch target document to check if there are sibling target language documents with the same file_id
    const { data: targetDoc } = await supabase
      .from("documents")
      .select("id, file_id, project_id")
      .eq("id", id)
      .maybeSingle();

    let docIdsToShare = [id];
    if (targetDoc?.file_id) {
      const { data: siblingDocs } = await supabase
        .from("documents")
        .select("id")
        .eq("file_id", targetDoc.file_id);
      if (siblingDocs && siblingDocs.length > 0) {
        docIdsToShare = Array.from(new Set([...docIdsToShare, ...siblingDocs.map(d => d.id)]));
      }
    }

    const inserts = docIdsToShare.map(dId => ({
      document_id: dId,
      user_id: targetProfile.id,
      permission: permission || "write"
    }));

    const { data: shareRow, error: upsertErr } = await supabase
      .from("document_access")
      .upsert(inserts, { onConflict: "document_id,user_id" })
      .select("*, profiles(id, email, role)");

    if (upsertErr) throw upsertErr;

    response.json({
      success: true,
      share: shareRow?.[0] || shareRow,
      collaborator: {
        userId: targetProfile.id,
        shareId: shareRow?.[0]?.id || shareRow?.id,
        email: targetProfile.email,
        fullName: targetProfile.email,
        permission: permission || "write"
      }
    });
  } catch (error) {
    console.error("Grant Document Access Error:", error);
    response.status(500).json({ error: error.message || "Failed to grant document access" });
  }
});

documentRouter.delete(["/documents/:id/access/:userId", "/api/documents/:id/access/:userId"], checkAuth, async (request, response) => {
  try {
    const { id, userId } = request.params;
    const { error } = await supabase
      .from("document_access")
      .delete()
      .eq("document_id", id)
      .eq("user_id", userId);

    if (error) throw error;
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

    const { error } = await supabase
      .from("document_access_requests")
      .upsert(
        {
          document_id: id,
          user_id: request.user.id,
          status: "pending"
        },
        { onConflict: "document_id,user_id" }
      );

    if (error) throw error;
    return response.json({ success: true, message: "Access request submitted to document owner." });
  } catch (err) {
    console.error("Request Access Error:", err);
    return response.status(500).json({ error: err.message || "Failed to submit access request" });
  }
});

documentRouter.get(["/documents/:id/access-requests", "/api/documents/:id/access-requests"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
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
      const { requestId: bodyReqId, action } = request.body; // action: 'approve' or 'reject'
      const requestId = paramReqId || bodyReqId;

    const { data: reqRow } = await supabase
      .from("document_access_requests")
      .select("user_id")
      .eq("id", requestId)
      .single();

    if (!reqRow) return response.status(404).json({ error: "Access request not found" });

    const newStatus = action === "approve" ? "approved" : "rejected";
    await supabase
      .from("document_access_requests")
      .update({ status: newStatus })
      .eq("id", requestId);

    if (action === "approve") {
      await supabase
        .from("document_access")
        .upsert(
          {
            document_id: id,
            user_id: reqRow.user_id,
            permission: "write"
          },
          { onConflict: "document_id,user_id" }
        );
    }

    return response.json({ success: true, status: newStatus });
  } catch (err) {
    console.error("Respond Access Request Error:", err);
    return response.status(500).json({ error: "Failed to respond to access request" });
  }
});

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

module.exports = {
  documentRouter
};
