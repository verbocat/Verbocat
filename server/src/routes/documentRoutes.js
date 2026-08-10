const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { processUploadedFile } = require("../services/fileService");
const { supabase, fetchAllSegments } = require("../config/supabase");
const { checkAuth } = require("../utils/authMiddleware");
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
      return response.status(400).json({ error: "No file was uploaded." });
    }

    const ext = path.extname(request.file.originalname).toLowerCase();
    const DANGEROUS_EXTS = [".exe", ".php", ".sh", ".bat", ".cmd", ".js", ".py", ".vbs", ".ps1", ".dll", ".so", ".app", ".cgi", ".msi", ".scr", ".pif"];
    if (DANGEROUS_EXTS.includes(ext)) {
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
      return response.status(400).json({ error: "Source and target language cannot be the same." });
    }

    // Create document record
    const { error: docError } = await supabase
      .from("documents")
      .insert({
        id: documentId,
        name: result.originalName || request.file.originalname || "Untitled Document",
        owner_id: userId,
        file_id: result.fileId,
        source_lang: srcLang,
        target_lang: tgtLang,
        organization_id: activeTenantId
      });

    if (docError) {
      return response.status(500).json({ error: `Failed to create document record: ${docError.message || "Database error"}` });
    }

    // Persist parsed template segments to DB in parallel batches (target_lang: null)
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
      await supabase.from("documents").delete().eq("id", documentId);
      return response.status(500).json({ error: `Failed to persist segments: ${failed.error.message || "Database error"}` });
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

// 2. Get Single Document Metadata and Segments
documentRouter.get(["/documents/:id", "/api/documents/:id"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const activeTenantId = request.tenant?.id || request.profile?.organization_id;
    const isSuperAdmin = request.profile?.role === "super_admin";

    let query = supabase
      .from("documents")
      .select("*")
      .eq("id", id);

    if (!isSuperAdmin && activeTenantId) {
      query = query.eq("organization_id", activeTenantId);
    }

    const { data: doc, error } = await query.single();
    if (error || !doc) {
      return response.status(404).json({ error: "Document not found or access denied." });
    }

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
      permission: "write",
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
        if (s.proposed_text) {
          await supabase.from("document_segments").update({
            target_text: s.proposed_text,
            proposed_text: null,
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

// 5. Access Management Endpoints
documentRouter.get(["/documents/:id/access", "/api/documents/:id/access"], checkAuth, async (request, response) => {
  try {
    const { id } = request.params;
    const { data: shares } = await supabase.from("document_access").select("*, profiles(*)").eq("document_id", id);
    response.json({ access: shares || [] });
  } catch (error) {
    response.json({ access: [] });
  }
});

documentRouter.get(["/documents/:id/request-status", "/api/documents/:id/request-status"], checkAuth, async (request, response) => {
  response.json({ status: "none" });
});

documentRouter.get(["/documents/:id/access-requests", "/api/documents/:id/access-requests"], checkAuth, async (request, response) => {
  response.json({ requests: [] });
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
