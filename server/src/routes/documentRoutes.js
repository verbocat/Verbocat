const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { processUploadedFile } = require("../services/fileService");
const { supabase } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");

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
      return response.status(400).json({ error: "No file was uploaded." });
    }

    const result = await processUploadedFile(request.file);
    const userId = request.user.id;
    const documentId = result.fileId;
    const activeTenantId = request.tenant?.id || request.organization?.id || request.profile?.organization_id || null;

    // Create document record
    const { error: docError } = await supabase
      .from("documents")
      .insert({
        id: documentId,
        name: result.originalName || "Untitled Document",
        owner_id: userId,
        file_id: result.fileId,
        source_lang: request.body.source || "en",
        target_lang: request.body.target || "hi",
        organization_id: activeTenantId
      });

    if (docError) {
      return response.status(500).json({ error: `Failed to create document record: ${docError.message || "Database error"}` });
    }

    // Persist parsed segments to DB in batches
    const segmentInserts = result.segments.map((seg, idx) => ({
      document_id: documentId,
      segment_index: idx,
      source_text: seg.source || "",
      target_text: seg.target || "",
      status: "draft"
    }));

    const BATCH_SIZE = 500;
    for (let i = 0; i < segmentInserts.length; i += BATCH_SIZE) {
      const batch = segmentInserts.slice(i, i + BATCH_SIZE);
      const { error: segError } = await supabase
        .from("document_segments")
        .insert(batch);

      if (segError) {
        await supabase.from("documents").delete().eq("id", documentId);
        return response.status(500).json({ error: `Failed to persist segments: ${segError.message || "Database error"}` });
      }
    }

    response.json({
      type: result.type,
      documentId,
      segments: result.segments,
      originalName: result.originalName
    });
  } catch (error) {
    console.error("Single File Upload Error:", error);
    const statusCode = (error.status >= 100 && error.status < 1000) ? error.status : 500;
    response.status(statusCode).json({ error: error.message || "Server error during single file upload." });
  }
});

// 2. Delete Document
documentRouter.delete("/documents/:id", checkAuth, async (request, response) => {
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
