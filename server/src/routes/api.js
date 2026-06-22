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
      status: seg.status
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
    const { targetText, status } = request.body;

    const { error: updateError } = await supabase
      .from("document_segments")
      .update({
        target_text: targetText,
        status: status || "translated",
        updated_at: new Date().toISOString()
      })
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
        updatedBy: request.user.email
      });
    }

    response.json({ success: true });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  }
});

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

    response.json({ success: true });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  }
});

module.exports = {
  apiRouter
};
