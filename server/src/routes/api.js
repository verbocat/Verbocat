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
    const { segments, target, source, contextSettings, fileName } = request.body;
    const result = await translateSegments(segments, target, source, contextSettings);
    
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
    const { fileId, segments, extension, sourceLang, targetLang, fileName } = request.body;
    const ext = extension || ".html";

    if (ext === ".xlf" || ext === ".xliff") {
      const xliffContent = generateXliff(segments, sourceLang || "en", targetLang || "hi", fileName || "document");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName || "translated"}.xlf"`
      );
      response.setHeader("Content-Type", "application/x-xliff+xml");
      return response.send(Buffer.from(xliffContent, "utf-8"));
    }

    if (ext === ".tmx") {
      const tmxContent = generateTmx(segments, sourceLang || "en", targetLang || "hi");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName || "translated"}.tmx"`
      );
      response.setHeader("Content-Type", "application/xml");
      return response.send(Buffer.from(tmxContent, "utf-8"));
    }

    const buffer = await exportHtml(fileId, segments, ext);

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

// Helper helper to check document access permission
async function verifyDocumentAccess(request, response, requiredPermission = "read") {
  const documentId = request.params.id;
  const userId = request.user.id;
  const role = request.profile.role;

  const isStaff = ["admin", "manager", "verbolabs_staff"].includes(role);

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
    const isStaff = ["admin", "manager", "verbolabs_staff"].includes(request.profile.role);
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
      mqmReport: seg.mqm_report || null
    }));

    response.json({
      documentId: doc.id,
      name: doc.name,
      ownerId: doc.owner_id,
      fileId: doc.file_id,
      sourceLang: doc.source_lang,
      targetLang: doc.target_lang,
      permission: userPermission,
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

    let mqmScore = undefined;
    let mqmReport = undefined;

    if (targetText !== undefined) {
      // Fetch the source text and context first to evaluate MQM accurately
      const { data: dbSegment } = await supabase
        .from("document_segments")
        .select("source_text, context_jira, context_description")
        .eq("document_id", doc.id)
        .eq("segment_index", segmentIndex)
        .single();
      
      if (dbSegment) {
        const { evaluateTranslationMQM } = require("../services/mqmService");
        try {
          const evaluation = await evaluateTranslationMQM({
            sourceText: dbSegment.source_text,
            translatedText: targetText,
            targetLang: doc.target_lang,
            sourceLang: doc.source_lang,
            contextJira: contextJira !== undefined ? contextJira : dbSegment.context_jira,
            contextDescription: contextDescription !== undefined ? contextDescription : dbSegment.context_description,
            contextSettings: null
          });
          mqmScore = evaluation.accuracyScore;
          mqmReport = evaluation;
          updateFields.mqm_accuracy_score = mqmScore;
          updateFields.mqm_report = mqmReport;
        } catch (err) {
          console.error("Failed to run MQM on manual update:", err);
        }
      }
    }

    const { error: updateError } = await supabase
      .from("document_segments")
      .update(updateFields)
      .eq("document_id", doc.id)
      .eq("segment_index", segmentIndex);

    if (updateError) {
      console.error("Segment update error:", updateError);
      return response.status(500).json({ error: "Failed to update segment." });
    }

    // Broadcast update via Socket.io
    const { getIo } = require("../services/socket");
    const io = getIo();
    if (io) {
      io.to(doc.id).emit("segment-updated", {
        segmentIndex,
        targetText,
        status: status || "translated",
        contextJira,
        contextDescription,
        mqmAccuracyScore: mqmScore,
        mqmReport,
        updatedBy: request.user.email
      });
    }

    response.json({ 
      success: true,
      mqmAccuracyScore: mqmScore,
      mqmReport
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

      // Fetch the segment source text and existing target text
      const { data: segment, error: fetchErr } = await supabase
        .from("document_segments")
        .select("source_text, target_text")
        .eq("document_id", doc.id)
        .eq("segment_index", segmentIndex)
        .single();

      if (fetchErr || !segment) {
        return response.status(404).json({ error: "Segment not found." });
      }

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
        contextSettings
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

// 3. Get list of users with explicit access
apiRouter.get("/documents/:id/access", checkAuth, async (request, response) => {
  try {
    const doc = await verifyDocumentAccess(request, response, "read");
    if (!doc) return;

    const isStaff = ["admin", "manager", "verbolabs_staff"].includes(request.profile.role);
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

    const isStaff = ["admin", "manager", "verbolabs_staff"].includes(request.profile.role);
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

    const isStaff = ["admin", "manager", "verbolabs_staff"].includes(request.profile.role);
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
      console.error(error);
      return response.status(500).json({ error: "Failed to get request status." });
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
      console.error(insertError);
      return response.status(500).json({ error: "Failed to submit access request." });
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

    const isStaff = ["admin", "manager", "verbolabs_staff"].includes(request.profile.role);
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
      console.error(error);
      return response.status(500).json({ error: "Failed to load access requests." });
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

    const isStaff = ["admin", "manager", "verbolabs_staff"].includes(request.profile.role);
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
      console.error(updateReqError);
      return response.status(500).json({ error: "Failed to update request status." });
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

module.exports = {
  apiRouter
};
