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
 * Account & Quota Status
 * GET /api/v1/account
 * Returns client organization name, allowed credits, consumed credits, and remaining balance.
 */
publicApiRouter.get("/account", (req, res) => {
  const allowed = req.profile?.credits_allowed ?? (req.organization?.credits_allowed ?? 100000);
  const consumed = req.profile?.credits_consumed ?? (req.organization?.credits_consumed ?? 0);
  const remaining = Math.max(0, allowed - consumed);

  return res.json({
    success: true,
    user_id: req.user?.id,
    email: req.user?.email,
    organization: req.organization?.name || req.profile?.organization_name || "Default Workspace",
    organization_id: req.organization?.id || req.profile?.organization_id || null,
    status: req.profile?.status || "active",
    credits_allowed: allowed,
    credits_consumed: consumed,
    credits_remaining: remaining
  });
});

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

    // 1. Fetch document & template segments
    const { data: doc } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (!doc) {
      return res.status(404).json({ error: "Document not found." });
    }

    const sourceLang = doc.source_lang || "en";
    const fileExt = String(doc.file_extension || "").toLowerCase();
    const fileNameStr = String(doc.name || "").toLowerCase();
    const isSrt = fileExt.includes("srt") || fileNameStr.endsWith(".srt");

    const sourceSegments = await fetchAllSegments(documentId, "*", "source");
    if (!sourceSegments || sourceSegments.length === 0) {
      return res.status(400).json({ error: "Document has no source segments to translate." });
    }

    // 2. Format payload for translationService
    const segmentsToTranslate = sourceSegments.map(s => ({
      id: s.segment_index,
      source: s.source_text
    }));

    const userId = req.user?.id || "00000000-0000-0000-0000-000000000000";
    const orgId = req.organization?.id || req.profile?.organization_id || null;

    // 3. Execute translation service (routed for .srt files)
    let results = [];
    if (isSrt) {
      const srtRes = await translateSrtSegments(
        segmentsToTranslate,
        targetLang,
        sourceLang,
        { fileExtension: ".srt" },
        userId,
        orgId
      );
      results = srtRes.results.map(r => ({
        id: r.id,
        source: r.source,
        translated: r.target,
        provider: r.provider
      }));
    } else {
      const docRes = await translateSegments(
        segmentsToTranslate,
        targetLang,
        sourceLang,
        null,
        userId,
        orgId
      );
      results = docRes.results;
    }

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
    else if (ext === ".srt") mimeType = "application/x-subrip";

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
 * 7. Instant Text & HTML Translation (No document upload required)
 * POST /api/v1/translate
 * Headers: x-api-key or Authorization: Bearer <API_KEY>
 * Body: 
 *   - Simple text: { text: "Hello", source_lang?: "en", target_lang: "es" }
 *   - Multi-language text: { text: "Hello", source_lang?: "en", target_langs: ["es", "hi", "fr"] }
 *   - Structured post/article: { title: "Title", content: "<p>HTML</p>", excerpt?: "...", source_lang?: "en", target_langs: ["es", "hi"] }
 *   - Batch strings: { items: ["String 1", "String 2"], target_lang: "es" }
 */
publicApiRouter.post("/translate", async (req, res) => {
  try {
    const { text, title, content, excerpt, items, source, source_lang } = req.body;
    const srcLang = source_lang || source || "en";

    // Normalize target languages (accepts string "es", comma string "es,hi", or array ["es", "hi"])
    let targetLangs = [];
    if (req.body.target_langs && Array.isArray(req.body.target_langs)) {
      targetLangs = req.body.target_langs;
    } else if (req.body.target_lang || req.body.target) {
      const raw = req.body.target_lang || req.body.target;
      targetLangs = typeof raw === "string" ? raw.split(",").map(s => s.trim()).filter(Boolean) : [raw];
    } else if (req.body.targets && Array.isArray(req.body.targets)) {
      targetLangs = req.body.targets;
    }

    if (targetLangs.length === 0) {
      return res.status(400).json({
        error: "Missing target language. Please provide 'target_lang' (e.g. 'es') or 'target_langs' (e.g. ['es', 'hi'])."
      });
    }

    // Determine payload structure
    const isStructured = title !== undefined || content !== undefined;
    const isBatch = Array.isArray(items) && items.length > 0;
    const isSimpleText = text !== undefined;

    if (!isStructured && !isBatch && !isSimpleText) {
      return res.status(400).json({
        error: "No translatable content provided. Please send 'text', 'items', or 'title'/'content'."
      });
    }

    // Prepare segments array for translation
    let segmentsToTranslate = [];
    if (isStructured) {
      let idx = 1;
      if (title) segmentsToTranslate.push({ id: idx++, key: "title", source: String(title) });
      if (content) segmentsToTranslate.push({ id: idx++, key: "content", source: String(content) });
      if (excerpt) segmentsToTranslate.push({ id: idx++, key: "excerpt", source: String(excerpt) });
    } else if (isBatch) {
      segmentsToTranslate = items.map((item, idx) => ({ id: idx + 1, source: String(item || "") }));
    } else {
      segmentsToTranslate = [{ id: 1, source: String(text || "") }];
    }

    // Strict Quota & Credit Limit Enforcement
    if (req.profile && req.profile.role !== "super_admin") {
      const allowed = req.profile.credits_allowed ?? (req.organization?.credits_allowed ?? 0);
      const consumed = req.profile.credits_consumed ?? (req.organization?.credits_consumed ?? 0);
      if (allowed > 0 && consumed >= allowed) {
        return res.status(403).json({
          error: "Credit limit exceeded. Your word translation quota has been reached. Please upgrade your plan or contact support to purchase more translation credits.",
          credits_allowed: allowed,
          credits_consumed: consumed
        });
      }
    }

    const userId = req.user?.id || "00000000-0000-0000-0000-000000000000";
    const orgId = req.organization?.id || req.profile?.organization_id || null;

    let totalWords = 0;
    const translationsByLang = {};
    const iceMatchesByLang = {};
    const matchDetailsByLang = {};

    // Execute translation for all target languages in parallel for maximum speed
    await Promise.all(targetLangs.map(async (tgtLang) => {
      const docRes = await translateSegments(
        segmentsToTranslate,
        tgtLang,
        srcLang,
        { fileExtension: ".html", isInstant: true },
        userId,
        orgId
      );

      const langResults = docRes.results || [];
      totalWords += (docRes.wordCount || 0);

      // Check if all segments were 100% ICE matches (In-Context Exact from approved TM)
      const isAllIce = langResults.length > 0 && langResults.every(r => (r.match_percentage === 100) || (r.provider && r.provider.includes("ICE")));
      iceMatchesByLang[tgtLang] = isAllIce;
      matchDetailsByLang[tgtLang] = langResults.map(r => ({
        id: r.id,
        match_percentage: r.match_percentage || 0,
        is_ice: (r.match_percentage === 100) || (Boolean(r.provider && r.provider.includes("ICE"))),
        provider: r.provider || "AI"
      }));

      if (isStructured) {
        const langObj = {};
        for (const seg of segmentsToTranslate) {
          const match = langResults.find(r => r.id === seg.id);
          langObj[seg.key] = match ? match.translated : seg.source;
        }
        translationsByLang[tgtLang] = langObj;
      } else if (isBatch) {
        translationsByLang[tgtLang] = segmentsToTranslate.map(seg => {
          const match = langResults.find(r => r.id === seg.id);
          return match ? match.translated : seg.source;
        });
      } else {
        const match = langResults.find(r => r.id === 1);
        translationsByLang[tgtLang] = match ? match.translated : text;
      }
    }));

    // Log credit consumption
    if (totalWords > 0 && req.profile?.id) {
      try {
        await supabase.from("credit_logs").insert({
          user_id: req.profile.id,
          email: req.profile.email || req.user?.email || "api-service",
          action: "api-instant-translate",
          word_count: totalWords,
          file_name: isStructured && title ? `post: ${String(title).substring(0, 30)}` : "api-instant",
          organization_id: orgId
        });

        const newConsumed = (req.profile.credits_consumed || 0) + totalWords;
        await supabase.from("profiles").update({ credits_consumed: newConsumed }).eq("id", req.profile.id);
      } catch (logErr) {
        console.error("[PUBLIC_API_CREDIT_LOG_WARN]", logErr.message);
      }
    }

    // If single target language requested, return convenient direct response properties as well
    const isSingleLang = targetLangs.length === 1;
    const singleTarget = targetLangs[0];

    const responsePayload = {
      success: true,
      source_lang: srcLang,
      target_langs: targetLangs,
      words_translated: totalWords,
      translations: translationsByLang,
      ice_matches: iceMatchesByLang,
      match_details: matchDetailsByLang
    };

    if (isSingleLang) {
      responsePayload.is_ice_matched = iceMatchesByLang[singleTarget] || false;
      if (isStructured) {
        responsePayload.translated_title = translationsByLang[singleTarget].title || "";
        responsePayload.translated_content = translationsByLang[singleTarget].content || "";
        if (excerpt) responsePayload.translated_excerpt = translationsByLang[singleTarget].excerpt || "";
      } else if (isBatch) {
        responsePayload.translated_items = translationsByLang[singleTarget];
      } else {
        responsePayload.translated_text = translationsByLang[singleTarget];
      }
    }

    return res.json(responsePayload);
  } catch (err) {
    console.error("[PUBLIC_API_INSTANT_TRANSLATE_ERROR]", err);
    return res.status(500).json({ error: err.message || "Failed to execute instant translation." });
  }
});

/**
 * 8. Push Verified TM Segments (ICE Promotion on Publish)
 * POST /api/v1/tm/push
 * Body: { source_lang: "en", target_lang: "hi", segments: [ { source: "...", target: "..." } ] }
 */
publicApiRouter.post("/tm/push", async (req, res) => {
  try {
    const { source_lang, target_lang, segments } = req.body;
    const srcLang = source_lang || "en";
    const tgtLang = target_lang;

    if (!tgtLang) {
      return res.status(400).json({ error: "Missing required field: target_lang." });
    }
    if (!Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: "Missing or empty 'segments' array." });
    }

    const orgId = req.organization?.id || req.profile?.organization_id || null;
    const dbClient = supabaseAdmin || supabase;

    const rowsToUpsert = [];
    for (const seg of segments) {
      const sourceText = String(seg.source || seg.source_text || "").trim();
      const targetText = String(seg.target || seg.target_text || "").trim();
      if (!sourceText || !targetText) continue;

      rowsToUpsert.push({
        source_text: sourceText,
        target_text: targetText,
        target_lang: tgtLang,
        source_lang: srcLang,
        provider: "Linguist (ICE) - WordPress Verified",
        status: "approved",
        organization_id: orgId,
        updated_at: new Date().toISOString()
      });
    }

    if (rowsToUpsert.length === 0) {
      return res.status(400).json({ error: "No valid segment pairs found in payload." });
    }

    // Upsert segments into translation_memory table in chunks of 50
    let insertedCount = 0;
    for (let i = 0; i < rowsToUpsert.length; i += 50) {
      const chunk = rowsToUpsert.slice(i, i + 50);
      try {
        const { error } = await dbClient
          .from("translation_memory")
          .upsert(chunk, { onConflict: "source_text,target_lang" });

        if (error) {
          // Fallback insert
          await dbClient.from("translation_memory").insert(chunk);
        }
      } catch (upsertErr) {
        await dbClient.from("translation_memory").insert(chunk);
      }
      insertedCount += chunk.length;
    }

    return res.json({
      success: true,
      pushed_count: insertedCount,
      target_lang: tgtLang,
      message: `Successfully registered ${insertedCount} verified ICE segments in Translation Memory.`
    });
  } catch (err) {
    console.error("[TM_PUSH_ERROR]", err);
    return res.status(500).json({ error: err.message || "Failed to push TM segments." });
  }
});

/**
 * 8. Update Single Segment (Human-in-the-loop / Post-editing)
 * PUT /api/v1/documents/:id/segments/:index
 * Body: { target_text: "...", status?: "translated" | "reviewed", target_lang?: "hi" }
 */
publicApiRouter.put("/documents/:id/segments/:index", async (req, res) => {
  try {
    const documentId = req.params.id;
    const segmentIndex = Number(req.params.index);
    const { target_text, targetText, status, target_lang, targetLang } = req.body;
    const cleanTarget = target_text !== undefined ? target_text : (targetText !== undefined ? targetText : "");
    const tgtLang = target_lang || targetLang || "hi";

    if (isNaN(segmentIndex) || segmentIndex < 1) {
      return res.status(400).json({ error: "Invalid segment index. Must be a 1-based positive integer." });
    }

    // 1. Try updating existing row
    let { data: updated, error: updateErr } = await supabase
      .from("document_segments")
      .update({
        target_text: cleanTarget,
        status: status || (cleanTarget ? "translated" : "draft"),
        updated_at: new Date().toISOString()
      })
      .eq("document_id", documentId)
      .eq("segment_index", segmentIndex)
      .eq("target_lang", tgtLang)
      .select()
      .maybeSingle();

    if (updateErr) {
      console.error("[PUBLIC_API_UPDATE_SEG_ERR]", updateErr);
      throw updateErr;
    }

    // 2. If row didn't exist for target language, retrieve source_text from template and upsert
    if (!updated) {
      const { data: tmpl } = await supabase
        .from("document_segments")
        .select("source_text")
        .eq("document_id", documentId)
        .eq("segment_index", segmentIndex)
        .is("target_lang", null)
        .maybeSingle();

      const sourceText = tmpl?.source_text || "";

      const { data: inserted, error: insErr } = await supabase
        .from("document_segments")
        .upsert(
          {
            document_id: documentId,
            segment_index: segmentIndex,
            target_lang: tgtLang,
            source_text: sourceText, // MANDATORY not null constraint
            target_text: cleanTarget,
            status: status || (cleanTarget ? "translated" : "draft"),
            updated_at: new Date().toISOString()
          },
          { onConflict: "document_id,segment_index,target_lang" }
        )
        .select()
        .single();

      if (insErr) throw insErr;
      updated = inserted;
    }

    return res.json({
      success: true,
      document_id: documentId,
      segment_index: segmentIndex,
      target_lang: tgtLang,
      segment: updated
    });
  } catch (err) {
    console.error("[PUBLIC_API_UPDATE_SEGMENT_ERROR]", err);
    return res.status(500).json({ error: err.message || "Failed to update segment." });
  }
});

/**
 * 9. Generate API Key
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

