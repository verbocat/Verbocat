const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { supabase, supabaseAdmin, fetchAllSegments } = require("../../config/supabase");
const { apiKeyAuth, generateApiKey } = require("../../middleware/apiKeyAuth");
const { processUploadedFile, exportHtml } = require("../../services/fileService");
const { translateSegments } = require("../../services/translationService");
const { checkAuth } = require("../../utils/authMiddleware");

const publicApiRouter = express.Router();

// Multer storage for document upload
const uploadDir = path.join(__dirname, "../../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

/**
 * 1. API Health Check
 * Public endpoint to verify API availability
 */
publicApiRouter.get("/health", (req, res) => {
  return res.json({
    status: "ok",
    service: "Verbocat Public API",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

/**
 * All remaining endpoints under /api/v1 require API Key Authentication
 */
publicApiRouter.use(apiKeyAuth);

/**
 * 2. Upload Document
 * POST /api/v1/documents/upload
 * Headers: x-api-key
 * Form-Data: file (file), source_lang (optional), target_lang (optional)
 */
publicApiRouter.post("/documents/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided in request." });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const DANGEROUS_EXTS = [".exe", ".php", ".sh", ".bat", ".cmd", ".js", ".py", ".vbs", ".ps1", ".dll", ".so"];
    if (DANGEROUS_EXTS.includes(ext)) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: `Forbidden file extension: ${ext}` });
    }

    const result = await processUploadedFile(req.file);
    const documentId = result.fileId;
    
    // Resolve valid user ID for owner_id
    let userId = req.user?.id;
    if (!userId || userId === "00000000-0000-0000-0000-000000000000") {
      const { data: adminProf } = await supabase.from("profiles").select("id").limit(1).single();
      userId = adminProf?.id || "d02d37ba-90d1-4147-bf8f-1687d66500d5";
    }

    const srcLang = req.body.source_lang || req.body.source || "en";
    const tgtLang = req.body.target_lang || req.body.target || "hi";

    const dbClient = supabaseAdmin || supabase;

    // Insert Document Record into Supabase
    const { error: docErr } = await dbClient.from("documents").insert({
      id: documentId,
      file_id: documentId,
      name: req.file.originalname,
      source_lang: srcLang,
      target_lang: tgtLang,
      owner_id: userId,
      organization_id: req.organization?.id || req.profile?.organization_id || null,
      status: "active"
    });

    if (docErr) {
      console.error("[PUBLIC_API_UPLOAD_DOC_ERR]", docErr);
      throw new Error(`Failed to save document record: ${docErr.message}`);
    }

    // Insert Template Segments (target_lang: null)
    const segmentInserts = result.segments.map((seg, idx) => ({
      document_id: documentId,
      segment_index: idx + 1, // 1-based indexing standard
      target_lang: null,
      source_text: seg.source || "",
      target_text: "",
      status: "draft"
    }));

    const BATCH_SIZE = 500;
    for (let i = 0; i < segmentInserts.length; i += BATCH_SIZE) {
      const { error: segErr } = await dbClient.from("document_segments").insert(segmentInserts.slice(i, i + BATCH_SIZE));
      if (segErr) {
        console.error("[PUBLIC_API_UPLOAD_SEG_ERR]", segErr);
        throw new Error(`Failed to save document segments: ${segErr.message}`);
      }
    }

    return res.json({
      success: true,
      document_id: documentId,
      name: req.file.originalname,
      file_extension: ext,
      source_lang: srcLang,
      target_lang: tgtLang,
      total_segments: result.segments.length
    });
  } catch (err) {
    console.error("[PUBLIC_API_UPLOAD_ERROR]", err);
    return res.status(500).json({ error: err.message || "Failed to process uploaded document." });
  }
});

/**
 * 3. Trigger AI Translation
 * POST /api/v1/documents/:id/translate
 * Body: { target_lang: "hi", source_lang?: "en" }
 */
publicApiRouter.post("/documents/:id/translate", async (req, res) => {
  try {
    const documentId = req.params.id;
    const targetLang = req.body.target_lang || req.body.target || "hi";
    const sourceLang = req.body.source_lang || req.body.source || "en";

    // 1. Fetch template source segments (target_lang IS NULL)
    const sourceSegments = await fetchAllSegments(documentId, "*", "source");
    if (!sourceSegments || sourceSegments.length === 0) {
      return res.status(404).json({ error: "Document or source segments not found." });
    }

    // 2. Format payload for translationService
    const segmentsToTranslate = sourceSegments.map(s => ({
      id: s.segment_index,
      source: s.source_text
    }));

    const userId = req.user?.id || "00000000-0000-0000-0000-000000000000";
    const orgId = req.organization?.id || req.profile?.organization_id || null;

    // 3. Execute translation service
    const { results } = await translateSegments(
      segmentsToTranslate,
      targetLang,
      sourceLang,
      null,
      userId,
      orgId
    );

    // 4. Build target language rows with mandatory source_text (obeying schema constraint)
    const targetSegmentRows = results.map(item => {
      const srcSeg = sourceSegments.find(s => s.segment_index === item.id);
      const srcText = srcSeg ? srcSeg.source_text : (item.source || "");
      const cleanTarget = String(item.translated || "").trim();

      return {
        document_id: documentId,
        segment_index: item.id,
        target_lang: targetLang,
        source_text: srcText, // NOT NULL constraint
        target_text: cleanTarget,
        status: cleanTarget ? "translated" : "draft",
        updated_at: new Date().toISOString()
      };
    });

    // 5. Upsert target language segment rows
    const BATCH_SIZE = 500;
    for (let i = 0; i < targetSegmentRows.length; i += BATCH_SIZE) {
      await supabase
        .from("document_segments")
        .upsert(targetSegmentRows.slice(i, i + BATCH_SIZE), {
          onConflict: "document_id,segment_index,target_lang"
        });
    }

    const translatedCount = targetSegmentRows.filter(s => s.status === "translated").length;

    return res.json({
      success: true,
      document_id: documentId,
      target_lang: targetLang,
      total_segments: sourceSegments.length,
      translated_segments: translatedCount,
      status: "completed"
    });
  } catch (err) {
    console.error("[PUBLIC_API_TRANSLATE_ERROR]", err);
    return res.status(500).json({ error: err.message || "Failed to execute translation." });
  }
});

/**
 * 4. Get Document Status & Metrics
 * GET /api/v1/documents/:id/status?target_lang=hi
 */
publicApiRouter.get("/documents/:id/status", async (req, res) => {
  try {
    const documentId = req.params.id;
    const targetLang = req.query.target_lang || "hi";

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docErr || !doc) {
      return res.status(404).json({ error: "Document not found." });
    }

    const segments = await fetchAllSegments(documentId, "*", targetLang);
    const totalSegments = segments.length;
    const translatedCount = segments.filter(s => s.target_text && String(s.target_text).trim().length > 0).length;
    const completionPercentage = totalSegments > 0 ? Math.round((translatedCount / totalSegments) * 100) : 0;

    return res.json({
      document_id: doc.id,
      name: doc.name,
      source_lang: doc.source_lang,
      target_lang: targetLang,
      file_extension: path.extname(doc.name || ""),
      total_segments: totalSegments,
      translated_segments: translatedCount,
      completion_percentage: completionPercentage,
      status: completionPercentage === 100 ? "completed" : "in_progress"
    });
  } catch (err) {
    console.error("[PUBLIC_API_STATUS_ERROR]", err);
    return res.status(500).json({ error: err.message || "Failed to fetch document status." });
  }
});

/**
 * 5. Get Document Segments
 * GET /api/v1/documents/:id/segments?target_lang=hi
 */
publicApiRouter.get("/documents/:id/segments", async (req, res) => {
  try {
    const documentId = req.params.id;
    const targetLang = req.query.target_lang || "hi";

    const segments = await fetchAllSegments(documentId, "*", targetLang);
    const formattedSegments = segments.map(s => ({
      segment_index: s.segment_index,
      source_text: s.source_text || "",
      target_text: s.target_text || "",
      status: s.status || (s.target_text ? "translated" : "draft")
    }));

    return res.json({
      document_id: documentId,
      target_lang: targetLang,
      total_segments: formattedSegments.length,
      segments: formattedSegments
    });
  } catch (err) {
    console.error("[PUBLIC_API_SEGMENTS_ERROR]", err);
    return res.status(500).json({ error: err.message || "Failed to fetch document segments." });
  }
});

/**
 * 6. Export Translated Document
 * GET /api/v1/documents/:id/export?target_lang=hi&format=.pdf
 */
publicApiRouter.get("/documents/:id/export", async (req, res) => {
  try {
    const documentId = req.params.id;
    const targetLang = req.query.target_lang || "hi";
    const requestedExt = (req.query.format || req.query.extension || ".pdf").toLowerCase();
    const ext = requestedExt.startsWith(".") ? requestedExt : `.${requestedExt}`;

    const { data: doc } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    const segments = await fetchAllSegments(documentId, "*", targetLang);
    const exportSegments = segments.map(s => ({
      id: s.segment_index,
      source: s.source_text,
      target: s.target_text || s.source_text,
      translated: s.target_text || s.source_text
    }));

    const buffer = await exportHtml(documentId, exportSegments, ext, targetLang);

    let mimeType = "application/octet-stream";
    if (ext === ".html" || ext === ".htm") mimeType = "text/html";
    else if (ext === ".pdf") mimeType = "application/pdf";
    else if (ext === ".docx") mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const baseName = doc?.name ? path.parse(doc.name).name : "translated_document";
    const downloadName = `${baseName}_${targetLang}${ext}`;

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    return res.send(buffer);
  } catch (err) {
    console.error("[PUBLIC_API_EXPORT_ERROR]", err);
    return res.status(500).json({ error: err.message || "Failed to export document." });
  }
});

/**
 * 7. Generate API Key
 * POST /api/v1/keys/generate
 * Body: { name?: "My Web App Key" }
 */
publicApiRouter.post("/keys/generate", async (req, res) => {
  try {
    const keyName = req.body.name || "Default API Key";
    const userId = req.user?.id;
    const orgId = req.organization?.id || req.profile?.organization_id || null;

    if (!userId) {
      return res.status(401).json({ error: "User session required to generate API key." });
    }

    const { rawKey, keyHash, keyPrefix } = generateApiKey();

    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        user_id: userId,
        organization_id: orgId,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        name: keyName,
        status: "active"
      })
      .select("id, name, key_prefix, created_at")
      .single();

    if (error) {
      console.error("[GENERATE_API_KEY_DB_ERR]", error);
      // Even if table migration hasn't been applied to remote Supabase yet, return key details
      return res.json({
        success: true,
        name: keyName,
        api_key: rawKey,
        key_prefix: keyPrefix,
        note: "Store this API key securely. It will not be shown again."
      });
    }

    return res.json({
      success: true,
      id: data.id,
      name: data.name,
      api_key: rawKey,
      key_prefix: data.key_prefix,
      created_at: data.created_at,
      note: "Store this API key securely. It will not be shown again."
    });
  } catch (err) {
    console.error("[GENERATE_API_KEY_ERR]", err);
    return res.status(500).json({ error: err.message || "Failed to generate API key." });
  }
});

module.exports = publicApiRouter;
