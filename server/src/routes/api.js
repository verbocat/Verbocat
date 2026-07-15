const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { processUploadedFile, exportHtml } = require("../services/fileService");
const { translateSegments } = require("../services/translationService");
const { getProviderStatus } = require("../services/translationProviders");
const { supabase, fetchAllSegments } = require("../config/supabase");
const { checkAuth, checkTranslateAccess } = require("../utils/authMiddleware");
const { getDocumentRoomId } = require("../services/socket");
const { calculateProgress } = require("../utils/segmentProgress");
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

const countWords = (text) => {
  if (!text) return 0;
  const clean = String(text)
    .replace(/<[^>]+>/g, "")
    .replace(/__TAG_\d+__/g, "")
    .trim();
  if (!clean) return 0;
  return clean.split(/\s+/).filter(w => w.length > 0).length;
};

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
    const statusCode = (error.status >= 100 && error.status < 1000) ? error.status : 500;
    response.status(statusCode).json({
      error: error.message || "Server error"
    });
  }
});

apiRouter.post("/translate-batch", checkAuth, checkTranslateAccess, async (request, response) => {
  try {
    const { segments, target, source, contextSettings, fileName, documentId } = request.body;
    let fileExtension = "";
    if (documentId) {
      const { data: doc } = await supabase.from("documents").select("file_extension").eq("id", documentId).single();
      if (doc) {
        fileExtension = doc.file_extension || "";
      }
    }
    const updatedContextSettings = { ...contextSettings, fileExtension };
    const { results, wordCount } = await translateSegments(segments, target, source, updatedContextSettings, request.user.id);
    
    // Save translations to document_segments in DB if documentId is provided
    if (documentId && results && results.length > 0) {
      const { getIo } = require("../services/socket");
      const io = getIo();

      const updatePromises = results.map(async (item) => {
        const segmentIndex = item.id - 1; // client IDs are 1-indexed

        const { isLegitimatelyIdentical } = require("../services/translationProviders");
        const cleanSource = String(item.source || "").replace(/<[^>]+>/g, "").trim();
        const cleanTranslated = String(item.translated || "").replace(/<[^>]+>/g, "").trim();

        const isFallback = target !== source &&
          item.translated &&
          item.source &&
          cleanTranslated.toLowerCase() === cleanSource.toLowerCase() &&
          /\p{L}/u.test(cleanSource) &&
          !isLegitimatelyIdentical(cleanSource);

        const updateFields = {
          target_text: isFallback ? "" : item.translated,
          status: isFallback ? "draft" : "translated",
          updated_at: new Date().toISOString()
        };

        if (!isFallback) {
          updateFields.mqm_accuracy_score = item.mqmAccuracyScore !== undefined ? item.mqmAccuracyScore : 100;
          updateFields.mqm_report = item.mqmReport || null;
        }

        const { error } = await supabase
          .from("document_segments")
          .update(updateFields)
          .eq("document_id", documentId)
          .eq("target_lang", target)
          .eq("segment_index", segmentIndex);

        if (error) {
          console.error(`Failed to save auto-translated segment index ${segmentIndex} for document ${documentId}:`, error);
        } else {
          // Broadcast to other collaborative clients in real time
          if (io) {
            io.to(getDocumentRoomId(documentId, target)).emit("segment-updated", {
              segmentIndex,
              targetText: updateFields.target_text,
              status: updateFields.status,
              mqmAccuracyScore: updateFields.mqm_accuracy_score,
              mqmReport: updateFields.mqm_report,
              updatedBy: request.user.email,
              targetLang: target
            });
          }
        }
      });

      await Promise.all(updatePromises);

      // Recalculate job progress and update translation_jobs in database
      try {
        const segmentsInDb = await fetchAllSegments(documentId, "source_text, status, target_text", target);
        const progress = calculateProgress(segmentsInDb).progress;
        const newStatus = progress === 100 ? "completed" : "running";

        const { data: job } = await supabase
          .from("translation_jobs")
          .select("id")
          .eq("document_id", documentId)
          .eq("target_lang", target)
          .single();

        if (job) {
          await supabase
            .from("translation_jobs")
            .update({ progress, status: newStatus })
            .eq("id", job.id);

          const { broadcastJobStatus } = require("../services/jobQueue");
          broadcastJobStatus(job.id, documentId, newStatus, progress);
        }
      } catch (jobUpdateErr) {
        console.error("Failed to update job stats in translate-batch:", jobUpdateErr);
      }
    }

    // Log credit consumption and update database profiles
    if (wordCount > 0) {
      const email = request.profile.email;
      const userId = request.profile.id;
      const isSeo = contextSettings?.purpose === "SEO";
      const actionName = isSeo ? "translate-batch (SEO)" : "translate-batch";

      // 1. Log credit entry in credit_logs
      await supabase.from("credit_logs").insert({
        user_id: userId,
        email: email,
        action: actionName,
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

    response.json({ results });
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

    const buffer = await exportHtml(fileId, exportSegments, ext, targetLang);

    response.setHeader(
      "Content-Disposition",
      `attachment; filename=translated${ext}`
    );
    
    let contentType = "application/octet-stream";
    if (ext === ".html") contentType = "text/html";
    else if (ext === ".txt") contentType = "text/plain";
    else if (ext === ".pdf") contentType = "application/pdf";
    else if (ext === ".docx") contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    else if (ext === ".pptx") contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    else if (ext === ".xlsx") contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    response.setHeader("Content-Type", contentType);
    response.send(buffer);
  } catch (error) {
    console.log(error);
    const statusCode = (error.status >= 100 && error.status < 1000) ? error.status : 500;
    response.status(statusCode).json({
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

// Helper to log project activity
async function logProjectActivity(projectId, eventType, details, userName) {
  try {
    const { error } = await supabase
      .from("project_activities")
      .insert({
        project_id: projectId,
        event_type: eventType,
        details: details || {},
        user_name: userName || "System"
      });
    
    if (error) {
      // Fallback: append to project settings JSONB
      if (error.code === 'PGRST205' || error.message.includes("project_activities") || error.message.includes("does not exist")) {
        const { data: project } = await supabase
          .from("projects")
          .select("settings")
          .eq("id", projectId)
          .single();
        if (project) {
          const currentSettings = project.settings || {};
          const activities = currentSettings.activities || [];
          activities.unshift({
            id: Math.random().toString(36).substr(2, 9),
            project_id: projectId,
            event_type: eventType,
            details: details || {},
            user_name: userName || "System",
            created_at: new Date().toISOString()
          });
          await supabase
            .from("projects")
            .update({ settings: { ...currentSettings, activities } })
            .eq("id", projectId);
        }
      } else {
        console.error("Failed to log activity:", error);
      }
    }
  } catch (err) {
    console.error("Error logging project activity:", err);
  }
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

  // Check public access first
  if (doc.public_access === "write" || (requiredPermission === "read" && doc.public_access === "read")) {
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

// Helper to detect document extension from either its stored name or html_files template content
async function detectFileExtension(fileId, docName) {
  if (docName) {
    const extIndex = docName.lastIndexOf(".");
    if (extIndex !== -1) {
      const ext = docName.substring(extIndex).toLowerCase();
      if ([".pdf", ".docx", ".xlsx", ".pptx", ".html", ".htm", ".txt", ".xlf", ".xliff"].includes(ext)) {
        return ext;
      }
    }
  }

  if (!fileId) return ".html";

  try {
    const { data, error } = await supabase
      .from("html_files")
      .select("content")
      .eq("id", fileId)
      .single();

    if (error || !data || !data.content) {
      return ".html";
    }

    // Try parsing as combined PDF data
    try {
      const rawJson = Buffer.from(data.content, 'base64').toString('utf-8');
      const combinedData = JSON.parse(rawJson);
      if (combinedData && combinedData.originalPdfBytes && combinedData.docxTemplate) {
        return ".pdf";
      }
    } catch (_) {}

    // Try parsing as gzip PDF template
    try {
      const zlib = require('zlib');
      const buf = Buffer.from(data.content, 'base64');
      let rawJson;
      try { rawJson = zlib.gunzipSync(buf).toString('utf-8'); } catch (_) { rawJson = data.content; }
      const templateData = JSON.parse(rawJson);
      if (templateData && templateData.pdfBytes && templateData.items) {
        return ".pdf";
      }
    } catch (_) {}
  } catch (err) {
    console.error("Error detecting file extension:", err);
  }

  return ".html";
}

// 1. Fetch document metadata and segments
apiRouter.get("/documents/:id", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;

    // Fetch segments
    let segments;
    try {
      segments = await fetchAllSegments(doc.id, "*", doc.target_lang);
    } catch (segError) {
      console.error("Failed to load document segments:", segError);
      return response.status(500).json({ error: "Failed to load document segments." });
    }

    // Determine current user's permission level ('read' or 'write')
    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile.role);
    let userPermission = "read";
    if (isStaff || doc.owner_id === request.user.id) {
      userPermission = "write";
    } else {
      if (doc.public_access === "write") {
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
        } else if (doc.public_access === "read") {
          userPermission = "read";
        }
      }
    }

    // Map to client format
    const formattedSegments = segments.map(seg => ({
      id: seg.segment_index + 1,
      source: seg.source_text,
      target: seg.target_text || "",
      status: seg.status,
      verified: seg.status === "approved",
      contextJira: seg.context_jira || "",
      contextDescription: seg.context_description || "",
      mqmAccuracyScore: seg.mqm_accuracy_score !== undefined && seg.mqm_accuracy_score !== null ? seg.mqm_accuracy_score : 100,
      mqmReport: seg.mqm_report || null,
      originalTargetText: seg.original_target_text || null,
      trackedBy: seg.tracked_by || null
    }));

    const fileExtension = await detectFileExtension(doc.file_id, doc.name);

    response.json({
      documentId: doc.id,
      name: doc.name,
      ownerId: doc.owner_id,
      fileId: doc.file_id,
      sourceLang: doc.source_lang,
      targetLang: doc.target_lang,
      permission: userPermission,
      trackChangesEnabled: doc.track_changes_enabled || false,
      publicAccess: doc.public_access || "none",
      segments: formattedSegments,
      fileExtension
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  }
});

// Delete Document / Project
apiRouter.delete("/documents/:id", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "write");
    if (!doc) return;

    // Check if the current user is the owner (or staff/admin)
    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile.role);
    if (!isStaff && doc.owner_id !== request.user.id) {
      return response.status(403).json({ error: "Only the project owner can delete this project." });
    }

    // Delete document (this will ON DELETE CASCADE delete segments, access, requests etc.)
    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("id", doc.id);

    if (deleteError) {
      console.error("Failed to delete document:", deleteError);
      return response.status(500).json({ error: "Failed to delete project." });
    }

    response.json({ message: "Project deleted successfully." });
  } catch (err) {
    console.error("Error in delete document:", err);
    response.status(500).json({ error: "Server error." });
  }
});

// Rename Document
apiRouter.put("/documents/:id/rename", checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { name } = request.body;
    if (!name) return response.status(400).json({ error: "Name is required" });

    const doc = await verifyDocumentAccess(request, response, "write");
    if (!doc) return;

    const { error: updateError } = await supabase
      .from("documents")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      return response.status(500).json({ error: updateError.message });
    }

    if (doc.project_id) {
      await logProjectActivity(doc.project_id, "context_updated", {
        action: "document_renamed",
        oldName: doc.name,
        newName: name
      }, request.user.email);
    }

    response.json({ success: true, name });
  } catch (err) {
    console.error("Error in rename document:", err);
    response.status(500).json({ error: "Server error." });
  }
});

// Duplicate Document
apiRouter.post("/documents/:id/duplicate", checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const doc = await verifyDocumentAccess(request, response, "write");
    if (!doc) return;

    const { v4: uuidv4 } = require("uuid");
    const newDocId = uuidv4 ? uuidv4() : Math.random().toString(36).substr(2, 9);
    const extIndex = doc.name.lastIndexOf(".");
    const baseName = extIndex !== -1 ? doc.name.substring(0, extIndex) : doc.name;
    const ext = extIndex !== -1 ? doc.name.substring(extIndex) : "";
    const newDocName = `${baseName} (Copy)${ext}`;

    // 1. Insert new document record
    const { error: docError } = await supabase
      .from("documents")
      .insert({
        id: newDocId,
        name: newDocName,
        owner_id: request.user.id,
        file_id: doc.file_id,
        source_lang: doc.source_lang,
        project_id: doc.project_id,
        word_count: doc.word_count,
        file_size: doc.file_size,
        status: doc.status
      });

    if (docError) {
      return response.status(500).json({ error: docError.message });
    }

    // 2. Fetch all segments of the original document
    const segments = await fetchAllSegments(id, "*", null); // all target languages and templates
    if (segments && segments.length > 0) {
      const segmentInserts = segments.map(seg => ({
        document_id: newDocId,
        target_lang: seg.target_lang,
        segment_index: seg.segment_index,
        source_text: seg.source_text,
        target_text: seg.target_text,
        status: seg.status,
        context_jira: seg.context_jira,
        context_description: seg.context_description
      }));
      await supabase.from("document_segments").insert(segmentInserts);
    }

    // 3. Fetch and duplicate translation jobs
    const { data: jobs } = await supabase
      .from("translation_jobs")
      .select("*")
      .eq("document_id", id);

    if (jobs && jobs.length > 0) {
      const jobInserts = jobs.map(job => ({
        project_id: job.project_id,
        document_id: newDocId,
        target_lang: job.target_lang,
        status: job.status,
        progress: job.progress,
        word_count: job.word_count,
        error_message: job.error_message
      }));
      await supabase.from("translation_jobs").insert(jobInserts);
    }

    if (doc.project_id) {
      await logProjectActivity(doc.project_id, "file_uploaded", {
        fileName: newDocName,
        action: "document_duplicated",
        originalName: doc.name
      }, request.user.email);
    }

    response.json({ success: true, newDocId, newDocName });
  } catch (err) {
    console.error("Error in duplicate document:", err);
    response.status(500).json({ error: "Server error." });
  }
});

// 2. Update a single segment
apiRouter.put("/documents/:id/segments/:index", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "write");
    if (!doc) return;

    const segmentIndex = parseInt(request.params.index, 10);
    const { targetText, status, contextJira, contextDescription, autoPropagate } = request.body;

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
      .select("source_text, target_lang, context_jira, context_description, target_text, original_target_text, tracked_by")
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
    if (sourceText && autoPropagate !== false) {
      let allSegs;
      try {
        allSegs = await fetchAllSegments(doc.id, "segment_index, source_text, target_text, original_target_text, tracked_by", dbSegment.target_lang);
      } catch (err) {
        console.error("Failed to fetch all segments for propagation:", err);
      }
      
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
          if (!seg.original_target_text) {
            if (newTarget !== (seg.target_text || "")) {
              segmentFields.original_target_text = seg.target_text || "";
              segmentFields.tracked_by = request.user.email;
            } else {
              segmentFields.original_target_text = null;
              segmentFields.tracked_by = null;
            }
          } else {
            if (newTarget === seg.original_target_text) {
              segmentFields.original_target_text = null;
              segmentFields.tracked_by = null;
            } else {
              segmentFields.original_target_text = seg.original_target_text;
              segmentFields.tracked_by = request.user.email;
            }
          }
          segmentFields.target_text = newTarget;
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
        .eq("target_lang", dbSegment.target_lang)
        .eq("segment_index", idx);
    });

    const updateResults = await Promise.all(updatePromises);
    const failedUpdate = updateResults.find((r) => r.error);
    if (failedUpdate) {
      console.error("Segment update error:", failedUpdate.error);
      return response.status(500).json({ error: "Failed to update segment." });
    }

    // Save/Update human correction in Translation Memory as an ICE match
    if (targetText !== undefined && targetText !== null && String(targetText).trim() !== "") {
      const { upsertLinguistIceMatch } = require("../services/translationService");
      await upsertLinguistIceMatch(sourceText, targetText, doc.source_lang || "en", dbSegment.target_lang);
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
              if (propagatedTarget !== (seg.target_text || "")) {
                finalOriginal = seg.target_text || "";
                finalTrackedBy = request.user.email;
              } else {
                finalOriginal = null;
                finalTrackedBy = null;
              }
            } else {
              if (propagatedTarget === seg.original_target_text) {
                finalOriginal = null;
                finalTrackedBy = null;
              } else {
                finalOriginal = seg.original_target_text;
                finalTrackedBy = request.user.email;
              }
            }
          } else {
            finalOriginal = null;
            finalTrackedBy = null;
          }
        }
        if (isOwner && status === "approved") {
          finalOriginal = null;
          finalTrackedBy = null;
        }

        io.to(getDocumentRoomId(doc.id, doc.target_lang)).emit("segment-updated", {
          segmentIndex: idx,
          targetText: propagatedTarget,
          status: status || "translated",
          contextJira,
          contextDescription,
          mqmAccuracyScore: undefined,
          mqmReport: null,
          originalTargetText: finalOriginal,
          trackedBy: finalTrackedBy,
          updatedBy: request.user.email,
          targetLang: doc.target_lang
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

      const wordCount = countWords(segment.source_text);
      if (request.profile.role !== "admin") {
        if (request.profile.credits_consumed + wordCount > request.profile.credits_allowed) {
          return response.status(403).json({
            error: `Credit limit exceeded. Reached ${request.profile.credits_consumed}/${request.profile.credits_allowed} words allowance. Contact admin.`
          });
        }
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

      // Log credit consumption and update database profiles
      if (wordCount > 0) {
        const isSeo = contextSettings?.purpose === "SEO";
        const actionName = isSeo ? "translate-context (SEO)" : "translate-context";
        await supabase.from("credit_logs").insert({
          user_id: request.profile.id,
          email: request.profile.email,
          action: actionName,
          word_count: wordCount,
          file_name: doc.name || "document"
        });

        const newConsumed = request.profile.credits_consumed + wordCount;
        await supabase
          .from("profiles")
          .update({ credits_consumed: newConsumed })
          .eq("id", request.profile.id);
      }

      // Broadcast update via Socket.io
      const { getIo } = require("../services/socket");
      const io = getIo();
      if (io) {
        io.to(getDocumentRoomId(doc.id, targetLang)).emit("segment-updated", {
          segmentIndex,
          targetText: translationResult.translated,
          status: "translated",
          contextJira,
          contextDescription,
          mqmAccuracyScore: translationResult.mqmAccuracyScore,
          mqmReport: translationResult.mqmReport,
          updatedBy: request.user.email,
          targetLang
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

apiRouter.post("/documents/:id/auto-detect-context", checkAuth, async (request, response) => {
  const documentId = request.params.id;
  try {
    const doc = await verifyDocumentAccess(request, response, "write");
    if (!doc) return;

    // Fetch all segments of the document
    const { data: allSegments, error: segFetchErr } = await supabase
      .from("document_segments")
      .select("source_text")
      .eq("document_id", documentId);

    if (segFetchErr || !allSegments || allSegments.length === 0) {
      return response.status(400).json({ error: "No segments found in this document to analyze." });
    }

    // Filter segments to only keep segments with word count >= 10 (and up to 45 words)
    let pool = allSegments.filter(seg => {
      const words = countWords(seg.source_text);
      return words >= 10 && words <= 45;
    });

    // Fallback if not enough segments of >= 10 words
    if (pool.length < 20) {
      pool = allSegments.filter(seg => {
        return countWords(seg.source_text) >= 1;
      });
    }
    if (pool.length === 0) {
      pool = allSegments;
    }

    // Select 20 random segments from the filtered pool
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const selectedSamples = shuffled.slice(0, 20);

    // Combine source text and calculate word count
    const combinedText = selectedSamples.map(s => s.source_text).join("\n");
    const wordCount = countWords(combinedText);

    // Check credit limits
    if (request.profile.role !== "admin") {
      if (request.profile.credits_consumed + wordCount > request.profile.credits_allowed) {
        return response.status(403).json({
          error: `Credit limit exceeded. Reached ${request.profile.credits_consumed}/${request.profile.credits_allowed} words allowance. Contact admin.`
        });
      }
    }

    // Call OpenAI to detect the context settings
    const axios = require("axios");
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
    if (!OPENAI_API_KEY) {
      return response.status(500).json({ error: "OpenAI API key is not configured on the server." });
    }

    const DOMAINS = ["General", "Marketing", "Legal", "Medical", "Pharmaceutical", "Financial", "Banking", "Insurance", "Technical", "Software", "IT & Cybersecurity", "E-commerce", "Automotive", "Manufacturing", "Engineering", "Telecommunications", "Gaming", "Education", "Government", "HR & Recruitment", "Travel & Tourism", "Hospitality", "Retail", "Energy & Utilities", "Real Estate", "Life Sciences", "Healthcare", "Aerospace", "Agriculture", "Media & Entertainment"];
    const CONTENT_TYPES = ["General", "Landing Page", "Product Page", "Advertisement", "Email Campaign", "Sales Brochure", "Social Media Post", "UI Strings", "Help Center", "User Guide", "Documentation", "Release Notes", "Knowledge Base", "Contract", "NDA", "Terms of Service", "Privacy Policy", "Compliance Document", "Clinical Trial", "IFU", "Patient Information", "Medical Report", "Website", "Blog", "Article", "Presentation", "Training Material", "Internal Communication"];
    const AUDIENCES = ["General", "Consumers", "Small Business Owners", "Enterprise Buyers", "Patients", "Caregivers", "End Users", "Developers", "Administrators"];
    const PURPOSES = ["General", "Generate Leads", "Drive Purchases", "Build Trust", "Increase Signups", "Inform", "Educate", "Train", "Comply", "Protect Rights", "Resolve Issues", "Reduce Support Tickets", "SEO"];
    const TONES = ["General", "Persuasive", "Professional", "Friendly", "Formal", "Precise", "Reassuring", "Clear", "Concise", "Casual", "Engaging"];
    const FORMALITIES = ["Very Formal", "Formal", "Neutral", "Informal", "Very Informal"];
    const STRICTNESS = ["Flexible", "Balanced", "Strict"];

    const prompt = `Analyze the following document sample text, reason about its vocabulary, style, structure, and intent, and classify it into standard translation context settings.

Sample Text:
"""
${combinedText}
"""

Guidelines for classification:
- Domain: Look for industry-specific terminology. Legal (contracts, NDAs, rights), Banking/Financial (loans, interest, credit, payments), Medical/Pharmaceutical (clinical, anatomical, drugs), Software/IT (UI strings, code variables, user guides, databases), Marketing (ads, persuasive calls, social media).
- Content Type: UI Strings (short labels, buttons, settings), Contract (agreements, NDAs, legally binding clauses), Landing/Product Page (e-commerce listings, marketing page intros), Help Center/User Guide/Documentation (troubleshooting steps, structural instructions).
- Target Audience: Developers/Administrators (APIs, command lines, system config), Patients/Caregivers (medical reports, clinical trials), Consumers (everyday buying, customer apps), Enterprise Buyers (corporate contracts, agreements).
- Purpose: SEO (webpages optimizing for search engines), Comply (regulatory filings, legal terms), Generate Leads/Drive Purchases (persuasive product highlights), Inform/Educate (tutorials, guides).
- Tone: Formal (polite, official, authoritative), Precise (exact definitions, technical descriptions), Persuasive (marketing focus, sales calls), Friendly/Casual (colloquial phrasing).
- Formality: "Very Formal" or "Formal" (Legal contracts, official bank agreements), "Neutral" (Standard manuals, user guides), "Informal" or "Very Informal" (Friendly chats, colloquial apps).

You MUST output ONLY a JSON object containing the following keys:
{
  "reasoning": "A 1-2 sentence analysis of the document content style, industry, and structure",
  "domain": (select the best matching option from: ${JSON.stringify(DOMAINS)}),
  "contentType": (select the best matching option from: ${JSON.stringify(CONTENT_TYPES)}),
  "audience": (select the best matching option from: ${JSON.stringify(AUDIENCES)}),
  "purpose": (select the best matching option from: ${JSON.stringify(PURPOSES)}),
  "tone": (select the best matching option from: ${JSON.stringify(TONES)}),
  "formality": (select the best matching option from: ${JSON.stringify(FORMALITIES)}),
  "terminologyStrictness": (select the best matching option from: ${JSON.stringify(STRICTNESS)})
}

Provide ONLY the raw JSON object, with no markdown formatting, explanations, or backticks. Ensure strict adherence to the allowed values list.`;

    const openAiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a translation context detection system. You analyze the text carefully, think step-by-step to fill the reasoning field, and then output strictly raw JSON matching the requested schema." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    const content = openAiResponse.data?.choices?.[0]?.message?.content;
    let detectedSettings;
    try {
      detectedSettings = JSON.parse(content);
    } catch (parseErr) {
      console.error("Failed to parse OpenAI auto-detect output:", content);
      return response.status(500).json({ error: "Failed to parse context detection output." });
    }

    // Deduct credits and log
    if (wordCount > 0) {
      await supabase.from("credit_logs").insert({
        user_id: request.profile.id,
        email: request.profile.email,
        action: "auto-detect-context",
        word_count: wordCount,
        file_name: doc.name || "document"
      });

      const newConsumed = request.profile.credits_consumed + wordCount;
      await supabase
        .from("profiles")
        .update({ credits_consumed: newConsumed })
        .eq("id", request.profile.id);
    }

    response.json({
      success: true,
      contextSettings: detectedSettings,
      wordCount
    });

  } catch (error) {
    console.error("Auto-detect context failed:", error);
    response.status(500).json({ error: error.message || "Failed to auto-detect context settings." });
  }
});

// ── Document-Wide Audit APIs ──

// 1. Pre-flight Estimate
apiRouter.post("/documents/:id/audit/estimate", checkAuth, async (request, response) => {
  const documentId = request.params.id;
  try {
    const doc = await verifyDocumentAccess(request, response, "write");
    if (!doc) return;

    let segments;
    try {
      segments = await fetchAllSegments(documentId, "source_text", "source");
    } catch (fetchErr) {
      console.error("Failed to fetch document segments:", fetchErr);
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

    // Fetch segments to count words
    let segments;
    try {
      segments = await fetchAllSegments(documentId, "source_text", "source");
    } catch (fetchErr) {
      console.error("Failed to fetch document segments for audit check:", fetchErr);
      return response.status(500).json({ error: "Failed to fetch document segments for credit check." });
    }

    if (!segments || segments.length === 0) {
      return response.status(400).json({ error: "No segments found in this document to audit." });
    }

    // Count total words in these segments
    let wordCount = 0;
    segments.forEach(seg => {
      wordCount += countWords(seg.source_text);
    });

    // Check credit limits
    if (request.profile.role !== "admin") {
      if (request.profile.credits_consumed + wordCount > request.profile.credits_allowed) {
        return response.status(403).json({
          error: `Credit limit exceeded. Reached ${request.profile.credits_consumed}/${request.profile.credits_allowed} words allowance. Contact admin.`
        });
      }
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

    // Log credit consumption and update database profiles
    if (wordCount > 0) {
      const isSeo = request.body.contextSettings?.purpose === "SEO";
      const actionName = isSeo ? "qc-audit (SEO)" : "qc-audit";
      await supabase.from("credit_logs").insert({
        user_id: request.profile.id,
        email: request.profile.email,
        action: actionName,
        word_count: wordCount,
        file_name: doc.name || "document"
      });

      const newConsumed = request.profile.credits_consumed + wordCount;
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

    // Start background worker
    (async () => {
      try {
        const { auditDocumentMQM } = require("../services/mqmService");
        await auditDocumentMQM(documentId, job.id, request.body.contextSettings, request.user.id);
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

    // Dynamic queue position calculation
    if (job.status === "pending") {
      const { count, error: countError } = await supabase
        .from("audit_jobs")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending")
        .lt("created_at", job.created_at);

      if (!countError) {
        job.queuePosition = (count || 0) + 1;
      } else {
        job.queuePosition = 1;
      }
    } else {
      job.queuePosition = 0;
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
        await auditDocumentMQM(documentId, job.id, request.body.contextSettings, request.user.id);
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

    // Fetch owner profile to include in the share modal list
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", doc.owner_id)
      .single();

    response.json({
      owner: {
        userId: doc.owner_id,
        email: ownerProfile?.email || "Unknown",
        name: ownerProfile?.email ? ownerProfile.email.split("@")[0] : "Owner",
        permission: "owner"
      },
      collaborators: list
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  }
});

// Get public access state of a document
apiRouter.get("/documents/:id/public-access", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;
    response.json({ publicAccess: doc.public_access || "none" });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  }
});

// Update public access state of a document
apiRouter.put("/documents/:id/public-access", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;

    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile.role);
    if (!isStaff && doc.owner_id !== request.user.id) {
      return response.status(403).json({ error: "Access management restricted to owner or staff." });
    }

    const { publicAccess } = request.body;
    if (!["none", "read", "write"].includes(publicAccess)) {
      return response.status(400).json({ error: "Invalid public access value." });
    }

    const { error: updateError } = await supabase
      .from("documents")
      .update({ public_access: publicAccess })
      .eq("id", doc.id);

    if (updateError) {
      console.error("Failed to update public access:", updateError);
      return response.status(500).json({ error: "Failed to update public access." });
    }

    response.json({ message: "Public access updated successfully.", publicAccess });
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

    // Fetch document details to get owner_id, name, project_id, and target_lang
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("owner_id, name, project_id, target_lang")
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

    // Fetch owner profile to get their email address
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", doc.owner_id)
      .single();

    if (ownerProfile && ownerProfile.email) {
      const { sendEmail } = require("../utils/mailer");
      const clientUrl = process.env.CLIENT_URL || request.headers.origin || "http://localhost:5173";
      const docLink = doc.project_id && doc.target_lang
        ? `${clientUrl}/project/${doc.project_id}/file/${documentId}/lang/${doc.target_lang}`
        : `${clientUrl}`;

      const ownerName = ownerProfile.email.split("@")[0];

      // Send the email in the background without blocking the HTTP response
      sendEmail({
        to: ownerProfile.email,
        subject: `🔑 Access Request for "${doc.name}"`,
        text: `${userName} (${userEmail}) is requesting Edit Access to "${doc.name}". Review at: ${docLink}`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 20px; }
    .card { background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
    .header { font-size: 18px; font-weight: bold; margin-bottom: 16px; color: #1e293b; }
    .details { font-size: 14px; line-height: 1.5; color: #475569; margin-bottom: 24px; }
    .btn { display: inline-block; background-color: #3b82f6; color: #ffffff !important; font-weight: bold; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-size: 14px; }
    .footer { font-size: 12px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">🔑 Document Access Request</div>
    <div class="details">
      <p>Hello <strong>${ownerName}</strong>,</p>
      <p><strong>${userName}</strong> (${userEmail}) has requested <strong>Edit Access</strong> to your document: <strong>${doc.name}</strong>.</p>
    </div>
    <a href="${docLink}" class="btn" style="color: #ffffff;">View Workspace</a>
    <div class="footer">
      This is an automated notification from your Centroid Collaborative Translation Workspace.
    </div>
  </div>
</body>
</html>
        `
      }).catch(err => console.error("Error sending access request email:", err));
    }

    // Broadcast to room via Socket.io (strictly only to the owner)
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

      // Send to owner's personal room only
      io.to(`user:${doc.owner_id}`).emit("access-request-received", payload);
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

    // Security check: ensure request document matches URL document context
    if (accessReq.document_id !== doc.id) {
      return response.status(400).json({ error: "Access request does not match this document workspace." });
    }

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
          document_id: accessReq.document_id,
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
        io.to(getDocumentRoomId(doc.id, doc.target_lang)).emit("segment-updated", {
          segmentIndex: idx,
          mqmAccuracyScore: undefined,
          mqmReport: null,
          originalTargetText: null,
          trackedBy: null,
          updatedBy: request.user.email,
          targetLang: doc.target_lang
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
      .select("source_text, target_text, original_target_text")
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
    let matchingSegs = [{ segment_index: segmentIndex, target_text: dbSegment.target_text, original_target_text: dbSegment.original_target_text }];
    if (sourceText) {
      const { data: allSegs } = await supabase
        .from("document_segments")
        .select("segment_index, source_text, target_text, original_target_text")
        .eq("document_id", doc.id);
      
      const cleanedSource = cleanString(sourceText);
      if (allSegs && allSegs.length > 0) {
        matchingSegs = allSegs.filter((s) => cleanString(s.source_text) === cleanedSource);
      }
    }

    // Perform individual reverts (setting target_text back to original_target_text and clearing tracked fields)
    const updatePromises = matchingSegs.map(async (seg) => {
      const revertedTarget = seg.original_target_text !== null ? seg.original_target_text : (seg.target_text || "");
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
        const revertedTarget = seg.original_target_text !== null ? seg.original_target_text : (seg.target_text || "");
        io.to(getDocumentRoomId(doc.id, doc.target_lang)).emit("segment-updated", {
          segmentIndex: seg.segment_index,
          targetText: revertedTarget,
          mqmAccuracyScore: undefined,
          mqmReport: null,
          originalTargetText: null,
          trackedBy: null,
          updatedBy: request.user.email,
          targetLang: doc.target_lang
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
      io.to(getDocumentRoomId(doc.id, doc.target_lang)).emit("all-changes-accepted", {
        documentId: doc.id,
        updatedBy: request.user.email,
        targetLang: doc.target_lang
      });
    }

    response.json({ success: true });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Server error." });
  }
});

// ── PROJECT-BASED TRANSLATION MANAGEMENT SYSTEM ROUTES ────────────────

const JSZip = require("jszip");

// 1. Create a Project
apiRouter.post("/projects", checkAuth, async (request, response) => {
  try {
    const { name, client, description, sourceLanguage, targetLanguages, settings } = request.body;
    if (!name) {
      return response.status(400).json({ error: "Project name is required" });
    }

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        name,
        client: client || null,
        description: description || null,
        source_lang: sourceLanguage || "en",
        target_languages: targetLanguages || [],
        owner_id: request.user.id,
        settings: settings || {}
      })
      .select()
      .single();

    if (error) {
      return response.status(500).json({ error: error.message });
    }

    response.json(project);
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to create project." });
  }
});

// 2. List Projects
apiRouter.get("/projects", checkAuth, async (request, response) => {
  try {
    const { data: projects, error } = await supabase
      .from("projects")
      .select("*")
      .eq("owner_id", request.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return response.status(500).json({ error: error.message });
    }

    // Enhance project stats
    const enhancedProjects = await Promise.all(projects.map(async (proj) => {
      // Get document count
      const { count: fileCount } = await supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("project_id", proj.id);

      // Get translation jobs status counts
      const { data: jobs } = await supabase
        .from("translation_jobs")
        .select("status, word_count, progress")
        .eq("project_id", proj.id);

      const jobStats = {
        total: jobs?.length || 0,
        completed: jobs?.filter(j => j.status === "completed")?.length || 0,
        running: jobs?.filter(j => j.status === "running")?.length || 0,
        pending: jobs?.filter(j => j.status === "pending")?.length || 0,
        failed: jobs?.filter(j => j.status === "failed")?.length || 0,
        totalWords: jobs?.reduce((sum, j) => sum + (j.word_count || 0), 0) || 0
      };

      return {
        ...proj,
        fileCount: fileCount || 0,
        jobStats
      };
    }));

    response.json(enhancedProjects);
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to fetch projects." });
  }
});

// 3. Get Project Details
apiRouter.get("/projects/:projectId", checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;

    // Fetch project metadata
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("owner_id", request.user.id)
      .single();

    if (projErr || !project) {
      return response.status(404).json({ error: "Project not found." });
    }

    // Fetch project documents (files)
    const { data: documents, error: docsErr } = await supabase
      .from("documents")
      .select("*")
      .eq("project_id", projectId);

    // Fetch project translation jobs
    const { data: jobs, error: jobsErr } = await supabase
      .from("translation_jobs")
      .select("*, documents(name)")
      .eq("project_id", projectId);

    response.json({
      project,
      files: documents || [],
      jobs: jobs || []
    });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to fetch project details." });
  }
});

// 4. Delete Project
apiRouter.delete("/projects/:projectId", checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;

    const { data: project, error: checkErr } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("owner_id", request.user.id)
      .single();

    if (checkErr || !project) {
      return response.status(404).json({ error: "Project not found or unauthorized." });
    }

    const { error: delErr } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId);

    if (delErr) {
      return response.status(500).json({ error: delErr.message });
    }

    response.json({ success: true });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to delete project." });
  }
});

// 4a. Update Project Details & Settings
apiRouter.put("/projects/:projectId", checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;
    const { name, client, status, description, sourceLanguage, targetLanguages, settings } = request.body;

    // Check project ownership
    const { data: existingProject, error: checkErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("owner_id", request.user.id)
      .single();

    if (checkErr || !existingProject) {
      return response.status(404).json({ error: "Project not found or unauthorized." });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (client !== undefined) updateData.client = client;
    if (status !== undefined) updateData.status = status;
    if (description !== undefined) updateData.description = description;
    if (sourceLanguage !== undefined) updateData.source_lang = sourceLanguage;
    if (targetLanguages !== undefined) updateData.target_languages = targetLanguages;
    if (settings !== undefined) {
      updateData.settings = { ...existingProject.settings, ...settings };
    }
    updateData.updated_at = new Date().toISOString();

    // Check what changed to log appropriate activities
    if (settings !== undefined || name !== undefined || client !== undefined || status !== undefined) {
      const oldSettings = existingProject.settings || {};
      const newSettings = settings || {};
      
      const promptChanged = newSettings.translationPrompt !== oldSettings.translationPrompt ||
                            newSettings.aiModel !== oldSettings.aiModel ||
                            newSettings.autoSave !== oldSettings.autoSave ||
                            newSettings.notifications !== oldSettings.notifications;
      
      const glossaryChanged = JSON.stringify(newSettings.glossary || []) !== JSON.stringify(oldSettings.glossary || []) ||
                              JSON.stringify(newSettings.glossaryMap || {}) !== JSON.stringify(oldSettings.glossaryMap || {});
      
      if (promptChanged) {
        await logProjectActivity(projectId, "context_updated", {
          aiModel: newSettings.aiModel || oldSettings.aiModel,
          autoSave: newSettings.autoSave !== undefined ? newSettings.autoSave : oldSettings.autoSave,
          notifications: newSettings.notifications !== undefined ? newSettings.notifications : oldSettings.notifications
        }, request.user.email);
      }
      
      if (glossaryChanged) {
        await logProjectActivity(projectId, "glossary_modified", {
          glossarySize: (newSettings.glossary || []).length || Object.keys(newSettings.glossaryMap || {}).length
        }, request.user.email);
      }
    }

    const { data: updatedProject, error: updateErr } = await supabase
      .from("projects")
      .update(updateData)
      .eq("id", projectId)
      .select()
      .single();

    if (updateErr) {
      // Graceful fallback for status column missing
      if (updateErr.code === '42703' && status !== undefined) {
        const fallbackSettings = { ...existingProject.settings, ...settings, status };
        delete updateData.status;
        updateData.settings = fallbackSettings;
        const { data: updatedFallback, error: fallbackErr } = await supabase
          .from("projects")
          .update(updateData)
          .eq("id", projectId)
          .select()
          .single();
        
        if (fallbackErr) {
          return response.status(500).json({ error: fallbackErr.message });
        }
        return response.json(updatedFallback);
      }
      return response.status(500).json({ error: updateErr.message });
    }

    response.json(updatedProject);
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to update project details." });
  }
});

// 4b. Get Project Activity Timeline
apiRouter.get("/projects/:projectId/activities", checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;

    // Check project ownership
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, settings")
      .eq("id", projectId)
      .eq("owner_id", request.user.id)
      .single();

    if (projErr || !project) {
      return response.status(404).json({ error: "Project not found or unauthorized." });
    }

    // Try fetching from project_activities table
    const { data: activities, error: actErr } = await supabase
      .from("project_activities")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (actErr) {
      // Fallback to project settings activities array if database table is missing
      if (actErr.code === 'PGRST205' || actErr.message.includes("project_activities") || actErr.message.includes("does not exist")) {
        const settingsActivities = project.settings?.activities || [];
        return response.json(settingsActivities);
      }
      return response.status(500).json({ error: actErr.message });
    }

    response.json(activities || []);
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to fetch project activities." });
  }
});

// 5. Upload File to a Project
apiRouter.post("/projects/:projectId/upload", checkAuth, upload.single("file"), async (request, response) => {
  try {
    const { projectId } = request.params;

    // Verify project exists and belongs to user
    const { data: project, error: checkErr } = await supabase
      .from("projects")
      .select("source_lang, target_languages")
      .eq("id", projectId)
      .eq("owner_id", request.user.id)
      .single();

    if (checkErr || !project) {
      return response.status(404).json({ error: "Project not found or unauthorized." });
    }

    // Process file extraction
    const result = await processUploadedFile(request.file);
    const documentId = result.fileId;
    const fileSize = request.file.size || 0;

    // Calculate word count
    let wordCount = 0;
    result.segments.forEach(seg => {
      wordCount += countWords(seg.source);
    });

    // 1. Create document record under the project
    const { error: docError } = await supabase
      .from("documents")
      .insert({
        id: documentId,
        name: result.originalName || "Untitled Document",
        owner_id: request.user.id,
        file_id: result.fileId,
        source_lang: project.source_lang,
        project_id: projectId,
        word_count: wordCount,
        file_size: fileSize,
        status: "pending"
      });

    if (docError) {
      console.error("Failed to insert document metadata:", docError);
      return response.status(500).json({ error: "Failed to create document record." });
    }

    // 2. Persist parsed source template segments to the database (target_lang = NULL)
    const segmentInserts = result.segments.map((seg, idx) => ({
      document_id: documentId,
      target_lang: null, // represents source template
      segment_index: idx,
      source_text: seg.source || "",
      target_text: "",
      status: "draft"
    }));

    const { error: segError } = await supabase
      .from("document_segments")
      .insert(segmentInserts);

    if (segError) {
      console.error("Failed to insert document segments:", segError);
      await supabase.from("documents").delete().eq("id", documentId);
      return response.status(500).json({ error: "Failed to persist document segments." });
    }

    // 3. Auto-initialize translation jobs for target languages already selected in the project
    if (project.target_languages && project.target_languages.length > 0) {
      const jobInserts = project.target_languages.map(targetLang => ({
        project_id: projectId,
        document_id: documentId,
        target_lang: targetLang,
        status: "pending",
        progress: 0,
        word_count: wordCount
      }));

      await supabase.from("translation_jobs").insert(jobInserts);

      // Copy template segments for target languages
      const targetSegments = [];
      project.target_languages.forEach(targetLang => {
        result.segments.forEach((seg, idx) => {
          targetSegments.push({
            document_id: documentId,
            target_lang: targetLang,
            segment_index: idx,
            source_text: "",
            target_text: "",
            status: "draft"
          });
        });
      });

      if (targetSegments.length > 0) {
        await supabase.from("document_segments").insert(targetSegments);
      }
    }

    await logProjectActivity(projectId, "file_uploaded", {
      fileName: result.originalName || "Untitled Document",
      wordCount,
      fileSize
    }, request.user.email);

    response.json({
      type: result.type,
      documentId,
      originalName: result.originalName,
      wordCount,
      fileSize
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error.message || "Failed to upload file to project." });
  }
});

// 6. Add/Update Target Languages in Project (Creates missing jobs)
apiRouter.post("/projects/:projectId/languages", checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;
    const { targetLanguages } = request.body; // e.g. ["hi", "de", "fr"]

    if (!targetLanguages || !Array.isArray(targetLanguages)) {
      return response.status(400).json({ error: "targetLanguages array is required" });
    }

    // Verify and update project target languages
    const { data: project, error: checkErr } = await supabase
      .from("projects")
      .update({ target_languages: targetLanguages })
      .eq("id", projectId)
      .eq("owner_id", request.user.id)
      .select()
      .single();

    if (checkErr || !project) {
      return response.status(404).json({ error: "Project not found or unauthorized." });
    }

    // Fetch project documents
    const { data: documents } = await supabase
      .from("documents")
      .select("id, word_count")
      .eq("project_id", projectId);

    if (documents && documents.length > 0) {
      for (const doc of documents) {
        // Find existing jobs for this document
        const { data: existingJobs } = await supabase
          .from("translation_jobs")
          .select("target_lang")
          .eq("document_id", doc.id);

        const existingLangs = new Set(existingJobs?.map(j => j.target_lang) || []);

        // Find source segments to copy
        const sourceSegments = await fetchAllSegments(doc.id, "*", "source");

        for (const targetLang of targetLanguages) {
          if (!existingLangs.has(targetLang)) {
            // Create Translation Job
            await supabase.from("translation_jobs").insert({
              project_id: projectId,
              document_id: doc.id,
              target_lang: targetLang,
              status: "pending",
              progress: 0,
              word_count: doc.word_count
            });

            // Populate segments for target language
            if (sourceSegments && sourceSegments.length > 0) {
              const segmentInserts = sourceSegments.map(seg => ({
                document_id: doc.id,
                target_lang: targetLang,
                segment_index: seg.segment_index,
                source_text: "",
                target_text: "",
                status: "draft"
              }));

              await supabase.from("document_segments").insert(segmentInserts);
            }
          }
        }
      }
    }

    response.json({ success: true, targetLanguages });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to update project target languages." });
  }
});

// 7. Get Job Segments & Metadata (Translation Editor View)
apiRouter.get("/jobs/:jobId/segments", checkAuth, async (request, response) => {
  try {
    const { jobId } = request.params;

    // Fetch job details
    const { data: job, error: jobErr } = await supabase
      .from("translation_jobs")
      .select("*, documents(name, file_id, source_lang, owner_id, track_changes_enabled), projects(name, settings)")
      .eq("id", jobId)
      .single();

    if (jobErr || !job) {
      return response.status(404).json({ error: "Translation job not found." });
    }

    const doc = job.documents;
    const project = job.projects;

    // Verify access permission
    let permission = "read";
    if (doc.owner_id === request.user.id || request.profile.role === "admin") {
      permission = "write";
    } else {
      // Check document shared access
      const { data: acc } = await supabase
        .from("document_access")
        .select("permission")
        .eq("document_id", job.document_id)
        .eq("user_id", request.user.id)
        .maybeSingle();

      if (acc) {
        permission = acc.permission;
      } else {
        return response.status(403).json({ error: "Access denied." });
      }
    }

    // Fetch target language segments
    const segments = await fetchAllSegments(job.document_id, "*", job.target_lang);

    response.json({
      jobId: job.id,
      documentId: job.document_id,
      projectId: job.project_id,
      targetLang: job.target_lang,
      sourceLang: doc.source_lang,
      fileName: doc.name,
      fileId: doc.file_id,
      permission,
      ownerId: doc.owner_id,
      trackChangesEnabled: doc.track_changes_enabled,
      contextSettings: project.settings || {},
      projectName: project.name,
      jobStatus: job.status,
      jobProgress: job.progress,
      segments: segments.map(seg => ({
        id: seg.segment_index + 1,
        source: seg.source_text,
        target: seg.target_text || "",
        status: seg.status,
        verified: seg.status === "approved",
        mqmAccuracyScore: seg.mqm_accuracy_score,
        mqmReport: seg.mqm_report,
        contextJira: seg.context_jira,
        contextDescription: seg.context_description,
        originalTargetText: seg.original_target_text,
        trackedBy: seg.tracked_by
      }))
    });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to load job segments." });
  }
});

// 8. Update Job Segment
apiRouter.put("/jobs/:jobId/segments/:index", checkAuth, async (request, response) => {
  try {
    const { jobId, index } = request.params;
    const segmentIndex = parseInt(index, 10);
    const { targetText, status, contextJira, contextDescription, autoPropagate } = request.body;

    const { data: job, error: jobErr } = await supabase
      .from("translation_jobs")
      .select("document_id, target_lang")
      .eq("id", jobId)
      .single();

    if (jobErr || !job) {
      return response.status(404).json({ error: "Job not found." });
    }

    const updateFields = {
      updated_at: new Date().toISOString()
    };
    if (targetText !== undefined) updateFields.target_text = targetText;
    if (status !== undefined) updateFields.status = status;
    if (contextJira !== undefined) updateFields.context_jira = contextJira;
    if (contextDescription !== undefined) updateFields.context_description = contextDescription;

    const { error: updateErr } = await supabase
      .from("document_segments")
      .update(updateFields)
      .eq("document_id", job.document_id)
      .eq("target_lang", job.target_lang)
      .eq("segment_index", segmentIndex);

    if (updateErr) {
      return response.status(500).json({ error: updateErr.message });
    }

    // Broadcast update via Socket.io
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      io.to(getDocumentRoomId(job.document_id, job.target_lang)).emit("segment-updated", {
        segmentIndex,
        targetText: updateFields.target_text,
        status: updateFields.status,
        updatedBy: request.user.email,
        targetLang: job.target_lang
      });
    }

    // Update job progress
    const segments = await fetchAllSegments(job.document_id, "source_text, status, target_text", job.target_lang);
    const progress = calculateProgress(segments).progress;

    const { broadcastJobStatus } = require("../services/jobQueue");
    await supabase
      .from("translation_jobs")
      .update({ progress })
      .eq("id", jobId);

    broadcastJobStatus(jobId, job.document_id, "running", progress);

    response.json({ success: true });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to update segment." });
  }
});

// 9. Translate Single Segment Contextually
apiRouter.post("/jobs/:jobId/segments/:index/translate-context", checkAuth, upload.single("screenshot"), async (request, response) => {
  let tempPath = null;
  try {
    const { jobId, index } = request.params;
    const segmentIndex = parseInt(index, 10);
    const { contextJira, contextDescription, contextSettings: contextSettingsStr } = request.body;

    const { data: job, error: jobErr } = await supabase
      .from("translation_jobs")
      .select("*, documents(source_lang, owner_id)")
      .eq("id", jobId)
      .single();

    if (jobErr || !job) {
      return response.status(404).json({ error: "Job not found." });
    }

    let contextSettings = null;
    if (contextSettingsStr) {
      try { contextSettings = JSON.parse(contextSettingsStr); } catch (_) {}
    }

    let screenshotBuffer = null;
    let screenshotMimeType = null;
    if (request.file) {
      tempPath = request.file.path;
      screenshotBuffer = fs.readFileSync(tempPath);
      screenshotMimeType = request.file.mimetype;
    }

    const { data: segment } = await supabase
      .from("document_segments")
      .select("source_text, target_text")
      .eq("document_id", job.document_id)
      .eq("target_lang", job.target_lang)
      .eq("segment_index", segmentIndex)
      .single();

    if (!segment) {
      return response.status(404).json({ error: "Segment not found." });
    }

    const { translateSegmentWithContext } = require("../services/translationService");
    const translationResult = await translateSegmentWithContext({
      sourceText: segment.source_text,
      existingTranslation: segment.target_text || "",
      targetLang: job.target_lang,
      sourceLang: job.documents.source_lang,
      contextJira,
      contextDescription,
      screenshotBuffer,
      screenshotMimeType,
      contextSettings
    });

    const { error: updateErr } = await supabase
      .from("document_segments")
      .update({
        target_text: translationResult.translated,
        status: "translated",
        mqm_accuracy_score: translationResult.mqmAccuracyScore,
        mqm_report: translationResult.mqmReport,
        updated_at: new Date().toISOString()
      })
      .eq("document_id", job.document_id)
      .eq("target_lang", job.target_lang)
      .eq("segment_index", segmentIndex);

    if (updateErr) {
      return response.status(500).json({ error: "Failed to save contextual translation." });
    }

    // Broadcast socket
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      io.to(getDocumentRoomId(job.document_id, job.target_lang)).emit("segment-updated", {
        segmentIndex,
        targetText: translationResult.translated,
        status: "translated",
        mqmAccuracyScore: translationResult.mqmAccuracyScore,
        mqmReport: translationResult.mqmReport,
        updatedBy: request.user.email,
        targetLang: job.target_lang
      });
    }

    response.json({
      translated: translationResult.translated,
      mqmAccuracyScore: translationResult.mqmAccuracyScore,
      mqmReport: translationResult.mqmReport
    });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: err.message });
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
});

// 10. Queue Control Operations: Start/Pause/Resume/Cancel/Retry
apiRouter.post("/jobs/:jobId/:action", checkAuth, async (request, response) => {
  try {
    const { jobId, action } = request.params;
    
    // Validate action
    const validActions = ["start", "pause", "resume", "cancel", "retry"];
    if (!validActions.includes(action)) {
      return response.status(400).json({ error: "Invalid action." });
    }

    const { data: job, error: fetchErr } = await supabase
      .from("translation_jobs")
      .select("id, status, document_id, progress, project_id, target_lang, documents(name)")
      .eq("id", jobId)
      .single();

    if (fetchErr || !job) {
      return response.status(404).json({ error: "Job not found." });
    }

    let newStatus = "pending";
    if (action === "pause") {
      newStatus = "paused";
    } else if (action === "cancel") {
      newStatus = "cancelled";
    } else if (action === "resume" || action === "retry" || action === "start") {
      newStatus = "pending";
    }

    const { broadcastJobStatus } = require("../services/jobQueue");
    await supabase
      .from("translation_jobs")
      .update({ status: newStatus })
      .eq("id", jobId);

    broadcastJobStatus(jobId, job.document_id, newStatus, job.progress);

    if (newStatus === "pending") {
      await logProjectActivity(job.project_id, "translation_started", {
        jobId,
        fileName: job.documents?.name || "Document",
        targetLang: job.target_lang
      }, request.user.email);
    }

    response.json({ success: true, status: newStatus });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to perform queue action." });
  }
});

// 11. Single Translation Job File Download
apiRouter.get("/jobs/:jobId/download", checkAuth, async (request, response) => {
  try {
    const { jobId } = request.params;

    const { data: job, error: jobErr } = await supabase
      .from("translation_jobs")
      .select("*, documents(name, file_id, source_lang)")
      .eq("id", jobId)
      .single();

    if (jobErr || !job) {
      return response.status(404).json({ error: "Job not found." });
    }

    const doc = job.documents;
    const segments = await fetchAllSegments(job.document_id, "segment_index, source_text, target_text", job.target_lang);

    // Format segments into exporter structure
    const segmentsList = segments.map(s => ({
      id: s.segment_index + 1,
      source: s.source_text,
      target: s.target_text || s.source_text
    }));

    const extIndex = doc.name.lastIndexOf(".");
    const ext = extIndex !== -1 ? doc.name.substring(extIndex) : ".html";

    const buffer = await exportHtml(doc.file_id, segmentsList, ext, job.target_lang);

    await logProjectActivity(job.project_id, "file_downloaded", {
      fileName: `${doc.name.replace(/\.[^/.]+$/, "")}_${job.target_lang}${ext}`,
      documentId: job.document_id,
      targetLang: job.target_lang
    }, request.user.email);

    response.setHeader("Content-Disposition", `attachment; filename="${doc.name.replace(/\.[^/.]+$/, "")}_${job.target_lang}${ext}"`);
    response.setHeader("Content-Type", "application/octet-stream");
    response.send(buffer);
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to download translated document." });
  }
});

// 12. Download ZIP of all files for a target language in the project
apiRouter.get("/projects/:projectId/download/lang/:lang", checkAuth, async (request, response) => {
  try {
    const { projectId, lang } = request.params;

    const { data: jobs, error: jobsErr } = await supabase
      .from("translation_jobs")
      .select("*, documents(name, file_id)")
      .eq("project_id", projectId)
      .eq("target_lang", lang);

    if (jobsErr || !jobs || jobs.length === 0) {
      return response.status(404).json({ error: "No completed jobs found for this language." });
    }

    const zip = new JSZip();

    for (const job of jobs) {
      const doc = job.documents;
      const segments = await fetchAllSegments(job.document_id, "segment_index, source_text, target_text", job.target_lang);
      const segmentsList = segments.map(s => ({
        id: s.segment_index + 1,
        source: s.source_text,
        target: s.target_text || s.source_text
      }));

      const extIndex = doc.name.lastIndexOf(".");
      const ext = extIndex !== -1 ? doc.name.substring(extIndex) : ".html";

      const buffer = await exportHtml(doc.file_id, segmentsList, ext, job.target_lang);
      zip.file(`${doc.name.replace(/\.[^/.]+$/, "")}_${lang}${ext}`, buffer);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    await logProjectActivity(projectId, "file_downloaded", {
      packageName: `project_${projectId}_${lang}.zip`,
      language: lang
    }, request.user.email);

    response.setHeader("Content-Disposition", `attachment; filename="project_${projectId}_${lang}.zip"`);
    response.setHeader("Content-Type", "application/zip");
    response.send(zipBuffer);
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to download language package." });
  }
});

// 13. Download ZIP of the entire project (structured by language folders)
apiRouter.get("/projects/:projectId/download/all", checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;

    const { data: jobs, error: jobsErr } = await supabase
      .from("translation_jobs")
      .select("*, documents(name, file_id)")
      .eq("project_id", projectId);

    if (jobsErr || !jobs || jobs.length === 0) {
      return response.status(404).json({ error: "No jobs found for this project." });
    }

    const zip = new JSZip();

    for (const job of jobs) {
      const doc = job.documents;
      const segments = await fetchAllSegments(job.document_id, "segment_index, source_text, target_text", job.target_lang);
      const segmentsList = segments.map(s => ({
        id: s.segment_index + 1,
        source: s.source_text,
        target: s.target_text || s.source_text
      }));

      const extIndex = doc.name.lastIndexOf(".");
      const ext = extIndex !== -1 ? doc.name.substring(extIndex) : ".html";

      const buffer = await exportHtml(doc.file_id, segmentsList, ext, job.target_lang);
      
      // Put in folder structured by language
      zip.file(`${job.target_lang}/${doc.name.replace(/\.[^/.]+$/, "")}_${job.target_lang}${ext}`, buffer);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    await logProjectActivity(projectId, "file_downloaded", {
      packageName: `project_${projectId}_all.zip`,
      allLanguages: true
    }, request.user.email);

    response.setHeader("Content-Disposition", `attachment; filename="project_${projectId}_all.zip"`);
    response.setHeader("Content-Type", "application/zip");
    response.send(zipBuffer);
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to download project package." });
  }
});

// 14. Project Analytics & Statistics
apiRouter.get("/projects/:projectId/analytics", checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;

    // Verify project exists
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("owner_id", request.user.id)
      .single();

    if (projErr || !project) {
      return response.status(404).json({ error: "Project not found." });
    }

    // Get documents count
    const { data: documents } = await supabase
      .from("documents")
      .select("id, word_count")
      .eq("project_id", projectId);

    const fileCount = documents?.length || 0;
    const baseWordCount = documents?.reduce((sum, d) => sum + (d.word_count || 0), 0) || 0;

    // Get translation jobs and calculate language details
    const { data: jobs } = await supabase
      .from("translation_jobs")
      .select("id, target_lang, status, word_count, progress, mqm_score")
      .eq("project_id", projectId);

    const languagesCount = new Set(jobs?.map(j => j.target_lang) || []).size;
    const totalJobs = jobs?.length || 0;
    const completedJobs = jobs?.filter(j => j.status === "completed")?.length || 0;
    const inProgressJobs = jobs?.filter(j => j.status === "running")?.length || 0;
    const pendingJobs = jobs?.filter(j => j.status === "pending")?.length || 0;
    
    // Average MQM calculation
    const mqmScores = jobs?.filter(j => j.mqm_score !== null).map(j => Number(j.mqm_score)) || [];
    const averageMqm = mqmScores.length > 0 ? (mqmScores.reduce((sum, s) => sum + s, 0) / mqmScores.length).toFixed(1) : "100.0";

    // Estimate Translation Memory & Context Analysis
    let iceMatches = 0;
    let tmMatches = 0;
    let fuzzyMatches = 0;
    let normalTrans = 0;
    let totalSegmentsCount = 0;

    let segmentsWithJiraContext = 0;
    let segmentsWithDescriptionContext = 0;
    let totalSourceContextCount = 0;

    if (documents && documents.length > 0) {
      const docIds = documents.map(d => d.id);

      // Query target segments to find TM usage distribution and context counts
      const { data: targetSegments } = await supabase
        .from("document_segments")
        .select("status, source_text, target_text, target_lang, context_jira, context_description")
        .in("document_id", docIds)
        .not("target_lang", "is", null);

      if (targetSegments && targetSegments.length > 0) {
        totalSegmentsCount = targetSegments.length;
        const targetLangs = [...new Set(targetSegments.map(s => s.target_lang))];

        // Fetch translation memory entries for these target languages
        const { data: tmEntries } = await supabase
          .from("translation_memory")
          .select("source_text, target_text, target_lang, provider")
          .in("target_lang", targetLangs);

        const tmByLang = {};
        (tmEntries || []).forEach(item => {
          if (!tmByLang[item.target_lang]) {
            tmByLang[item.target_lang] = [];
          }
          tmByLang[item.target_lang].push(item);
        });

        const stringSimilarity = require("string-similarity");

        targetSegments.forEach(seg => {
          // Source Context Analysis
          const hasJira = seg.context_jira && seg.context_jira.trim() !== "";
          const hasDesc = seg.context_description && seg.context_description.trim() !== "";
          if (hasJira) segmentsWithJiraContext++;
          if (hasDesc) segmentsWithDescriptionContext++;
          if (hasJira || hasDesc) totalSourceContextCount++;

          // TM Match Analysis
          if (seg.target_text && seg.target_text.trim() !== "") {
            const langTms = tmByLang[seg.target_lang] || [];
            const exactTms = langTms.filter(t => t.source_text === seg.source_text);
            const bestExact = exactTms.find(t => t.provider.startsWith("Linguist (ICE)")) || exactTms[0];

            if (bestExact && bestExact.target_text === seg.target_text) {
              if (bestExact.provider.startsWith("Linguist (ICE)")) {
                iceMatches++;
              } else {
                tmMatches++;
              }
            } else {
              const matchSources = langTms.map(x => x.source_text).filter(Boolean);
              if (matchSources.length > 0) {
                const matches = stringSimilarity.findBestMatch(seg.source_text, matchSources);
                const bestMatch = matches.bestMatch;
                const bestMatchIndex = matches.bestMatchIndex;
                if (bestMatch.rating >= 0.90 && langTms[bestMatchIndex].target_text === seg.target_text) {
                  fuzzyMatches++;
                } else {
                  normalTrans++;
                }
              } else {
                normalTrans++;
              }
            }
          } else {
            normalTrans++;
          }
        });
      }
    }

    const estimatedSavings = baseWordCount > 0 
      ? Math.round(baseWordCount * ((iceMatches + tmMatches + fuzzyMatches * 0.4) / Math.max(1, totalSegmentsCount)) * 0.22) 
      : 0;

    response.json({
      fileCount,
      languagesCount,
      totalJobs,
      completedJobs,
      inProgressJobs,
      pendingJobs,
      averageMqm,
      totalWordCount: baseWordCount * Math.max(1, languagesCount),
      estimatedSavings: `${estimatedSavings} USD`,
      tmMatchStats: {
        ice: iceMatches,
        tm: tmMatches,
        fuzzy: fuzzyMatches,
        normal: normalTrans,
        total: totalSegmentsCount
      },
      sourceContextStats: {
        jira: segmentsWithJiraContext,
        description: segmentsWithDescriptionContext,
        total: totalSourceContextCount,
        totalSegments: totalSegmentsCount
      }
    });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to fetch project analytics." });
  }
});

// 15. Get segments for a document + lang (for path-based routing editor)
apiRouter.get("/documents/:documentId/lang/:lang/segments", checkAuth, async (request, response) => {
  try {
    const { documentId, lang } = request.params;

    // Fetch job details by document_id and target_lang
    const { data: job, error: jobErr } = await supabase
      .from("translation_jobs")
      .select("*, documents(name, file_id, source_lang, owner_id, track_changes_enabled), projects(name, settings)")
      .eq("document_id", documentId)
      .eq("target_lang", lang)
      .single();

    if (jobErr || !job) {
      return response.status(404).json({ error: "Translation job not found." });
    }

    const doc = job.documents;
    const project = job.projects;

    // Verify access permission
    let permission = "read";
    if (doc.owner_id === request.user.id || request.profile.role === "admin") {
      permission = "write";
    } else {
      const { data: acc } = await supabase
        .from("document_access")
        .select("permission")
        .eq("document_id", documentId)
        .eq("user_id", request.user.id)
        .maybeSingle();

      if (acc) {
        permission = acc.permission;
      } else {
        return response.status(403).json({ error: "Access denied." });
      }
    }

    // Fetch target language segments
    const segments = await fetchAllSegments(documentId, "*", lang);

    // Dynamic TM lookup to assign fuzzyScore and matchType
    const uniqueSources = [...new Set(segments.map(s => s.source_text))];
    const { data: tmEntries } = await supabase
      .from("translation_memory")
      .select("*")
      .in("source_text", uniqueSources)
      .eq("target_lang", lang);

    const tmMap = {};
    (tmEntries || []).forEach(item => {
      // Prioritize ICE matches, then newer ones
      const existing = tmMap[item.source_text];
      if (!existing || item.provider.startsWith("Linguist (ICE)") || (!existing.provider.startsWith("Linguist (ICE)") && item.created_at > existing.created_at)) {
        tmMap[item.source_text] = item;
      }
    });

    const { data: allTm } = await supabase
      .from("translation_memory")
      .select("source_text, target_text, provider")
      .eq("target_lang", lang);

    const stringSimilarity = require("string-similarity");

    const mappedSegments = segments.map(seg => {
      let fuzzyScore = null;
      let matchType = null;

      if (seg.target_text && seg.target_text.trim() !== "") {
        const exactTm = tmMap[seg.source_text];
        if (exactTm && exactTm.target_text === seg.target_text) {
          if (exactTm.provider.startsWith("Linguist (ICE)")) {
            fuzzyScore = 101;
            matchType = "ICE";
          } else {
            fuzzyScore = 100;
            matchType = "TM";
          }
        } else if (allTm && allTm.length > 0) {
          const sourceText = seg.source_text;
          const matchSources = allTm.map(x => x.source_text).filter(Boolean);
          if (matchSources.length > 0) {
            const matches = stringSimilarity.findBestMatch(sourceText, matchSources);
            const bestMatch = matches.bestMatch;
            const bestMatchIndex = matches.bestMatchIndex;
            if (bestMatch.rating >= 0.90 && allTm[bestMatchIndex].target_text === seg.target_text) {
              fuzzyScore = Math.round(bestMatch.rating * 100);
              matchType = "Fuzzy";
            }
          }
        }
      }

      return {
        id: seg.segment_index + 1,
        source: seg.source_text,
        target: seg.target_text || "",
        status: seg.status,
        verified: seg.status === "approved",
        mqmAccuracyScore: seg.mqm_accuracy_score,
        mqmReport: seg.mqm_report,
        contextJira: seg.context_jira,
        contextDescription: seg.context_description,
        originalTargetText: seg.original_target_text,
        trackedBy: seg.tracked_by,
        fuzzyScore,
        matchType
      };
    });

    response.json({
      jobId: job.id,
      documentId,
      projectId: job.project_id,
      targetLang: lang,
      sourceLang: doc.source_lang,
      fileName: doc.name,
      fileId: doc.file_id,
      permission,
      ownerId: doc.owner_id,
      trackChangesEnabled: doc.track_changes_enabled,
      contextSettings: project.settings || {},
      projectName: project.name,
      jobStatus: job.status,
      jobProgress: job.progress,
      segments: mappedSegments
    });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to load segments." });
  }
});

// 15.5. Translation Memory (TM) Analysis for a document + lang
apiRouter.get("/documents/:documentId/lang/:lang/tm-analysis", checkAuth, async (request, response) => {
  try {
    const { documentId, lang } = request.params;
    request.params.id = documentId;
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) {
      try {
        const fs = require("fs");
        fs.writeFileSync("c:/Users/divya/Desktop/matecat/server/scratch/api-error.log", "verifyDocumentAccess returned null for docId: " + documentId + ", params: " + JSON.stringify(request.params));
      } catch (fsErr) {}
      return;
    }

    // 1. Fetch all segments for this document + lang
    let templateRows;
    try {
      templateRows = await fetchAllSegments(doc.id, "segment_index, source_text", lang);
    } catch (templErr) {
      console.error("Failed to fetch segments for TM Analysis:", templErr);
      try {
        const fs = require("fs");
        fs.writeFileSync("c:/Users/divya/Desktop/matecat/server/scratch/api-error.log", "fetchAllSegments failed: " + (templErr.stack || String(templErr)));
      } catch (fsErr) {}
      return response.status(500).json({ error: "Failed to fetch document segments." });
    }

    if (!templateRows) {
      try {
        const fs = require("fs");
        fs.writeFileSync("c:/Users/divya/Desktop/matecat/server/scratch/api-error.log", "templateRows is empty or null");
      } catch (fsErr) {}
      return response.status(500).json({ error: "Failed to fetch document segments." });
    }

    // 2. Fetch all translations for this target language to compute matches
    const { data: allTmList, error: tmErr } = await supabase
      .from("translation_memory")
      .select("source_text, target_text, provider")
      .eq("target_lang", lang);

    if (tmErr || !allTmList) {
      console.error("Failed to fetch TM entries for TM Analysis:", tmErr);
      try {
        const fs = require("fs");
        fs.writeFileSync("c:/Users/divya/Desktop/matecat/server/scratch/api-error.log", "translation_memory fetch failed: " + (tmErr?.message || String(tmErr)));
      } catch (fsErr) {}
      return response.status(500).json({ error: "Failed to fetch TM database entries." });
    }

    // Build TM maps for quick O(1) exact matching
    const tmMap = {};
    allTmList.forEach((item) => {
      const existing = tmMap[item.source_text];
      if (!existing || item.provider.startsWith("Linguist (ICE)") || (!existing.provider.startsWith("Linguist (ICE)"))) {
        tmMap[item.source_text] = item;
      }
    });

    // Keep statistics
    let totalSegments = templateRows.length;
    let totalWords = 0;
    let totalCharacters = 0;
    
    // Breakdown categories
    const categories = {
      ice: { count: 0, words: 0, percentage: 0, billingWeight: 0.1, weightedWords: 0, name: "ICE Match (101%)" },
      exact: { count: 0, words: 0, percentage: 0, billingWeight: 0.2, weightedWords: 0, name: "Exact Match (100%)" },
      fuzzy95: { count: 0, words: 0, percentage: 0, billingWeight: 0.3, weightedWords: 0, name: "Fuzzy Match (95%-99%)" },
      fuzzy85: { count: 0, words: 0, percentage: 0, billingWeight: 0.4, weightedWords: 0, name: "Fuzzy Match (85%-94%)" },
      fuzzy75: { count: 0, words: 0, percentage: 0, billingWeight: 0.6, weightedWords: 0, name: "Fuzzy Match (75%-84%)" },
      fuzzy50: { count: 0, words: 0, percentage: 0, billingWeight: 0.8, weightedWords: 0, name: "Fuzzy Match (50%-74%)" },
      new: { count: 0, words: 0, percentage: 0, billingWeight: 1.0, weightedWords: 0, name: "New Words / No Match (<50%)" }
    };

    const stringSimilarity = require("string-similarity");
    const matchSources = allTmList.map(x => x.source_text).filter(Boolean);

    templateRows.forEach((row) => {
      const source = row.source_text || "";
      const wordCount = countWords(source);
      const charCount = source.length;

      totalWords += wordCount;
      totalCharacters += charCount;

      let categoryKey = "new";

      // 1. Exact match check
      if (tmMap[source]) {
        const entry = tmMap[source];
        const isIce = entry.provider && entry.provider.startsWith("Linguist (ICE)");
        categoryKey = isIce ? "ice" : "exact";
      } else if (matchSources.length > 0) {
        // 2. Fuzzy match calculation
        const matches = stringSimilarity.findBestMatch(source, matchSources);
        const bestMatch = matches.bestMatch;
        const score = Math.round(bestMatch.rating * 100);

        if (score >= 50) {
          if (score >= 95) categoryKey = "fuzzy95";
          else if (score >= 85) categoryKey = "fuzzy85";
          else if (score >= 75) categoryKey = "fuzzy75";
          else categoryKey = "fuzzy50";
        }
      }

      categories[categoryKey].count += 1;
      categories[categoryKey].words += wordCount;
    });

    // Compute percentages and weighted totals
    let totalWeightedWords = 0;
    Object.keys(categories).forEach((key) => {
      const cat = categories[key];
      cat.percentage = totalWords > 0 ? parseFloat(((cat.words / totalWords) * 100).toFixed(2)) : 0;
      cat.weightedWords = Math.round(cat.words * cat.billingWeight);
      totalWeightedWords += cat.weightedWords;
    });

    const savingsPercentage = totalWords > 0 
      ? parseFloat(((1 - (totalWeightedWords / totalWords)) * 100).toFixed(2)) 
      : 0;

    response.json({
      documentId: doc.id,
      fileName: doc.name,
      targetLang: lang,
      totalSegments,
      totalWords,
      totalCharacters,
      totalWeightedWords,
      savingsPercentage,
      categories
    });
  } catch (err) {
    console.error("TM Analysis error:", err);
    try {
      const fs = require("fs");
      fs.writeFileSync("c:/Users/divya/Desktop/matecat/server/scratch/api-error.log", "Outer catch block error: " + (err.stack || String(err)));
    } catch (fsErr) {}
    response.status(500).json({ error: "Failed to perform TM Analysis." });
  }
});

// 16. Update segment for a document + lang
apiRouter.put("/documents/:documentId/lang/:lang/segments/:index", checkAuth, async (request, response) => {
  try {
    const { documentId, lang, index } = request.params;
    
    // Map parameter id for verifyDocumentAccess
    request.params.id = documentId;
    const doc = await verifyDocumentAccess(request, response, "write");
    if (!doc) return;

    const segmentIndex = parseInt(index, 10);
    const { targetText, status, contextJira, contextDescription, autoPropagate } = request.body;

    const updateFields = {
      updated_at: new Date().toISOString()
    };
    if (targetText !== undefined) updateFields.target_text = targetText;
    if (status !== undefined) updateFields.status = status;
    if (contextJira !== undefined) updateFields.context_jira = contextJira;
    if (contextDescription !== undefined) updateFields.context_description = contextDescription;

    // Fetch the segment details to find source text and tracking information
    const { data: dbSegment, error: segErr } = await supabase
      .from("document_segments")
      .select("source_text, target_lang, context_jira, context_description, target_text, original_target_text, tracked_by")
      .eq("document_id", doc.id)
      .eq("target_lang", lang)
      .eq("segment_index", segmentIndex)
      .single();

    if (segErr || !dbSegment) {
      return response.status(404).json({ error: "Segment not found." });
    }

    let sourceText = dbSegment.source_text;
    if (!sourceText) {
      const { data: templateSeg } = await supabase
        .from("document_segments")
        .select("source_text")
        .eq("document_id", doc.id)
        .is("target_lang", null)
        .eq("segment_index", segmentIndex)
        .single();
      if (templateSeg) {
        sourceText = templateSeg.source_text;
      }
    }

    // Clean string helper (ignores tags, normalizes whitespace)
    const cleanString = (str) => {
      if (!str) return "";
      return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    };

    // Propagate translation helper
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
    let matchingSegs = [{ segment_index: segmentIndex, source_text: sourceText, target_text: dbSegment.target_text, status: dbSegment.status, original_target_text: dbSegment.original_target_text, tracked_by: dbSegment.tracked_by }];
    if (sourceText && autoPropagate !== false) {
      try {
        // Direct query to fetch all template segments for this document
        const { data: templateRows } = await supabase
          .from("document_segments")
          .select("segment_index, source_text")
          .eq("document_id", doc.id)
          .is("target_lang", null);

        // Direct query to fetch all target language segments for this document
        const { data: targetRows } = await supabase
          .from("document_segments")
          .select("segment_index, target_text, status, original_target_text, tracked_by")
          .eq("document_id", doc.id)
          .eq("target_lang", lang);

        if (templateRows && targetRows) {
          const sourceMap = {};
          templateRows.forEach((row) => {
            sourceMap[row.segment_index] = row.source_text || "";
          });

          const cleanedSource = cleanString(sourceText);
          matchingSegs = targetRows
            .map((row) => ({
              segment_index: row.segment_index,
              source_text: sourceMap[row.segment_index] || "",
              target_text: row.target_text,
              status: row.status,
              original_target_text: row.original_target_text,
              tracked_by: row.tracked_by
            }))
            .filter((row) => cleanString(row.source_text) === cleanedSource);
        }
      } catch (err) {
        console.error("Failed to fetch duplicate segments directly:", err);
      }
    }

    const isOwner = doc.owner_id === request.user.id;
    const isTracking = doc.track_changes_enabled && !isOwner;

    // Perform individual updates for each duplicate segment in parallel
    const updatePromises = matchingSegs.map(async (seg) => {
      const idx = seg.segment_index;
      const segmentFields = { ...updateFields };
      
      // If we are updating a duplicate segment (idx !== segmentIndex), 
      // we must NOT modify its status (delete status from segmentFields so it remains unchanged in DB!)
      if (idx !== segmentIndex) {
        delete segmentFields.status;
      }

      if (targetText !== undefined) {
        const newTarget = idx === segmentIndex 
          ? targetText 
          : propagateTranslation(targetText, seg.source_text);
          
        if (isTracking) {
          if (!seg.original_target_text) {
            if (newTarget !== (seg.target_text || "")) {
              segmentFields.original_target_text = seg.target_text || "";
              segmentFields.tracked_by = request.user.email;
            } else {
              segmentFields.original_target_text = null;
              segmentFields.tracked_by = null;
            }
          } else {
            if (newTarget === seg.original_target_text) {
              segmentFields.original_target_text = null;
              segmentFields.tracked_by = null;
            } else {
              segmentFields.original_target_text = seg.original_target_text;
              segmentFields.tracked_by = request.user.email;
            }
          }
          segmentFields.target_text = newTarget;
        } else {
          // Owner edit or tracking disabled: commit directly, clear tracked state
          segmentFields.target_text = newTarget;
          segmentFields.original_target_text = null;
          segmentFields.tracked_by = null;
        }
      }

      // If owner approves the segment, clear tracked changes
      if (isOwner && status === "approved" && idx === segmentIndex) {
        segmentFields.original_target_text = null;
        segmentFields.tracked_by = null;
      }

      return supabase
        .from("document_segments")
        .update(segmentFields)
        .eq("document_id", doc.id)
        .eq("target_lang", lang)
        .eq("segment_index", idx);
    });

    const updateResults = await Promise.all(updatePromises);
    const failedUpdate = updateResults.find((r) => r.error);
    if (failedUpdate) {
      console.error("Segment update error in lang PUT:", failedUpdate.error);
      return response.status(500).json({ error: "Failed to update segment." });
    }

    // Save/Update human correction in Translation Memory as an ICE match
    if (targetText !== undefined && targetText !== null && String(targetText).trim() !== "") {
      try {
        const { upsertLinguistIceMatch } = require("../services/translationService");
        await upsertLinguistIceMatch(sourceText, targetText, doc.source_lang || "en", lang);
      } catch (tmErr) {
        console.error("Failed to save segment human correction to TM:", tmErr);
      }
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
              if (propagatedTarget !== (seg.target_text || "")) {
                finalOriginal = seg.target_text || "";
                finalTrackedBy = request.user.email;
              } else {
                finalOriginal = null;
                finalTrackedBy = null;
              }
            } else {
              if (propagatedTarget === seg.original_target_text) {
                finalOriginal = null;
                finalTrackedBy = null;
              } else {
                finalOriginal = seg.original_target_text;
                finalTrackedBy = request.user.email;
              }
            }
          } else {
            finalOriginal = null;
            finalTrackedBy = null;
          }
        }
        if (isOwner && status === "approved" && idx === segmentIndex) {
          finalOriginal = null;
          finalTrackedBy = null;
        }

        const finalStatus = idx === segmentIndex ? (status || "translated") : (seg.status || "draft");

        io.to(getDocumentRoomId(doc.id, lang)).emit("segment-updated", {
          segmentIndex: idx,
          targetText: propagatedTarget,
          status: finalStatus,
          contextJira,
          contextDescription,
          mqmAccuracyScore: undefined,
          mqmReport: null,
          originalTargetText: finalOriginal,
          trackedBy: finalTrackedBy,
          updatedBy: request.user.email,
          targetLang: lang
        });
      });
    }

    // Update job progress
    const progressSegments = await fetchAllSegments(doc.id, "source_text, status, target_text", lang);
    const progress = calculateProgress(progressSegments).progress;

    const { broadcastJobStatus } = require("../services/jobQueue");
    
    // Find job id to update
    const { data: job } = await supabase
      .from("translation_jobs")
      .select("id")
      .eq("document_id", doc.id)
      .eq("target_lang", lang)
      .single();

    if (job) {
      const newStatus = progress === 100 ? "completed" : "running";
      await supabase
        .from("translation_jobs")
        .update({ progress, status: newStatus })
        .eq("id", job.id);

      broadcastJobStatus(job.id, doc.id, newStatus, progress);
    }

    response.json({ success: true });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to update segment." });
  }
});

// 17. Translate Single Segment Contextually for a document + lang
apiRouter.post("/documents/:documentId/lang/:lang/segments/:index/translate-context", checkAuth, upload.single("screenshot"), async (request, response) => {
  let tempPath = null;
  try {
    const { documentId, lang, index } = request.params;
    const segmentIndex = parseInt(index, 10);
    const { contextJira, contextDescription, contextSettings: contextSettingsStr } = request.body;

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("source_lang, owner_id")
      .eq("id", documentId)
      .single();

    if (docErr || !doc) {
      return response.status(404).json({ error: "Document not found." });
    }

    let contextSettings = null;
    if (contextSettingsStr) {
      try { contextSettings = JSON.parse(contextSettingsStr); } catch (_) {}
    }

    let screenshotBuffer = null;
    let screenshotMimeType = null;
    if (request.file) {
      tempPath = request.file.path;
      screenshotBuffer = fs.readFileSync(tempPath);
      screenshotMimeType = request.file.mimetype;
    }

    const [templateSeg, targetSeg] = await Promise.all([
      supabase.from("document_segments").select("source_text").eq("document_id", documentId).is("target_lang", null).eq("segment_index", segmentIndex).maybeSingle(),
      supabase.from("document_segments").select("target_text").eq("document_id", documentId).eq("target_lang", lang).eq("segment_index", segmentIndex).maybeSingle()
    ]);

    if (!templateSeg.data || !targetSeg.data) {
      return response.status(404).json({ error: "Segment not found." });
    }

    const segment = {
      source_text: templateSeg.data.source_text,
      target_text: targetSeg.data.target_text
    };

    const { translateSegmentWithContext } = require("../services/translationService");
    const translationResult = await translateSegmentWithContext({
      sourceText: segment.source_text,
      existingTranslation: segment.target_text || "",
      targetLang: lang,
      sourceLang: doc.source_lang,
      contextJira,
      contextDescription,
      screenshotBuffer,
      screenshotMimeType,
      contextSettings
    });

    const { error: updateErr } = await supabase
      .from("document_segments")
      .update({
        target_text: translationResult.translated,
        status: "translated",
        mqm_accuracy_score: translationResult.mqmAccuracyScore,
        mqm_report: translationResult.mqmReport,
        updated_at: new Date().toISOString()
      })
      .eq("document_id", documentId)
      .eq("target_lang", lang)
      .eq("segment_index", segmentIndex);

    if (updateErr) {
      return response.status(500).json({ error: "Failed to save contextual translation." });
    }

    // Broadcast socket
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      io.to(getDocumentRoomId(documentId, lang)).emit("segment-updated", {
        segmentIndex,
        targetText: translationResult.translated,
        status: "translated",
        mqmAccuracyScore: translationResult.mqmAccuracyScore,
        mqmReport: translationResult.mqmReport,
        updatedBy: request.user.email,
        targetLang: lang
      });
    }

    response.json({
      translated: translationResult.translated,
      mqmAccuracyScore: translationResult.mqmAccuracyScore,
      mqmReport: translationResult.mqmReport
    });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: err.message });
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
});

module.exports = {
  apiRouter
};
