const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { processUploadedFile, exportHtml } = require("../services/fileService");
const { translateSegments } = require("../services/translationService");
const { getProviderStatus } = require("../services/translationProviders");
const { supabase } = require("../config/supabase");
const { checkAuth, checkTranslateAccess } = require("../utils/authMiddleware");
const {
  generateXliff,
  generateTmx,
  parseXliff,
  parseTmx
} = require("../utils/exporters");

const apiRouter = express.Router();
const upload = multer({
  dest: "uploads/"
});

apiRouter.get("/", (request, response) => {
  response.json({
    message: "Server Running"
  });
});

apiRouter.post("/upload", checkAuth, upload.single("file"), async (request, response) => {
  try {
    const result = await processUploadedFile(request.file);
    const userId = request.user.id;
    const documentId = result.fileId; // Align documentId with the layout template ID (fileId)

    // 1. Create document record
    const { error: docError } = await supabase
      .from("documents")
      .insert({
        id: documentId,
        name: result.originalName || "Untitled Document",
        owner_id: userId,
        file_id: result.fileId,
        source_lang: request.body.source || "en",
        target_lang: request.body.target || "hi"
      });

    if (docError) {
      console.error("Failed to insert document metadata:", docError);
      return response.status(500).json({ error: "Failed to create document record." });
    }

    // 2. Persist parsed segments to the database
    const segmentInserts = result.segments.map((seg, idx) => ({
      document_id: documentId,
      segment_index: idx,
      source_text: seg.source || "",
      target_text: seg.target || "",
      status: "draft"
    }));

    const { error: segError } = await supabase
      .from("document_segments")
      .insert(segmentInserts);

    if (segError) {
      console.error("Failed to insert document segments:", segError);
      // Rollback document creation on segment insertion error
      await supabase.from("documents").delete().eq("id", documentId);
      return response.status(500).json({ error: "Failed to persist document segments." });
    }

    response.json({
      type: result.type,
      documentId,
      segments: result.segments,
      originalName: result.originalName
    });
  } catch (error) {
    console.log(error);
    response.status(error.status || 500).json({
      error: error.message || "Server error"
    });
  }
});

apiRouter.post("/translate-batch", checkAuth, checkTranslateAccess, async (request, response) => {
  try {
    const { segments, target, source, contextSettings, fileName, documentId } = request.body;
    const result = await translateSegments(segments, target, source, contextSettings);
    
    // Save translations to document_segments in DB if documentId is provided
    if (documentId && result.results && result.results.length > 0) {
      const { getIo } = require("../services/socket");
      const io = getIo();

      const updatePromises = result.results.map(async (item) => {
        const segmentIndex = item.id - 1; // client IDs are 1-indexed
        
        const { error } = await supabase
          .from("document_segments")
          .update({
            target_text: item.translated,
            status: "translated",
            mqm_accuracy_score: item.mqmAccuracyScore !== undefined ? item.mqmAccuracyScore : 100,
            mqm_report: item.mqmReport || null,
            updated_at: new Date().toISOString()
          })
          .eq("document_id", documentId)
          .eq("segment_index", segmentIndex);

        if (error) {
          console.error(`Failed to save auto-translated segment index ${segmentIndex} for document ${documentId}:`, error);
        } else {
          // Broadcast to other collaborative clients in real time
          if (io) {
            io.to(documentId).emit("segment-updated", {
              segmentIndex,
              targetText: item.translated,
              status: "translated",
              mqmAccuracyScore: item.mqmAccuracyScore,
              mqmReport: item.mqmReport,
              updatedBy: request.user.email
            });
          }
        }
      });

      await Promise.all(updatePromises);
    }

    // Log credit consumption and update database profiles
    const wordCount = request.wordCount || 0;
    if (wordCount > 0) {
      const email = request.profile.email;
      const userId = request.profile.id;

      // 1. Log credit entry in credit_logs
      await supabase.from("credit_logs").insert({
        user_id: userId,
        email: email,
        action: "translate-batch",
        word_count: wordCount,
        file_name: fileName || "document"
      });

      // 2. Increment credits_consumed in profiles
      const newConsumed = request.profile.credits_consumed + wordCount;
      await supabase
        .from("profiles")
        .update({ credits_consumed: newConsumed })
        .eq("id", userId);
    }

    response.json(result);
  } catch (error) {
    console.log(error);
    response.status(500).json({
      error: error.message || "Batch translation failed"
    });
  }
});

apiRouter.get("/provider-status", (request, response) => {
  try {
    const status = getProviderStatus();
    response.json(status);
  } catch (error) {
    console.log(error);
    response.status(500).json({ error: "Provider status unavailable" });
  }
});

apiRouter.post("/export", async (request, response) => {
  try {
    const { fileId, segments, extension, sourceLang, targetLang, fileName, exportSource } = request.body;
    const ext = extension || ".html";

    let exportSegments = segments;
    if (exportSource) {
      exportSegments = segments.map(seg => ({
        ...seg,
        target: seg.source,
        translation: seg.source
      }));
    }

    if (ext === ".xlf" || ext === ".xliff") {
      const xliffContent = generateXliff(exportSegments, sourceLang || "en", targetLang || "hi", fileName || "document");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName || "translated"}.xlf"`
      );
      response.setHeader("Content-Type", "application/x-xliff+xml");
      return response.send(Buffer.from(xliffContent, "utf-8"));
    }

    if (ext === ".tmx") {
      const tmxContent = generateTmx(exportSegments, sourceLang || "en", targetLang || "hi");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName || "translated"}.tmx"`
      );
      response.setHeader("Content-Type", "application/xml");
      return response.send(Buffer.from(tmxContent, "utf-8"));
    }

    const buffer = await exportHtml(fileId, exportSegments, ext);

    response.setHeader(
      "Content-Disposition",
      `attachment; filename=translated${ext}`
    );
    
    let contentType = "application/octet-stream";
    if (ext === ".html") contentType = "text/html";
    else if (ext === ".txt") contentType = "text/plain";
    else if (ext === ".docx") contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    else if (ext === ".pptx") contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    else if (ext === ".xlsx") contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    response.setHeader("Content-Type", contentType);
    response.send(buffer);
  } catch (error) {
    console.log(error);
    response.status(error.status || 500).json({
      error: error.message || "Export failed"
    });
  }
});

apiRouter.get("/export-global-tm", async (request, response) => {
  try {
    const { source, target } = request.query;
    if (!source || !target) {
      return response.status(400).json({ error: "Missing source or target language parameter" });
    }

    const { data, error } = await supabase
      .from("translation_memory")
      .select("*")
      .eq("target_lang", target)
      .eq("source_lang", source);

    if (error) throw error;

    const formattedSegments = (data || []).map((item) => ({
      source: item.source_text,
      target: item.target_text
    }));

    const tmxContent = generateTmx(formattedSegments, source, target);

    response.setHeader(
      "Content-Disposition",
      `attachment; filename="global_tm_${source}_${target}.tmx"`
    );
    response.setHeader("Content-Type", "application/xml");
    response.send(Buffer.from(tmxContent, "utf-8"));
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Failed to export global TM" });
  }
});

apiRouter.post("/import-xliff", upload.single("file"), async (request, response) => {
  try {
    if (!request.file) {
      return response.status(400).json({ error: "No file uploaded" });
    }
    const xmlContent = fs.readFileSync(request.file.path, "utf-8");
    const segments = parseXliff(xmlContent);
    
    // clean up temporary uploaded file
    fs.unlinkSync(request.file.path);
    
    response.json({ segments });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Failed to import XLIFF" });
  }
});

apiRouter.post("/import-tmx", upload.single("file"), async (request, response) => {
  try {
    if (!request.file) {
      return response.status(400).json({ error: "No file uploaded" });
    }
    const xmlContent = fs.readFileSync(request.file.path, "utf-8");
    const entries = parseTmx(xmlContent);
    
    // clean up temporary uploaded file
    fs.unlinkSync(request.file.path);

    if (entries.length === 0) {
      return response.json({ count: 0 });
    }

    // Insert translation memory rows to Supabase database
    const insertRows = entries.map((item) => ({
      source_text: item.sourceText,
      target_text: item.targetText,
      source_lang: item.sourceLang,
      target_lang: item.targetLang,
      provider: "Imported TMX"
    }));

    // Perform upsert or batch insert
    const { error: insertError } = await supabase
      .from("translation_memory")
      .insert(insertRows);

    if (insertError) {
      console.error("Supabase TMX insert error:", insertError);
      throw insertError;
    }

    response.json({ count: entries.length });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Failed to import TMX" });
  }
});

// Helper to capture and handle missing table cache errors gracefully (PGRST205)
function handleDatabaseError(error, response, fallbackMsg) {
  if (error) {
    console.error(error);
    const msg = String(error.message || "");
    const code = String(error.code || "");
    
    // Missing column migration check (PG code 42703 is undefined_column)
    if (code === '42703' || msg.includes("track_changes_enabled") || msg.includes("original_target_text") || msg.includes("tracked_by")) {
      response.status(500).json({
        error: `Database columns are missing. Please run the SQL migration script (server/src/config/migration_track_changes.sql) in your Supabase SQL Editor to add the required columns. Details: ${msg}`
      });
      return true;
    }

    if (code === 'PGRST205' || msg.includes("audit_jobs") || msg.includes("document_access_requests")) {
      const missingTable = msg.includes("document_access_requests") ? "document_access_requests" : "audit_jobs";
      response.status(500).json({ error: `Database table '${missingTable}' is missing. Please run the SQL migration script (server/src/config/migration.sql) in your Supabase SQL Editor to create it.` });
      return true;
    }
    response.status(500).json({ error: fallbackMsg || "Database query failed." });
    return true;
  }
  return false;
}

// Helper helper to check document access permission
async function verifyDocumentAccess(request, response, requiredPermission = "read") {
  const documentId = request.params.id;
  const userId = request.user.id;
  const role = request.profile.role;

  const isStaff = ["admin", "verbolabs_staff"].includes(role);

  // Fetch document owner
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docError || !doc) {
    response.status(404).json({ error: "Document not found." });
    return null;
  }

  // Staff and Owner have full access
  if (isStaff || doc.owner_id === userId) {
    return doc;
  }

  // Check explicit access
  const { data: access, error: accessError } = await supabase
    .from("document_access")
    .select("permission")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .single();

  if (accessError || !access) {
    response.status(403).json({ error: "Access denied to this document." });
    return null;
  }

  // If write is required but they only have read
  if (requiredPermission === "write" && access.permission !== "write") {
    response.status(403).json({ error: "Write permission required." });
    return null;
  }

  return doc;
}

// 0. Search users by email for autosuggestion
apiRouter.get("/users/search", checkAuth, async (request, response) => {
  try {
    const { query } = request.query;
    if (!query || query.trim().length < 2) {
      return response.json([]);
    }

    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, email")
      .ilike("email", `%${query.trim()}%`)
      .limit(8);

    if (error) {
      console.error("Search profiles error:", error);
      return response.status(500).json({ error: "Failed to search users." });
    }

    const mappedUsers = (users || []).map(u => ({
      id: u.id,
      email: u.email,
      full_name: u.email ? u.email.split("@")[0] : "Linguist"
    }));

    response.json(mappedUsers);
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Server error." });
  }
});

// 1. Fetch document metadata and segments
apiRouter.get("/documents/:id", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;

    // Fetch segments
    const { data: segments, error: segError } = await supabase
      .from("document_segments")
      .select("*")
      .eq("document_id", doc.id)
      .order("segment_index", { ascending: true });

    if (segError) {
      return response.status(500).json({ error: "Failed to load document segments." });
    }

    // Determine current user's permission level ('read' or 'write')
    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile.role);
    let userPermission = "read";
    if (isStaff || doc.owner_id === request.user.id) {
      userPermission = "write";
    } else {
      const { data: access } = await supabase
        .from("document_access")
        .select("permission")
        .eq("document_id", doc.id)
        .eq("user_id", request.user.id)
        .single();
      if (access) {
        userPermission = access.permission;
      }
    }

    // Map to client format
    const formattedSegments = segments.map(seg => ({
      id: seg.segment_index + 1,
      source: seg.source_text,
      target: seg.target_text || "",
      status: seg.status,
      contextJira: seg.context_jira || "",
      contextDescription: seg.context_description || "",
      mqmAccuracyScore: seg.mqm_accuracy_score !== undefined && seg.mqm_accuracy_score !== null ? seg.mqm_accuracy_score : 100,
      mqmReport: seg.mqm_report || null,
      originalTargetText: seg.original_target_text || null,
      trackedBy: seg.tracked_by || null
    }));

    response.json({
      documentId: doc.id,
      name: doc.name,
      ownerId: doc.owner_id,
      fileId: doc.file_id,
      sourceLang: doc.source_lang,
      targetLang: doc.target_lang,
      permission: userPermission,
      trackChangesEnabled: doc.track_changes_enabled || false,
      segments: formattedSegments
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  }
});

// 2. Update a single segment
apiRouter.put("/documents/:id/segments/:index", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "write");
    if (!doc) return;

    const segmentIndex = parseInt(request.params.index, 10);
    const { targetText, status, contextJira, contextDescription } = request.body;

    const updateFields = {
      updated_at: new Date().toISOString()
    };
    if (targetText !== undefined) updateFields.target_text = targetText;
    if (status !== undefined) updateFields.status = status;
    if (contextJira !== undefined) updateFields.context_jira = contextJira;
    if (contextDescription !== undefined) updateFields.context_description = contextDescription;

    // Fetch the source text and context
    const { data: dbSegment } = await supabase
      .from("document_segments")
      .select("source_text, context_jira, context_description, target_text, original_target_text, tracked_by")
      .eq("document_id", doc.id)
      .eq("segment_index", segmentIndex)
      .single();
    
    if (!dbSegment) {
      return response.status(404).json({ error: "Segment not found." });
    }

    const sourceText = dbSegment.source_text;

    // Clean string helper (ignores tags, normalizes whitespace)
    const cleanString = (str) => {
      if (!str) return "";
      return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    };

    // Propagate translation helper (replaces tag content but preserves original tags in target/sourceB)
    const propagateTranslation = (targetA, sourceB) => {
      if (!targetA) return "";
      const tagsInSourceB = sourceB.match(/<[^>]+>/g) || [];
      let tagIdx = 0;
      let propagated = targetA.replace(/<[^>]+>/g, () => {
        if (tagIdx < tagsInSourceB.length) {
          return tagsInSourceB[tagIdx++];
        }
        return "";
      });
      while (tagIdx < tagsInSourceB.length) {
        propagated += tagsInSourceB[tagIdx++];
      }
      return propagated;
    };

    // Find all duplicate segment indices and their source/target texts in the document
    let matchingSegs = [{ segment_index: segmentIndex, source_text: sourceText, target_text: dbSegment.target_text, original_target_text: dbSegment.original_target_text, tracked_by: dbSegment.tracked_by }];
    if (sourceText) {
      const { data: allSegs } = await supabase
        .from("document_segments")
        .select("segment_index, source_text, target_text, original_target_text, tracked_by")
        .eq("document_id", doc.id);
      
      const cleanedSource = cleanString(sourceText);
      if (allSegs && allSegs.length > 0) {
        matchingSegs = allSegs.filter((s) => cleanString(s.source_text) === cleanedSource);
      }
    }

    const isOwner = doc.owner_id === request.user.id;
    const isTracking = doc.track_changes_enabled && !isOwner;

    // Perform individual updates for each duplicate segment in parallel to preserve original tags
    const updatePromises = matchingSegs.map(async (seg) => {
      const idx = seg.segment_index;
      const segmentFields = { ...updateFields };
      
      if (targetText !== undefined) {
        const newTarget = idx === segmentIndex 
          ? targetText 
          : propagateTranslation(targetText, seg.source_text);
          
        if (isTracking) {
          // If first edit since tracking enabled, store the current target as the original
          if (!seg.original_target_text) {
            segmentFields.original_target_text = seg.target_text || "";
          }
          segmentFields.target_text = newTarget;
          segmentFields.tracked_by = request.user.email;
        } else {
          // Owner edit or tracking disabled: commit directly, clear tracked state
          segmentFields.target_text = newTarget;
          segmentFields.original_target_text = null;
          segmentFields.tracked_by = null;
        }
      }

      // If owner approves the segment, clear tracked changes
      if (isOwner && status === "approved") {
        segmentFields.original_target_text = null;
        segmentFields.tracked_by = null;
      }

      return supabase
        .from("document_segments")
        .update(segmentFields)
        .eq("document_id", doc.id)
        .eq("segment_index", idx);
    });

    const updateResults = await Promise.all(updatePromises);
    const failedUpdate = updateResults.find((r) => r.error);
    if (failedUpdate) {
      console.error("Segment update error:", failedUpdate.error);
      return response.status(500).json({ error: "Failed to update segment." });
    }

    // Broadcast manual save update immediately via Socket.io
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      matchingSegs.forEach((seg) => {
        const idx = seg.segment_index;
        const propagatedTarget = (idx === segmentIndex || targetText === undefined)
          ? targetText 
          : propagateTranslation(targetText, seg.source_text);

        // Compute resulting fields for broadcast
        let finalOriginal = seg.original_target_text;
        let finalTrackedBy = seg.tracked_by;
        if (targetText !== undefined) {
          if (isTracking) {
            if (!seg.original_target_text) {
              finalOriginal = seg.target_text || "";
            }
            finalTrackedBy = request.user.email;
          } else {
            finalOriginal = null;
            finalTrackedBy = null;
          }
        }
        if (isOwner && status === "approved") {
          finalOriginal = null;
          finalTrackedBy = null;
        }

        io.to(doc.id).emit("segment-updated", {
          segmentIndex: idx,
          targetText: propagatedTarget,
          status: status || "translated",
          contextJira,
          contextDescription,
          mqmAccuracyScore: undefined,
          mqmReport: null,
          originalTargetText: finalOriginal,
          trackedBy: finalTrackedBy,
          updatedBy: request.user.email
        });
      });
    }

    // Respond immediately to UI
    response.json({ 
      success: true,
      message: "Segment saved."
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  }
});

// 2a. Translate a single segment with context (Jira, description, and temporary screenshot)
apiRouter.post(
  "/documents/:id/segments/:index/translate-context",
  checkAuth,
  upload.single("screenshot"),
  async (request, response) => {
    let tempPath = null;
    try {
      const doc = await verifyDocumentAccess(request, response, "write");
      if (!doc) return;

      const segmentIndex = parseInt(request.params.index, 10);
      const { contextJira, contextDescription, contextSettings: contextSettingsStr, sourceLang: bodySourceLang, targetLang: bodyTargetLang } = request.body;
      let contextSettings = null;
      if (contextSettingsStr) {
        try {
          contextSettings = JSON.parse(contextSettingsStr);
        } catch (e) {
          console.error("Failed to parse contextSettings in endpoint:", e);
        }
      }
      
      let screenshotBuffer = null;
      let screenshotMimeType = null;

      if (request.file) {
        tempPath = request.file.path;
        screenshotBuffer = fs.readFileSync(tempPath);
        screenshotMimeType = request.file.mimetype;
      }

      const targetLang = bodyTargetLang || doc.target_lang || "hi";
      const sourceLang = bodySourceLang || doc.source_lang || "en";

      // Keep DB document languages in sync if updated in frontend
      if ((bodyTargetLang && bodyTargetLang !== doc.target_lang) || (bodySourceLang && bodySourceLang !== doc.source_lang)) {
        const { error: syncError } = await supabase
          .from("documents")
          .update({
            source_lang: sourceLang,
            target_lang: targetLang
          })
          .eq("id", doc.id);
        if (syncError) {
          console.error("Failed to sync document languages in database:", syncError);
        }
      }

      // Fetch the segment source text and existing target text, along with sibling segments for context
      const { data: segment, error: fetchErr } = await supabase
        .from("document_segments")
        .select("source_text, target_text")
        .eq("document_id", doc.id)
        .eq("segment_index", segmentIndex)
        .single();

      if (fetchErr || !segment) {
        return response.status(404).json({ error: "Segment not found." });
      }

      const { data: siblingSegments } = await supabase
        .from("document_segments")
        .select("segment_index, source_text, target_text")
        .eq("document_id", doc.id)
        .in("segment_index", [segmentIndex - 1, segmentIndex + 1]);

      const prevSegment = siblingSegments?.find(s => s.segment_index === segmentIndex - 1);
      const nextSegment = siblingSegments?.find(s => s.segment_index === segmentIndex + 1);

      // Execute on-the-fly vision/context aware translation
      const { translateSegmentWithContext } = require("../services/translationService");
      const translationResult = await translateSegmentWithContext({
        sourceText: segment.source_text,
        existingTranslation: segment.target_text || "",
        targetLang,
        sourceLang,
        contextJira,
        contextDescription,
        screenshotBuffer,
        screenshotMimeType,
        contextSettings,
        prevSource: prevSegment?.source_text,
        prevTarget: prevSegment?.target_text,
        nextSource: nextSegment?.source_text,
        nextTarget: nextSegment?.target_text
      });

      // Update segment target text and status in database
      const { error: updateError } = await supabase
        .from("document_segments")
        .update({
          target_text: translationResult.translated,
          context_jira: contextJira || null,
          context_description: contextDescription || null,
          mqm_accuracy_score: translationResult.mqmAccuracyScore !== undefined ? translationResult.mqmAccuracyScore : null,
          mqm_report: translationResult.mqmReport || null,
          status: "translated",
          updated_at: new Date().toISOString()
        })
        .eq("document_id", doc.id)
        .eq("segment_index", segmentIndex);

      if (updateError) {
        console.error("Segment context update error:", updateError);
        return response.status(500).json({ error: "Failed to save translated segment." });
      }

      // Broadcast update via Socket.io
      const { getIo } = require("../services/socket");
      const io = getIo();
      if (io) {
        io.to(doc.id).emit("segment-updated", {
          segmentIndex,
          targetText: translationResult.translated,
          status: "translated",
          contextJira,
          contextDescription,
          mqmAccuracyScore: translationResult.mqmAccuracyScore,
          mqmReport: translationResult.mqmReport,
          updatedBy: request.user.email
        });
      }

      response.json({
        success: true,
        translated: translationResult.translated,
        qaIssues: translationResult.qaIssues,
        mqmAccuracyScore: translationResult.mqmAccuracyScore,
        mqmReport: translationResult.mqmReport
      });
    } catch (error) {
      console.error("Translate context endpoint exception:", error);
      response.status(500).json({ error: error.message || "Failed to translate with context." });
    } finally {
      // Clean up the temporary screenshot file immediately
      if (tempPath && fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (unlinkErr) {
          console.error("Failed to delete temporary screenshot file:", unlinkErr);
        }
      }
    }
  }
);

// ── Document-Wide Audit APIs ──

// 1. Pre-flight Estimate
apiRouter.post("/documents/:id/audit/estimate", checkAuth, async (request, response) => {
  const documentId = request.params.id;
  try {
    const doc = await verifyDocumentAccess(request, response, "write");
    if (!doc) return;

    const { data: segments, error: fetchErr } = await supabase
      .from("document_segments")
      .select("source_text")
      .eq("document_id", documentId);

    if (fetchErr || !segments) {
      return response.status(500).json({ error: "Failed to fetch document segments." });
    }

    const segmentCount = segments.length;
    let totalWordCount = 0;
    segments.forEach(seg => {
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

// 2. Start Background Audit
apiRouter.post("/documents/:id/audit/start", checkAuth, async (request, response) => {
  const documentId = request.params.id;
  try {
    const doc = await verifyDocumentAccess(request, response, "write");
    if (!doc) return;

    // Check if there is already an active job for this document
    const { data: activeJobs, error: selectError } = await supabase
      .from("audit_jobs")
      .select("*")
      .eq("document_id", documentId)
      .in("status", ["pending", "in_progress"]);

    if (selectError) {
      console.error("Select active jobs error:", selectError);
      if (selectError.code === 'PGRST205' || selectError.message?.includes("audit_jobs")) {
        return response.status(500).json({ error: "Database table 'audit_jobs' is missing. Please run the SQL migration script (server/src/config/migration.sql) in your Supabase SQL Editor to create it." });
      }
      return response.status(500).json({ error: selectError.message || "Failed to query audit jobs." });
    }

    if (activeJobs && activeJobs.length > 0) {
      return response.status(400).json({ error: "An audit is already running for this document." });
    }

    // Insert pending job record
    const { data: job, error: jobErr } = await supabase
      .from("audit_jobs")
      .insert({
        document_id: documentId,
        status: "pending"
      })
      .select()
      .single();

    if (jobErr || !job) {
      console.error("Failed to create audit job:", jobErr);
      if (jobErr && (jobErr.code === 'PGRST205' || jobErr.message?.includes("audit_jobs"))) {
        return response.status(500).json({ error: "Database table 'audit_jobs' is missing. Please run the SQL migration script (server/src/config/migration.sql) in your Supabase SQL Editor to create it." });
      }
      return response.status(500).json({ error: "Failed to initiate audit job." });
    }

    response.json({
      success: true,
      jobId: job.id,
      message: "Background audit started."
    });

    // Start background worker
    (async () => {
      try {
        const { auditDocumentMQM } = require("../services/mqmService");
        await auditDocumentMQM(documentId, job.id);
      } catch (err) {
        console.error(`[Background Audit Crash] Job ${job.id}:`, err);
      }
    })();

  } catch (error) {
    console.error("Start audit failed:", error);
    if (error.message?.includes("audit_jobs") || String(error).includes("audit_jobs")) {
      return response.status(500).json({ error: "Database table 'audit_jobs' is missing. Please run the SQL migration script (server/src/config/migration.sql) in your Supabase SQL Editor to create it." });
    }
    response.status(500).json({ error: "Internal server error." });
  }
});

// 3. Cancel Background Audit
apiRouter.post("/documents/:id/audit/cancel/:jobId", checkAuth, async (request, response) => {
  const documentId = request.params.id;
  const jobId = request.params.jobId;
  try {
    const doc = await verifyDocumentAccess(request, response, "write");
    if (!doc) return;

    const { error } = await supabase
      .from("audit_jobs")
      .update({
        status: "cancelled",
        error_message: "Cancelled by user",
        updated_at: new Date().toISOString()
      })
      .eq("id", jobId)
      .eq("document_id", documentId);

    if (error) {
      console.error("Failed to cancel job:", error);
      if (error.code === 'PGRST205' || error.message?.includes("audit_jobs")) {
        return response.status(500).json({ error: "Database table 'audit_jobs' is missing. Please run the SQL migration script (server/src/config/migration.sql) in your Supabase SQL Editor to create it." });
      }
      return response.status(500).json({ error: "Failed to request cancellation." });
    }

    response.json({ success: true, message: "Audit cancellation requested successfully." });
  } catch (error) {
    console.error("Cancel audit failed:", error);
    if (error.message?.includes("audit_jobs") || String(error).includes("audit_jobs")) {
      return response.status(500).json({ error: "Database table 'audit_jobs' is missing. Please run the SQL migration script (server/src/config/migration.sql) in your Supabase SQL Editor to create it." });
    }
    response.status(500).json({ error: "Internal server error." });
  }
});

// 4. Check Background Audit Status & Cleanup Stale
apiRouter.get("/documents/:id/audit/status/:jobId", checkAuth, async (request, response) => {
  const documentId = request.params.id;
  const jobId = request.params.jobId;
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;

    // Stale jobs cleanup: in_progress job updated > 30 minutes ago is marked failed
    const staleLimit = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    // Gracefully handle case where audit_jobs table does not exist
    const { error: cleanupError } = await supabase
      .from("audit_jobs")
      .update({
        status: "failed",
        error_message: "Job stale / timed out.",
        updated_at: new Date().toISOString()
      })
      .eq("status", "in_progress")
      .lt("updated_at", staleLimit);

    if (cleanupError && (cleanupError.code === 'PGRST205' || cleanupError.message?.includes("audit_jobs"))) {
      return response.status(500).json({ error: "Database table 'audit_jobs' is missing. Please run the SQL migration script (server/src/config/migration.sql) in your Supabase SQL Editor to create it." });
    }

    const { data: job, error } = await supabase
      .from("audit_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("document_id", documentId)
      .single();

    if (error || !job) {
      if (error && (error.code === 'PGRST205' || error.message?.includes("audit_jobs"))) {
        return response.status(500).json({ error: "Database table 'audit_jobs' is missing. Please run the SQL migration script (server/src/config/migration.sql) in your Supabase SQL Editor to create it." });
      }
      return response.status(404).json({ error: "Audit job not found." });
    }

    response.json(job);
  } catch (error) {
    console.error("Fetch audit status failed:", error);
    if (error.message?.includes("audit_jobs") || String(error).includes("audit_jobs")) {
      return response.status(500).json({ error: "Database table 'audit_jobs' is missing. Please run the SQL migration script (server/src/config/migration.sql) in your Supabase SQL Editor to create it." });
    }
    response.status(500).json({ error: "Internal server error." });
  }
});

// Deprecated endpoint forward compatibility
apiRouter.post("/documents/:id/audit", checkAuth, async (request, response) => {
  const documentId = request.params.id;
  try {
    const doc = await verifyDocumentAccess(request, response, "write");
    if (!doc) return;
    
    const { data: job } = await supabase
      .from("audit_jobs")
      .insert({ document_id: documentId, status: "pending" })
      .select()
      .single();

    response.json({ success: true, message: "Document audit started in the background." });

    if (job) {
      (async () => {
        const { auditDocumentMQM } = require("../services/mqmService");
        await auditDocumentMQM(documentId, job.id);
      })();
    }
  } catch (e) {
    response.json({ success: true, message: "Document audit started in the background." });
  }
});

// 3. Get list of users with explicit access
apiRouter.get("/documents/:id/access", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;

    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile.role);
    if (!isStaff && doc.owner_id !== request.user.id) {
      return response.status(403).json({ error: "Access management restricted to owner or staff." });
    }

    const { data: accesses, error: accessError } = await supabase
      .from("document_access")
      .select(`
        id,
        user_id,
        permission,
        profiles (
          email
        )
      `)
      .eq("document_id", doc.id);

    if (accessError) {
      console.error("Failed to fetch access details:", accessError);
      return response.status(500).json({ error: "Failed to load access list." });
    }

    const list = accesses.map(acc => ({
      userId: acc.user_id,
      permission: acc.permission,
      email: acc.profiles?.email || "Unknown",
      name: acc.profiles?.email ? acc.profiles.email.split("@")[0] : "Unknown"
    }));

    response.json(list);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  }
});

// 4. Grant access to a user by email
apiRouter.post("/documents/:id/access", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;

    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile.role);
    if (!isStaff && doc.owner_id !== request.user.id) {
      return response.status(403).json({ error: "Access management restricted to owner or staff." });
    }

    const { email, permission } = request.body;
    if (!email) {
      return response.status(400).json({ error: "User email is required." });
    }

    const { data: targetUser, error: findError } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", email.trim().toLowerCase())
      .single();

    if (findError || !targetUser) {
      return response.status(404).json({ error: "User not found with this email." });
    }

    if (targetUser.id === doc.owner_id) {
      return response.status(400).json({ error: "Owner already has full access." });
    }

    const { error: insertError } = await supabase
      .from("document_access")
      .upsert({
        document_id: doc.id,
        user_id: targetUser.id,
        permission: permission || "read"
      }, { onConflict: "document_id,user_id" });

    if (insertError) {
      console.error("Failed to grant access:", insertError);
      return response.status(500).json({ error: "Failed to grant access." });
    }

    response.json({ success: true, userId: targetUser.id, name: targetUser.email.split("@")[0] });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  }
});

// 5. Revoke access from a user
apiRouter.delete("/documents/:id/access/:userId", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;

    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile.role);
    if (!isStaff && doc.owner_id !== request.user.id) {
      return response.status(403).json({ error: "Access management restricted to owner or staff." });
    }

    const targetUserId = request.params.userId;

    const { error: deleteError } = await supabase
      .from("document_access")
      .delete()
      .eq("document_id", doc.id)
      .eq("user_id", targetUserId);

    if (deleteError) {
      console.error("Failed to revoke access:", deleteError);
      return response.status(500).json({ error: "Failed to revoke access." });
    }

    // Broadcast real-time access revocation to lock out the user instantly
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      io.to(doc.id).emit("access-revoked", { userId: targetUserId, documentId: doc.id });
    }

    response.json({ success: true });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  }
});

// Update document source and target languages
apiRouter.put("/documents/:id/languages", checkAuth, async (request, response) => {
  const documentId = request.params.id;
  const { sourceLang, targetLang } = request.body;
  try {
    const doc = await verifyDocumentAccess(request, response, "write");
    if (!doc) return;

    const { error } = await supabase
      .from("documents")
      .update({
        source_lang: sourceLang,
        target_lang: targetLang
      })
      .eq("id", documentId);

    if (error) {
      console.error("Failed to update document languages:", error);
      return response.status(500).json({ error: "Failed to update document languages." });
    }

    response.json({ success: true });
  } catch (error) {
    console.error("Update languages failed:", error);
    response.status(500).json({ error: "Internal server error." });
  }
});

// 5a. Get user request status
apiRouter.get("/documents/:id/request-status", checkAuth, async (request, response) => {
  try {
    const documentId = request.params.id;
    const userId = request.user.id;

    const { data: req, error } = await supabase
      .from("document_access_requests")
      .select("status")
      .eq("document_id", documentId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    if (error) {
      return handleDatabaseError(error, response, "Failed to get request status.");
    }

    response.json({ hasPendingRequest: !!req });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Server error." });
  }
});

// 5b. Request access to a document
apiRouter.post("/documents/:id/request-access", checkAuth, async (request, response) => {
  try {
    const documentId = request.params.id;
    const userId = request.user.id;
    const userEmail = request.user.email;
    const userName = request.profile.full_name || userEmail.split("@")[0];

    // Fetch document details to get owner_id and name
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("owner_id, name")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      return response.status(404).json({ error: "Document not found." });
    }

    // Insert or update access request
    const { error: insertError } = await supabase
      .from("document_access_requests")
      .upsert({
        document_id: documentId,
        user_id: userId,
        status: "pending",
        created_at: new Date().toISOString()
      }, { onConflict: "document_id,user_id" });

    if (insertError) {
      return handleDatabaseError(insertError, response, "Failed to submit access request.");
    }

    // Broadcast to room via Socket.io
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      const payload = {
        id: documentId + "-" + userId,
        documentId,
        docName: doc.name,
        userId,
        userEmail,
        userName
      };

      const { data: accessReq } = await supabase
        .from("document_access_requests")
        .select("id")
        .eq("document_id", documentId)
        .eq("user_id", userId)
        .single();
      
      if (accessReq) {
        payload.id = accessReq.id;
      }

      // Send to owner's personal room
      io.to(`user:${doc.owner_id}`).emit("access-request-received", payload);
      // Send to staff group room
      io.to("verbolabs_staff").emit("access-request-received", payload);
    }

    response.json({ success: true });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Server error." });
  }
});

// 5c. Get list of pending access requests for a document
apiRouter.get("/documents/:id/access-requests", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;

    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile.role);
    if (!isStaff && doc.owner_id !== request.user.id) {
      return response.status(403).json({ error: "Access management restricted to owner or staff." });
    }

    const { data: requests, error } = await supabase
      .from("document_access_requests")
      .select(`
        id,
        document_id,
        user_id,
        status,
        created_at,
        profiles (
          email
        )
      `)
      .eq("document_id", doc.id)
      .eq("status", "pending");

    if (error) {
      return handleDatabaseError(error, response, "Failed to load access requests.");
    }

    response.json(requests || []);
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Server error." });
  }
});

// 5d. Respond to access request
apiRouter.post("/documents/:id/access-requests/:requestId/respond", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;

    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile.role);
    if (!isStaff && doc.owner_id !== request.user.id) {
      return response.status(403).json({ error: "Access management restricted to owner or staff." });
    }

    const { requestId } = request.params;
    const { action } = request.body; // 'approve' or 'reject'

    if (!["approve", "reject"].includes(action)) {
      return response.status(400).json({ error: "Invalid action. Must be approve or reject." });
    }

    // Fetch the request details to know the user_id
    const { data: accessReq, error: fetchReqError } = await supabase
      .from("document_access_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (fetchReqError || !accessReq) {
      if (fetchReqError) {
        return handleDatabaseError(fetchReqError, response, "Failed to fetch access request.");
      }
      return response.status(404).json({ error: "Access request not found." });
    }

    const targetUserId = accessReq.user_id;

    // Update request status
    const newStatus = action === "approve" ? "approved" : "rejected";
    const { error: updateReqError } = await supabase
      .from("document_access_requests")
      .update({ status: newStatus })
      .eq("id", requestId);

    if (updateReqError) {
      return handleDatabaseError(updateReqError, response, "Failed to update request status.");
    }

    if (action === "approve") {
      // Grant write access to the user
      const { error: grantError } = await supabase
        .from("document_access")
        .upsert({
          document_id: doc.id,
          user_id: targetUserId,
          permission: "write"
        }, { onConflict: "document_id,user_id" });

      if (grantError) {
        console.error(grantError);
        return response.status(500).json({ error: "Failed to grant access on approval." });
      }
    }

    // Broadcast update via Socket.io to the target user and the room
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      // Notify the requester
      io.to(`user:${targetUserId}`).emit("access-request-responded", {
        documentId: doc.id,
        action,
        userId: targetUserId
      });
      // Notify the room to update active list/locks
      io.to(doc.id).emit("access-request-processed", {
        requestId,
        action,
        userId: targetUserId
      });
    }

    response.json({ success: true });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Server error." });
  }
});

// Toggle Track Changes (Owner Only)
apiRouter.post("/documents/:id/track-changes", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;

    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile.role);
    if (!isStaff && doc.owner_id !== request.user.id) {
      return response.status(403).json({ error: "Only the document creator can toggle Track Changes." });
    }

    const { enabled } = request.body;
    if (enabled === undefined) {
      return response.status(400).json({ error: "Missing 'enabled' boolean in request body." });
    }

    const { error } = await supabase
      .from("documents")
      .update({ track_changes_enabled: !!enabled })
      .eq("id", doc.id);

    if (error) {
      return handleDatabaseError(error, response, "Failed to update track changes status.");
    }

    // Broadcast track changes toggle via Socket.io
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      io.to(doc.id).emit("track-changes-toggled", {
        documentId: doc.id,
        enabled: !!enabled
      });
    }

    response.json({ success: true, enabled: !!enabled });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Server error." });
  }
});

// Accept Change (Owner Only)
apiRouter.post("/documents/:id/segments/:index/accept-change", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;

    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile.role);
    if (!isStaff && doc.owner_id !== request.user.id) {
      return response.status(403).json({ error: "Only the document creator can accept tracked changes." });
    }

    const segmentIndex = parseInt(request.params.index, 10);

    // Fetch the segment to find duplicates
    const { data: dbSegment } = await supabase
      .from("document_segments")
      .select("source_text")
      .eq("document_id", doc.id)
      .eq("segment_index", segmentIndex)
      .single();

    if (!dbSegment) {
      return response.status(404).json({ error: "Segment not found." });
    }

    const sourceText = dbSegment.source_text;

    // Helper to clean string
    const cleanString = (str) => {
      if (!str) return "";
      return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    };

    // Find duplicates to accept on all of them
    let matchingSegs = [{ segment_index: segmentIndex }];
    if (sourceText) {
      const { data: allSegs } = await supabase
        .from("document_segments")
        .select("segment_index, source_text")
        .eq("document_id", doc.id);
      
      const cleanedSource = cleanString(sourceText);
      if (allSegs && allSegs.length > 0) {
        matchingSegs = allSegs.filter((s) => cleanString(s.source_text) === cleanedSource);
      }
    }

    const matchingIndices = matchingSegs.map(s => s.segment_index);

    // Commit change by clearing original text and tracked_by
    const { error } = await supabase
      .from("document_segments")
      .update({
        original_target_text: null,
        tracked_by: null,
        updated_at: new Date().toISOString()
      })
      .eq("document_id", doc.id)
      .in("segment_index", matchingIndices);

    if (error) {
      return handleDatabaseError(error, response, "Failed to accept change.");
    }

    // Broadcast accept to all clients
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      matchingIndices.forEach((idx) => {
        io.to(doc.id).emit("segment-updated", {
          segmentIndex: idx,
          mqmAccuracyScore: undefined,
          mqmReport: null,
          originalTargetText: null,
          trackedBy: null,
          updatedBy: request.user.email
        });
      });
    }

    response.json({ success: true });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Server error." });
  }
});

// Reject Change (Owner Only)
apiRouter.post("/documents/:id/segments/:index/reject-change", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;

    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile.role);
    if (!isStaff && doc.owner_id !== request.user.id) {
      return response.status(403).json({ error: "Only the document creator can reject tracked changes." });
    }

    const segmentIndex = parseInt(request.params.index, 10);

    // Fetch the segment to find duplicates and get its original target text
    const { data: dbSegment } = await supabase
      .from("document_segments")
      .select("source_text, original_target_text")
      .eq("document_id", doc.id)
      .eq("segment_index", segmentIndex)
      .single();

    if (!dbSegment) {
      return response.status(404).json({ error: "Segment not found." });
    }

    const sourceText = dbSegment.source_text;

    // Helper to clean string
    const cleanString = (str) => {
      if (!str) return "";
      return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    };

    // Find duplicates to revert
    let matchingSegs = [{ segment_index: segmentIndex, original_target_text: dbSegment.original_target_text }];
    if (sourceText) {
      const { data: allSegs } = await supabase
        .from("document_segments")
        .select("segment_index, source_text, original_target_text")
        .eq("document_id", doc.id);
      
      const cleanedSource = cleanString(sourceText);
      if (allSegs && allSegs.length > 0) {
        matchingSegs = allSegs.filter((s) => cleanString(s.source_text) === cleanedSource);
      }
    }

    // Perform individual reverts (setting target_text back to original_target_text and clearing tracked fields)
    const updatePromises = matchingSegs.map(async (seg) => {
      const revertedTarget = seg.original_target_text !== null ? seg.original_target_text : "";
      return supabase
        .from("document_segments")
        .update({
          target_text: revertedTarget,
          original_target_text: null,
          tracked_by: null,
          updated_at: new Date().toISOString()
        })
        .eq("document_id", doc.id)
        .eq("segment_index", seg.segment_index);
    });

    const updateResults = await Promise.all(updatePromises);
    const failedUpdate = updateResults.find((r) => r.error);
    if (failedUpdate) {
      return handleDatabaseError(failedUpdate.error, response, "Failed to reject change.");
    }

    // Broadcast reject/revert to all clients via Socket.io
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      matchingSegs.forEach((seg) => {
        const revertedTarget = seg.original_target_text !== null ? seg.original_target_text : "";
        io.to(doc.id).emit("segment-updated", {
          segmentIndex: seg.segment_index,
          targetText: revertedTarget,
          mqmAccuracyScore: undefined,
          mqmReport: null,
          originalTargetText: null,
          trackedBy: null,
          updatedBy: request.user.email
        });
      });
    }

    response.json({ success: true });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Server error." });
  }
});

// Accept All Changes (Owner Only)
apiRouter.post("/documents/:id/accept-all-changes", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;

    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile.role);
    if (!isStaff && doc.owner_id !== request.user.id) {
      return response.status(403).json({ error: "Only the document creator can accept all changes." });
    }

    // Clear tracking columns on all segments of this document
    const { error } = await supabase
      .from("document_segments")
      .update({
        original_target_text: null,
        tracked_by: null,
        updated_at: new Date().toISOString()
      })
      .eq("document_id", doc.id);

    if (error) {
      return handleDatabaseError(error, response, "Failed to accept all changes.");
    }

    // Broadcast update via Socket.io
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      io.to(doc.id).emit("all-changes-accepted", {
        documentId: doc.id,
        updatedBy: request.user.email
      });
    }

    response.json({ success: true });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Server error." });
  }
});

module.exports = {
  apiRouter
};
