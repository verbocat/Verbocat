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

    // 2. Persist parsed segments to the database in batches of 500 for maximum throughput
    const BATCH_SIZE = 500;
    for (let i = 0; i < segmentInserts.length; i += BATCH_SIZE) {
      const batch = segmentInserts.slice(i, i + BATCH_SIZE);
      const { error: segError } = await supabase
        .from("document_segments")
        .insert(batch);

      if (segError) {
        console.error("Failed to insert document segments batch:", segError);
        await supabase.from("documents").delete().eq("id", documentId);
        return response.status(500).json({ error: "Failed to persist document segments." });
      }
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
    const { fileId, template, segments, extension, sourceLang, targetLang, fileName, exportSource } = request.body;
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

    const buffer = await exportHtml(fileId, exportSegments, ext, targetLang, template);

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
      segments = await fetchAllSegments(doc.id);
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
        allSegs = await fetchAllSegments(doc.id, "segment_index, source_text, target_text, original_target_text, tracked_by");
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
      segments = await fetchAllSegments(documentId, "source_text");
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
      segments = await fetchAllSegments(documentId, "source_text");
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

    response.json(list);
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
    if (targetUserId === doc.owner_id) {
      return response.status(400).json({ error: "Cannot remove access from the document owner." });
    }

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
    const { name, client, description, sourceLanguage, targetLanguages, dueDate, settings } = request.body;
    if (!name) {
      return response.status(400).json({ error: "Project name is required" });
    }

    const finalSettings = { ...(settings || {}) };
    if (dueDate) {
      finalSettings.dueDate = dueDate;
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
        settings: finalSettings
      })
      .select()
      .single();

    if (error) {
      return response.status(500).json({ error: error.message });
    }

    await logProjectActivity(project.id, "PROJECT_CREATED", { projectName: project.name }, request.user.email);

    response.json(project);
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to create project." });
  }
});

// Helper to verify project access permissions
async function verifyProjectAccess(request, response, requiredPermission = "read") {
  const { projectId } = request.params;
  const userId = request.user.id;
  const userEmail = request.user.email;
  const isStaff = ["admin", "verbolabs_staff"].includes(request.profile?.role);

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projErr || !project) {
    response.status(404).json({ error: "Project not found." });
    return null;
  }

  // Owner & staff have full access
  if (isStaff || project.owner_id === userId) {
    return { project, isOwner: project.owner_id === userId, accessLevel: "owner" };
  }

  // Check project_shares table
  const { data: share } = await supabase
    .from("project_shares")
    .select("*")
    .eq("project_id", projectId)
    .or(`user_id.eq.${userId},email.eq.${userEmail}`)
    .maybeSingle();

  if (!share) {
    response.status(403).json({ error: "Access denied to this project." });
    return null;
  }

  if (requiredPermission === "write" && share.access_level === "viewer") {
    response.status(403).json({ error: "Editor permission required for this project." });
    return null;
  }

  return { project, isOwner: false, accessLevel: share.access_level, shareId: share.id };
}

// 2. List Projects (Owned & Shared)
apiRouter.get("/projects", checkAuth, async (request, response) => {
  try {
    const userId = request.user.id;
    const userEmail = request.user.email;

    // Fetch owned projects
    const { data: ownedProjects, error: ownedErr } = await supabase
      .from("projects")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    if (ownedErr) {
      return response.status(500).json({ error: ownedErr.message });
    }

    // Fetch shared project IDs
    let sharedProjects = [];
    const shareMap = new Map();
    try {
      const { data: shares } = await supabase
        .from("project_shares")
        .select("project_id, access_level, created_at")
        .or(`user_id.eq.${userId},email.eq.${userEmail}`);

      if (shares && shares.length > 0) {
        shares.forEach(s => shareMap.set(s.project_id, s));
        const sharedProjectIds = shares.map(s => s.project_id);

        const { data: sharedProjs } = await supabase
          .from("projects")
          .select("*")
          .in("id", sharedProjectIds);

        if (sharedProjs) {
          sharedProjects = sharedProjs;
        }
      }
    } catch (sErr) {
      console.log("No project_shares query error:", sErr);
    }

    // Merge and flag projects
    const ownedList = (ownedProjects || []).map(p => ({
      ...p,
      isShared: false,
      accessLevel: "owner"
    }));

    const sharedList = sharedProjects
      .filter(p => p.owner_id !== userId)
      .map(p => {
        const s = shareMap.get(p.id);
        return {
          ...p,
          isShared: true,
          accessLevel: s ? s.access_level : "editor"
        };
      });

    const allProjects = [...ownedList, ...sharedList];

    // Get owner profile emails for shared projects
    const ownerIds = [...new Set(sharedList.map(p => p.owner_id))];
    const ownerEmailMap = new Map();
    if (ownerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", ownerIds);
      if (profiles) {
        profiles.forEach(pr => ownerEmailMap.set(pr.id, pr.email));
      }
    }

    // Enhance project stats
    const enhancedProjects = await Promise.all(allProjects.map(async (proj) => {
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
        dueDate: proj.settings?.dueDate || proj.dueDate || null,
        sharedBy: ownerEmailMap.get(proj.owner_id) || null,
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

// 2b. Get Global Workspace History Timeline (MUST be placed before /projects/:projectId)
apiRouter.get("/projects/history", checkAuth, async (request, response) => {
  try {
    const userId = request.user.id;
    const userEmail = request.user.email;

    // Fetch all accessible projects (owned + shared)
    const { data: ownedProjects } = await supabase
      .from("projects")
      .select("id, name, settings, owner_id")
      .eq("owner_id", userId);

    const { data: sharedEntries } = await supabase
      .from("project_shares")
      .select("project_id")
      .or(`user_id.eq.${userId},email.eq.${userEmail}`);

    const sharedProjectIds = (sharedEntries || []).map(s => s.project_id);
    let sharedProjects = [];
    if (sharedProjectIds.length > 0) {
      const { data: sp } = await supabase
        .from("projects")
        .select("id, name, settings, owner_id")
        .in("id", sharedProjectIds);
      sharedProjects = sp || [];
    }

    const allProjectsMap = new Map();
    (ownedProjects || []).forEach(p => allProjectsMap.set(p.id, p));
    (sharedProjects || []).forEach(p => allProjectsMap.set(p.id, p));

    const projectIds = Array.from(allProjectsMap.keys());
    if (projectIds.length === 0) {
      return response.json([]);
    }

    let globalActivities = [];

    // Try fetching from project_activities table
    const { data: tableActivities, error: actErr } = await supabase
      .from("project_activities")
      .select("*")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!actErr && tableActivities && tableActivities.length > 0) {
      globalActivities = tableActivities.map(act => ({
        ...act,
        projectName: allProjectsMap.get(act.project_id)?.name || "Project"
      }));
    } else {
      // Fallback: gather from project settings JSONB
      allProjectsMap.forEach((proj) => {
        const settingsActivities = proj.settings?.activities || [];
        settingsActivities.forEach(act => {
          globalActivities.push({
            ...act,
            project_id: proj.id,
            projectName: proj.name
          });
        });
      });

      globalActivities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    response.json(globalActivities.slice(0, 100));
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to fetch workspace history." });
  }
});

// 3. Get Project Details
apiRouter.get("/projects/:projectId", checkAuth, async (request, response) => {
  try {
    const access = await verifyProjectAccess(request, response, "read");
    if (!access) return;

    const { project } = access;

    // Fetch project documents (files)
    const { data: documents } = await supabase
      .from("documents")
      .select("*")
      .eq("project_id", project.id);

    // Fetch project translation jobs
    const { data: rawJobs } = await supabase
      .from("translation_jobs")
      .select("*, documents(name)")
      .eq("project_id", project.id);

    const jobs = await Promise.all((rawJobs || []).map(async (j) => {
      try {
        const segs = await fetchAllSegments(j.document_id, "source_text, status, target_text", j.target_lang);
        const stats = calculateProgress(segs);
        const newStatus = stats.progress === 100 ? "completed" : j.status;
        if (stats.progress !== j.progress && j.status !== "running") {
          await supabase.from("translation_jobs").update({ progress: stats.progress, status: newStatus }).eq("id", j.id);
        }
        return {
          ...j,
          progress: stats.progress,
          verifiedProgress: stats.verifiedProgress,
          completedSegments: stats.completedSegments,
          verifiedSegments: stats.verifiedSegments,
          totalSegments: stats.totalSegments,
          status: newStatus
        };
      } catch (e) {
        return j;
      }
    }));

    response.json({
      project: {
        ...project,
        isShared: !access.isOwner,
        accessLevel: access.accessLevel
      },
      files: documents || [],
      jobs: jobs || []
    });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to fetch project details." });
  }
});

// 3a. Get Project Access Shares List
apiRouter.get("/projects/:projectId/shares", checkAuth, async (request, response) => {
  try {
    const access = await verifyProjectAccess(request, response, "read");
    if (!access) return;

    const { project } = access;

    // Fetch owner info
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("id", project.owner_id)
      .single();

    const owner = ownerProfile ? {
      userId: ownerProfile.id,
      email: ownerProfile.email,
      name: ownerProfile.email ? ownerProfile.email.split("@")[0] : "Owner",
      role: "owner"
    } : null;

    // Fetch shares
    const { data: shares, error } = await supabase
      .from("project_shares")
      .select("*")
      .eq("project_id", project.id);

    if (error) {
      return response.status(500).json({ error: error.message });
    }

    const collaborators = (shares || []).map(s => ({
      shareId: s.id,
      userId: s.user_id,
      email: s.email,
      name: s.email ? s.email.split("@")[0] : "Collaborator",
      permission: s.access_level === "viewer" ? "read" : "write",
      accessLevel: s.access_level,
      createdAt: s.created_at
    }));

    response.json({ owner, collaborators });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to fetch project access list." });
  }
});

// 3b. Grant Project Share to User
apiRouter.post("/projects/:projectId/share", checkAuth, async (request, response) => {
  try {
    const access = await verifyProjectAccess(request, response, "write");
    if (!access) return;

    if (!access.isOwner && !["admin", "verbolabs_staff"].includes(request.profile?.role)) {
      return response.status(403).json({ error: "Only the project owner can share this project." });
    }

    const { project } = access;
    const { email } = request.body;
    const targetLevel = "editor";

    if (!email || !email.trim()) {
      return response.status(400).json({ error: "User email is required to share project." });
    }

    const targetEmail = email.trim().toLowerCase();

    // Find recipient user profile
    const { data: recipient, error: recErr } = await supabase
      .from("profiles")
      .select("id, email")
      .ilike("email", targetEmail)
      .single();

    if (recErr || !recipient) {
      return response.status(404).json({ error: `User with email "${targetEmail}" was not found.` });
    }

    if (recipient.id === project.owner_id) {
      return response.status(400).json({ error: "Cannot share project with its owner." });
    }

    // Check if share record already exists
    const { data: existingShare } = await supabase
      .from("project_shares")
      .select("id")
      .eq("project_id", project.id)
      .or(`user_id.eq.${recipient.id},email.eq.${recipient.email}`)
      .maybeSingle();

    let share = null;
    if (existingShare) {
      const { data: updated, error: updateErr } = await supabase
        .from("project_shares")
        .update({
          access_level: targetLevel,
          user_id: recipient.id,
          email: recipient.email
        })
        .eq("id", existingShare.id)
        .select()
        .single();

      if (updateErr) {
        console.error("project_shares update error:", updateErr);
        return response.status(500).json({ error: "Failed to update project share." });
      }
      share = updated;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("project_shares")
        .insert({
          project_id: project.id,
          user_id: recipient.id,
          email: recipient.email,
          access_level: targetLevel,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertErr) {
        console.error("project_shares insert error:", insertErr);
        return response.status(500).json({ error: "Failed to save project share." });
      }
      share = inserted;
    }

    // Automatically grant access to all existing documents in this project
    const { data: projectDocs } = await supabase
      .from("documents")
      .select("id")
      .eq("project_id", project.id);

    if (projectDocs && projectDocs.length > 0) {
      const docAccessInserts = projectDocs.map(doc => ({
        document_id: doc.id,
        user_id: recipient.id,
        permission: targetLevel === "viewer" ? "read" : "write"
      }));

      await supabase
        .from("document_access")
        .upsert(docAccessInserts, { onConflict: "document_id,user_id" });
    }

    // Socket notification to recipient
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      io.to(`user:${recipient.id}`).emit("project-shared", {
        projectId: project.id,
        projectName: project.name,
        sharedBy: request.user.email,
        accessLevel: targetLevel
      });
    }

    await logProjectActivity(project.id, "PROJECT_SHARED", { sharedWith: recipient.email, accessLevel: targetLevel }, request.user.email);

    response.json({ success: true, share });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to share project." });
  }
});

// 3c. Revoke Project Share
apiRouter.delete("/projects/:projectId/shares/:targetId", checkAuth, async (request, response) => {
  try {
    const access = await verifyProjectAccess(request, response, "write");
    if (!access) return;

    if (!access.isOwner && !["admin", "verbolabs_staff"].includes(request.profile?.role)) {
      return response.status(403).json({ error: "Only the project owner can manage or revoke access." });
    }

    const { project } = access;
    const { targetId } = request.params;

    if (targetId === project.owner_id) {
      return response.status(400).json({ error: "Cannot remove access from the project owner." });
    }

    // Delete share record
    const { error: delErr } = await supabase
      .from("project_shares")
      .delete()
      .eq("project_id", project.id)
      .or(`id.eq.${targetId},user_id.eq.${targetId}`);

    if (delErr) {
      console.error(delErr);
      return response.status(500).json({ error: "Failed to revoke project share." });
    }

    // Clean up document_access for project files
    const { data: projectDocs } = await supabase
      .from("documents")
      .select("id")
      .eq("project_id", project.id);

    if (projectDocs && projectDocs.length > 0) {
      const docIds = projectDocs.map(d => d.id);
      await supabase
        .from("document_access")
        .delete()
        .in("document_id", docIds)
        .eq("user_id", targetId);
    }

    await logProjectActivity(project.id, "ACCESS_REVOKED", { targetId }, request.user.email);

    response.json({ success: true });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to revoke project share." });
  }
});

// Helper functions for project notes
function getNotesFromSettings(settings) {
  if (!settings || typeof settings !== "object") return [];
  return Array.isArray(settings.notes) ? settings.notes : [];
}

async function updateNotesInSettings(projectId, currentSettings, newNotes) {
  const updatedSettings = { ...(currentSettings || {}), notes: newNotes };
  const { error } = await supabase
    .from("projects")
    .update({ settings: updatedSettings, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) throw error;
  return updatedSettings;
}

// 3d. Duplicate Project
apiRouter.post("/projects/:projectId/duplicate", checkAuth, async (request, response) => {
  try {
    const access = await verifyProjectAccess(request, response, "read");
    if (!access) return;

    const { project } = access;
    const newName = `${project.name} (Copy)`;

    const { data: newProj, error: createErr } = await supabase
      .from("projects")
      .insert({
        name: newName,
        client: project.client || null,
        description: project.description || null,
        source_lang: project.source_lang,
        target_languages: project.target_languages || [],
        owner_id: request.user.id,
        settings: project.settings || {}
      })
      .select()
      .single();

    if (createErr || !newProj) {
      console.error("Failed to duplicate project:", createErr);
      return response.status(500).json({ error: "Failed to duplicate project." });
    }

    response.json({ success: true, project: newProj });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to duplicate project." });
  }
});

// 3e. Fetch Project Notes
apiRouter.get("/projects/:projectId/notes", checkAuth, async (request, response) => {
  try {
    const access = await verifyProjectAccess(request, response, "read");
    if (!access) return;

    const notes = getNotesFromSettings(access.project.settings);
    response.json({ notes, isOwner: access.isOwner });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to fetch project notes." });
  }
});

// 3f. Create Project Note
apiRouter.post("/projects/:projectId/notes", checkAuth, async (request, response) => {
  try {
    const access = await verifyProjectAccess(request, response, "write");
    if (!access) return;

    const { content, isPinned } = request.body;
    if (!content || !content.trim()) {
      return response.status(400).json({ error: "Note content cannot be empty." });
    }

    const currentNotes = getNotesFromSettings(access.project.settings);
    const authorName = request.profile?.display_name || request.user.email.split("@")[0];

    const newNote = {
      id: require("crypto").randomUUID(),
      content: content.trim(),
      author_id: request.user.id,
      author_name: authorName,
      author_email: request.user.email,
      is_pinned: !!isPinned,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const updatedNotes = [newNote, ...currentNotes];
    await updateNotesInSettings(access.project.id, access.project.settings, updatedNotes);

    response.json({ success: true, note: newNote, notes: updatedNotes });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to save project note." });
  }
});

// 3g. Edit Project Note
apiRouter.put("/projects/:projectId/notes/:noteId", checkAuth, async (request, response) => {
  try {
    const access = await verifyProjectAccess(request, response, "write");
    if (!access) return;

    const { noteId } = request.params;
    const { content, isPinned } = request.body;

    const currentNotes = getNotesFromSettings(access.project.settings);
    const targetIdx = currentNotes.findIndex(n => n.id === noteId);

    if (targetIdx === -1) {
      return response.status(404).json({ error: "Note not found." });
    }

    const targetNote = currentNotes[targetIdx];
    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile?.role);
    const isCreator = targetNote.author_id === request.user.id || targetNote.author_email === request.user.email;

    if (!access.isOwner && !isStaff && !isCreator) {
      return response.status(403).json({ error: "You can only edit your own notes unless you are the project owner." });
    }

    const updatedNote = {
      ...targetNote,
      content: content !== undefined ? content.trim() : targetNote.content,
      is_pinned: isPinned !== undefined ? !!isPinned : targetNote.is_pinned,
      updated_at: new Date().toISOString()
    };

    currentNotes[targetIdx] = updatedNote;
    await updateNotesInSettings(access.project.id, access.project.settings, currentNotes);

    response.json({ success: true, note: updatedNote, notes: currentNotes });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to update project note." });
  }
});

// 3h. Delete Project Note
apiRouter.delete("/projects/:projectId/notes/:noteId", checkAuth, async (request, response) => {
  try {
    const access = await verifyProjectAccess(request, response, "write");
    if (!access) return;

    const { noteId } = request.params;
    const currentNotes = getNotesFromSettings(access.project.settings);
    const targetNote = currentNotes.find(n => n.id === noteId);

    if (!targetNote) {
      return response.status(404).json({ error: "Note not found." });
    }

    const isStaff = ["admin", "verbolabs_staff"].includes(request.profile?.role);
    const isCreator = targetNote.author_id === request.user.id || targetNote.author_email === request.user.email;

    if (!access.isOwner && !isStaff && !isCreator) {
      return response.status(403).json({ error: "You can only delete your own notes unless you are the project owner." });
    }

    const updatedNotes = currentNotes.filter(n => n.id !== noteId);
    await updateNotesInSettings(access.project.id, access.project.settings, updatedNotes);

    response.json({ success: true, notes: updatedNotes });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to delete project note." });
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
    const { name, client, status, description, sourceLanguage, targetLanguages, dueDate, settings } = request.body;

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
    if (settings !== undefined || dueDate !== undefined) {
      updateData.settings = { 
        ...existingProject.settings, 
        ...(settings || {}),
        ...(dueDate !== undefined ? { dueDate } : {}) 
      };
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
    const access = await verifyProjectAccess(request, response, "read");
    if (!access) return;

    const { project } = access;

    // Try fetching from project_activities table
    const { data: activities, error: actErr } = await supabase
      .from("project_activities")
      .select("*")
      .eq("project_id", project.id)
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

    // Verify project access
    const access = await verifyProjectAccess(request, response, "write");
    if (!access) return;

    const project = access.project;

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

    // Sync document_access for all shared project members
    try {
      const { data: projectShares } = await supabase
        .from("project_shares")
        .select("user_id, access_level")
        .eq("project_id", projectId);

      if (projectShares && projectShares.length > 0) {
        const docAccessInserts = projectShares.map(share => ({
          document_id: documentId,
          user_id: share.user_id,
          permission: share.access_level === "viewer" ? "read" : "write"
        }));

        await supabase
          .from("document_access")
          .upsert(docAccessInserts, { onConflict: "document_id,user_id" });
      }
    } catch (syncErr) {
      console.error("Failed to sync document_access for shared members:", syncErr);
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

    // 2. Persist parsed source template segments to the database in fast parallel batches of 1000
    const BATCH_SIZE = 1000;
    const batchPromises = [];
    for (let i = 0; i < segmentInserts.length; i += BATCH_SIZE) {
      const batch = segmentInserts.slice(i, i + BATCH_SIZE);
      batchPromises.push(supabase.from("document_segments").insert(batch));
    }
    const batchResults = await Promise.all(batchPromises);
    const hasBatchError = batchResults.some(r => r.error);
    if (hasBatchError) {
      console.error("Failed to insert document segments batch");
      await supabase.from("documents").delete().eq("id", documentId);
      return response.status(500).json({ error: "Failed to persist document segments." });
    }

    // 3. Auto-initialize translation jobs for target languages selected in the project
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
                source_text: seg.source_text,
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

    const { data: jobs } = await supabase
      .from("translation_jobs")
      .select("id, status, document_id, progress, project_id, target_lang, documents(name)")
      .eq("id", jobId)
      .limit(1);

    let job = jobs && jobs.length > 0 ? jobs[0] : null;

    if (!job && jobId.includes("_")) {
      const parts = jobId.split("_");
      const docId = parts[0];
      const targetLang = parts[1];

      const { data: existingJobs } = await supabase
        .from("translation_jobs")
        .select("id, status, document_id, progress, project_id, target_lang, documents(name)")
        .eq("document_id", docId)
        .eq("target_lang", targetLang)
        .limit(1);

      if (existingJobs && existingJobs.length > 0) {
        job = existingJobs[0];
      } else {
        const { data: doc } = await supabase
          .from("documents")
          .select("project_id, name, word_count")
          .eq("id", docId)
          .maybeSingle();

        if (doc) {
          const { data: newJob } = await supabase
            .from("translation_jobs")
            .insert({
              project_id: doc.project_id,
              document_id: docId,
              target_lang: targetLang,
              status: "pending",
              progress: 0,
              word_count: doc.word_count || 0
            })
            .select("id, status, document_id, progress, project_id, target_lang")
            .maybeSingle();

          if (newJob) {
            job = { ...newJob, documents: { name: doc.name } };
          }
        }
      }
    }

    if (!job) {
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

    const { broadcastJobStatus, runJob } = require("../services/jobQueue");
    await supabase
      .from("translation_jobs")
      .update({ status: newStatus, error_message: null })
      .eq("id", jobId);

    broadcastJobStatus(jobId, job.document_id, newStatus, job.progress);

    if (newStatus === "pending") {
      await logProjectActivity(job.project_id, "translation_started", {
        jobId,
        fileName: job.documents?.name || "Document",
        targetLang: job.target_lang
      }, request.user.email);

      // Trigger AI translation job worker asynchronously
      runJob(job).catch(err => console.error(`[JobWorker] Error executing job ${jobId}:`, err));
    }

    response.json({ success: true, status: newStatus });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to perform queue action." });
  }
});

// Get individual job status & progress
apiRouter.get("/jobs/:jobId/status", checkAuth, async (request, response) => {
  try {
    const { jobId } = request.params;
    const { data: job, error } = await supabase
      .from("translation_jobs")
      .select("id, document_id, status, progress, target_lang, word_count, error_message, updated_at")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return response.status(404).json({ error: "Job not found." });
    }

    try {
      const segs = await fetchAllSegments(job.document_id, "source_text, status, target_text", job.target_lang);
      const stats = calculateProgress(segs);
      return response.json({
        ...job,
        progress: stats.progress,
        verifiedProgress: stats.verifiedProgress,
        completedSegments: stats.completedSegments,
        verifiedSegments: stats.verifiedSegments,
        totalSegments: stats.totalSegments
      });
    } catch (e) {
      return response.json(job);
    }
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to fetch job status." });
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
    const { data: jobs } = await supabase
      .from("translation_jobs")
      .select("*, documents(name, file_id, source_lang, owner_id, track_changes_enabled), projects(name, settings)")
      .eq("document_id", documentId)
      .eq("target_lang", lang)
      .order("created_at", { ascending: false })
      .limit(1);

    let job = jobs && jobs.length > 0 ? jobs[0] : null;
    let doc = job?.documents;
    let project = job?.projects;

    if (!doc) {
      const { data: directDoc } = await supabase
        .from("documents")
        .select("*, projects(name, settings)")
        .eq("id", documentId)
        .maybeSingle();

      if (!directDoc) {
        return response.status(404).json({ error: "Document not found." });
      }
      doc = directDoc;
      project = directDoc.projects;
    }

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

    // Deduplicate segments by segment_index to prevent duplicate IDs or repeating segment rows
    const seenIndices = new Set();
    const cleanSegmentsList = [];
    (segments || []).forEach(seg => {
      const idxKey = seg.segment_index !== undefined && seg.segment_index !== null ? seg.segment_index : cleanSegmentsList.length;
      if (!seenIndices.has(idxKey)) {
        seenIndices.add(idxKey);
        cleanSegmentsList.push(seg);
      }
    });

    const mappedSegments = cleanSegmentsList.map((seg, idx) => {
      const seqId = idx + 1; // Strict 1-indexed sequential segment number
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
        id: seqId,
        uniqueKey: `doc-${documentId}-seg-${seqId}`,
        segmentIndex: seg.segment_index !== undefined ? seg.segment_index : idx,
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
      jobId: job?.id || documentId,
      documentId,
      projectId: job?.project_id || doc.project_id,
      targetLang: lang,
      sourceLang: doc.source_lang,
      fileName: doc.name,
      fileId: doc.file_id,
      permission,
      ownerId: doc.owner_id,
      trackChangesEnabled: doc.track_changes_enabled,
      contextSettings: project?.settings || {},
      projectName: project?.name || "",
      jobStatus: job?.status || "Active",
      jobProgress: job?.progress || 0,
      segments: mappedSegments
    });
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: "Failed to load segments." });
  }
});

// 16. Update segment for a document + lang
apiRouter.put("/documents/:documentId/lang/:lang/segments/:index", checkAuth, async (request, response) => {
  try {
    const { documentId, lang, index } = request.params;
    const segmentIndex = parseInt(index, 10);
    const { targetText, status, contextJira, contextDescription, autoPropagate } = request.body;

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
      .eq("document_id", documentId)
      .eq("target_lang", lang)
      .eq("segment_index", segmentIndex);

    if (updateErr) {
      return response.status(500).json({ error: updateErr.message });
    }

    // Save/Update human correction in Translation Memory as an ICE match
    if (targetText !== undefined && targetText !== null && String(targetText).trim() !== "") {
      try {
        const { data: dbSegment } = await supabase
          .from("document_segments")
          .select("source_text")
          .eq("document_id", documentId)
          .eq("target_lang", lang)
          .eq("segment_index", segmentIndex)
          .maybeSingle();

        const { data: doc } = await supabase
          .from("documents")
          .select("source_lang")
          .eq("id", documentId)
          .maybeSingle();

        if (dbSegment && doc) {
          const { upsertLinguistIceMatch } = require("../services/translationService");
          await upsertLinguistIceMatch(dbSegment.source_text, targetText, doc.source_lang || "en", lang);
        }
      } catch (err) {
        console.error("Failed to save segment human correction to TM:", err);
      }
    }

    // Broadcast update via Socket.io
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      io.to(getDocumentRoomId(documentId, lang)).emit("segment-updated", {
        segmentIndex,
        targetText: updateFields.target_text,
        status: updateFields.status,
        updatedBy: request.user.email,
        targetLang: lang
      });
    }

    // Update job progress
    const segments = await fetchAllSegments(documentId, "source_text, status, target_text", lang);
    const progress = calculateProgress(segments).progress;

    const { broadcastJobStatus } = require("../services/jobQueue");
    
    // Find job id to update
    const { data: job } = await supabase
      .from("translation_jobs")
      .select("id")
      .eq("document_id", documentId)
      .eq("target_lang", lang)
      .single();

    if (job) {
      const newStatus = progress === 100 ? "completed" : "running";
      await supabase
        .from("translation_jobs")
        .update({ progress, status: newStatus })
        .eq("id", job.id);

      broadcastJobStatus(job.id, documentId, newStatus, progress);
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

    const { data: segment } = await supabase
      .from("document_segments")
      .select("source_text, target_text")
      .eq("document_id", documentId)
      .eq("target_lang", lang)
      .eq("segment_index", segmentIndex)
      .single();

    if (!segment) {
      return response.status(404).json({ error: "Segment not found." });
    }

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
// ═══════════════════════════════════════════════════════════
// PROTECTED CONTENT MANAGEMENT ROUTES
// ═══════════════════════════════════════════════════════════

const { 
  scanTextForProtectedContent, 
  PRESET_PATTERNS 
} = require("../utils/protectedContentEngine");

// 1. Scan project text for protected content
apiRouter.post("/projects/:projectId/protected-content/scan", checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;
    const { options } = request.body;

    // Fetch all document IDs under project
    const { data: docs } = await supabase
      .from("documents")
      .select("id")
      .eq("project_id", projectId);

    if (!docs || docs.length === 0) {
      return response.json({ categories: {}, totalProtectedItems: 0, allProtectedList: [] });
    }

    const docIds = docs.map(d => d.id);

    // Fetch all source template segments for these documents
    const { data: sourceSegments } = await supabase
      .from("document_segments")
      .select("source_text")
      .in("document_id", docIds)
      .is("target_lang", null);

    const scanResults = scanTextForProtectedContent(sourceSegments || [], options || {});
    response.json(scanResults);
  } catch (err) {
    console.error("Protected content scan error:", err);
    response.status(500).json({ error: "Failed to scan project for protected content." });
  }
});

// 2. Get protected content rules for a project
apiRouter.get("/projects/:projectId/protected-content/rules", checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;
    const { data: project, error } = await supabase
      .from("projects")
      .select("settings")
      .eq("id", projectId)
      .single();

    if (error || !project) {
      return response.status(404).json({ error: "Project not found." });
    }

    const settings = project.settings || {};
    const protectedRules = settings.protectedContentRules || {
      activeCategories: Object.keys(PRESET_PATTERNS),
      manualTerms: [],
      customRegexRules: [],
      protectedMatches: []
    };

    response.json(protectedRules);
  } catch (err) {
    console.error("Failed to fetch protected content rules:", err);
    response.status(500).json({ error: "Failed to fetch protected rules." });
  }
});

// 3. Save protected content rules for a project
apiRouter.put("/projects/:projectId/protected-content/rules", checkAuth, async (request, response) => {
  try {
    const { projectId } = request.params;
    const { rules } = request.body;

    const { data: project, error: fetchErr } = await supabase
      .from("projects")
      .select("settings")
      .eq("id", projectId)
      .single();

    if (fetchErr || !project) {
      return response.status(404).json({ error: "Project not found." });
    }

    const updatedSettings = {
      ...(project.settings || {}),
      protectedContentRules: rules || {}
    };

    const { error: updateErr } = await supabase
      .from("projects")
      .update({ settings: updatedSettings, updated_at: new Date().toISOString() })
      .eq("id", projectId);

    if (updateErr) {
      return response.status(500).json({ error: "Failed to save protected rules." });
    }

    response.json({ success: true, rules: updatedSettings.protectedContentRules });
  } catch (err) {
    console.error("Failed to save protected content rules:", err);
    response.status(500).json({ error: "Failed to save protected content rules." });
  }
});

module.exports = {
  apiRouter
};
