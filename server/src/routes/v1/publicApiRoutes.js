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

/**
 * 10. WordPress Integration: List Approved Linguists by Language
 */
const LANGUAGE_ALIASES = {
  hindi: ["hi", "hindi"],
  punjabi: ["pa", "punjabi", "gurmukhi"],
  bengali: ["bn", "bengali"],
  tamil: ["ta", "tamil"],
  telugu: ["te", "telugu"],
  marathi: ["mr", "marathi"],
  gujarati: ["gu", "gujarati"],
  urdu: ["ur", "urdu"],
  kannada: ["kn", "kannada"],
  malayalam: ["ml", "malayalam"],
  spanish: ["es", "spanish", "es-es", "es-mx"],
  french: ["fr", "french", "fr-fr"],
  german: ["de", "german", "de-de"],
  italian: ["it", "italian"],
  portuguese: ["pt", "portuguese", "pt-br", "pt-pt"],
  russian: ["ru", "russian"],
  chinese: ["zh", "chinese", "zh-cn", "zh-tw"],
  japanese: ["ja", "japanese"],
  arabic: ["ar", "arabic"],
  dutch: ["nl", "dutch"],
  polish: ["pl", "polish"],
  turkish: ["tr", "turkish"],
  korean: ["ko", "korean"],
  vietnamese: ["vi", "vietnamese"],
  swedish: ["sv", "swedish"],
  norwegian: ["no", "norwegian"],
  danish: ["da", "danish"],
  finnish: ["fi", "finnish"],
  greek: ["el", "greek"],
  hebrew: ["he", "hebrew"],
  thai: ["th", "thai"],
  indonesian: ["id", "indonesian"],
  malay: ["ms", "malay"],
  czech: ["cs", "czech"],
  romanian: ["ro", "romanian"],
  hungarian: ["hu", "hungarian"],
  english: ["en", "english", "en-us", "en-gb"]
};

function expandLanguageTokens(langStr) {
  if (!langStr) return [];
  const normalized = String(langStr).toLowerCase().replace(/[\(\)\-_]/g, " ").trim();
  const tokens = new Set([normalized, String(langStr).toLowerCase().trim()]);
  
  for (const [key, aliases] of Object.entries(LANGUAGE_ALIASES)) {
    if (normalized.includes(key) || aliases.some(a => normalized.includes(a) || a === normalized)) {
      aliases.forEach(a => tokens.add(a));
    }
  }
  return Array.from(tokens);
}

/**
 * GET /api/v1/wordpress/linguists
 * Query: ?target_lang=hi
 */
publicApiRouter.get("/wordpress/linguists", async (req, res) => {
  try {
    const targetLang = req.query.target_lang ? req.query.target_lang.toLowerCase().trim() : null;
    const orgId = req.organization?.id || req.profile?.organization_id || null;
    const dbClient = supabaseAdmin || supabase;

    // 1. Fetch linguist profiles that are approved / active
    let query = dbClient
      .from("linguist_profiles")
      .select("id, user_id, full_name, email, primary_language, secondary_languages, status, availability, years_of_experience, organization_id")
      .in("status", ["approved", "active"]);

    if (orgId) {
      query = query.or(`organization_id.eq.${orgId},organization_id.is.null`);
    }

    const { data: linguistProfiles, error: lpErr } = await query;
    if (lpErr) {
      console.warn("[WORDPRESS_LINGUISTS_LP_WARN]", lpErr.message);
    }

    // 2. Also fetch approved linguist language pairs
    const { data: langPairs } = await dbClient
      .from("linguist_language_pairs")
      .select("linguist_profile_id, source_language, target_language, proficiency, is_native");

    // 3. Also check general profiles table for users with role 'linguist' or 'in_region_reviewer'
    const { data: userProfiles } = await dbClient
      .from("profiles")
      .select("id, name, full_name, email, role, status")
      .in("role", ["linguist", "in_region_reviewer"])
      .eq("status", "active");

    const linguistsMap = new Map();

    // Add from linguist_profiles
    (linguistProfiles || []).forEach(lp => {
      const pairs = (langPairs || []).filter(p => p.linguist_profile_id === lp.id);
      const supportedTargets = new Set();

      if (lp.primary_language) {
        expandLanguageTokens(lp.primary_language).forEach(t => supportedTargets.add(t));
      }
      if (Array.isArray(lp.secondary_languages)) {
        lp.secondary_languages.forEach(sl => {
          expandLanguageTokens(sl).forEach(t => supportedTargets.add(t));
        });
      }
      pairs.forEach(p => {
        if (p.target_language) {
          expandLanguageTokens(p.target_language).forEach(t => supportedTargets.add(t));
        }
      });

      linguistsMap.set(lp.id, {
        id: lp.user_id || lp.id,
        profile_id: lp.id,
        name: lp.full_name,
        email: lp.email,
        primary_language: lp.primary_language,
        target_languages: Array.from(supportedTargets),
        status: lp.status,
        experience: lp.years_of_experience || 1
      });
    });

    // Add from user profiles if not already added
    (userProfiles || []).forEach(up => {
      const existing = Array.from(linguistsMap.values()).find(l => l.email === up.email || l.id === up.id);
      if (!existing) {
        linguistsMap.set(up.id, {
          id: up.id,
          profile_id: up.id,
          name: up.name || up.full_name || up.email.split("@")[0],
          email: up.email,
          primary_language: "All",
          target_languages: Object.values(LANGUAGE_ALIASES).flat(),
          status: up.status,
          experience: 5
        });
      }
    });

    let resultList = Array.from(linguistsMap.values());

    // If target_lang filter requested, filter linguists that support this target language
    if (targetLang) {
      const targetTokens = expandLanguageTokens(targetLang);
      resultList = resultList.filter(l => {
        if (!l.target_languages || l.target_languages.length === 0) return true;
        return l.target_languages.some(tl => 
          targetTokens.includes(tl) || targetTokens.some(tok => tl.includes(tok) || tok.includes(tl)) || tl === "all"
        );
      });
    }

    return res.json({
      success: true,
      count: resultList.length,
      linguists: resultList
    });
  } catch (err) {
    console.error("[WORDPRESS_LINGUISTS_API_ERR]", err);
    return res.status(500).json({ error: err.message || "Failed to fetch linguists list." });
  }
});

/**
 * 11. WordPress Integration: Submit Batch Pages for Human Review
 * POST /api/v1/wordpress/submit-batch-human-review
 */
publicApiRouter.post("/wordpress/submit-batch-human-review", async (req, res) => {
  try {
    const { site_url, callback_url, pages, project_name } = req.body;

    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: "No pages provided in batch review request." });
    }

    const orgId = req.organization?.id || req.profile?.organization_id || null;
    let userId = req.user?.id;
    if (!userId || userId === "00000000-0000-0000-0000-000000000000") {
      const { data: adminProf } = await supabase.from("profiles").select("id").limit(1).single();
      userId = adminProf?.id || "d02d37ba-90d1-4147-bf8f-1687d66500d5";
    }

    const dbClient = supabaseAdmin || supabase;
    const { v4: uuidv4 } = require("uuid");
    const htmlParser = require("../../utils/parsers/htmlParser");

    // 1. Create a Master Project in Centroid for this WordPress Batch
    const projectId = uuidv4();
    const cleanProjectName = project_name || `WP Batch Review - ${new Date().toISOString().slice(0, 10)}`;
    
    // Collect all distinct target languages across pages
    const allTargetLangsSet = new Set();
    pages.forEach(p => {
      const pLangs = Array.isArray(p.target_langs) ? p.target_langs : (p.target_lang ? [p.target_lang] : ["hi"]);
      pLangs.forEach(l => allTargetLangsSet.add(l.toLowerCase().trim()));
    });
    const allTargetLangs = Array.from(allTargetLangsSet);

    const { error: projErr } = await dbClient.from("projects").insert({
      id: projectId,
      name: cleanProjectName,
      source_lang: pages[0]?.source_lang || "en",
      target_languages: allTargetLangs,
      owner_id: userId,
      organization_id: orgId,
      settings: {
        status: "active",
        source: "wordpress",
        site_url: site_url,
        callback_url: callback_url
      },
      description: `WordPress Batch Dispatch from ${site_url || "WordPress Site"}`
    });

    if (projErr) {
      console.error("[WP_BATCH_PROJECT_CREATE_ERR]", projErr);
    }

    const createdDocuments = [];
    const projectLinguistAssignments = {};
    const projectDocumentsMetadata = {};

    // Fetch all approved linguists once for auto-assignment fallback
    const { data: allApprovedLps } = await dbClient
      .from("linguist_profiles")
      .select("id, user_id, primary_language, secondary_languages")
      .in("status", ["approved", "active"]);

    const approvedLinguistsSummary = (allApprovedLps || []).map(lp => {
      const targets = new Set();
      if (lp.primary_language) expandLanguageTokens(lp.primary_language).forEach(t => targets.add(t));
      if (Array.isArray(lp.secondary_languages)) {
        lp.secondary_languages.forEach(sl => expandLanguageTokens(sl).forEach(t => targets.add(t)));
      }
      return {
        id: lp.user_id || lp.id,
        user_id: lp.user_id || lp.id,
        target_languages: Array.from(targets)
      };
    });

    // 2. Process each page in the batch
    for (const page of pages) {
      const documentId = uuidv4();
      const pageTitle = page.title || `WordPress Page ${page.post_id || ""}`;
      const docName = `WP: ${pageTitle} (ID: ${page.post_id || "N/A"})`;
      const srcLang = page.source_lang || "en";
      const targetLangs = Array.isArray(page.target_langs) ? page.target_langs : (page.target_lang ? [page.target_lang] : allTargetLangs);

      let htmlContent = page.rendered_html || page.content || `<article><h1>${pageTitle}</h1></article>`;

      // Ensure page title is always present as <h1> heading if not found in HTML
      if (!htmlContent.includes("<h1") && !htmlContent.includes(pageTitle)) {
        htmlContent = `<h1 class="wp-block-post-title entry-title">${pageTitle}</h1>\n` + htmlContent;
      }

      // Ensure full HTML document structure with modern WordPress typography CSS
      if (!htmlContent.includes("<style>") && !htmlContent.includes("<style ")) {
        htmlContent = `<!DOCTYPE html>
<html lang="${srcLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${pageTitle}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif; font-size: 16px; line-height: 1.7; color: #1e293b; background-color: #ffffff; margin: 0; padding: 40px 32px; -webkit-font-smoothing: antialiased; }
.wp-site-preview-container { max-width: 840px; margin: 0 auto; background: #ffffff; }
.wp-block-post-title, h1.entry-title, h1 { font-size: 2.25rem; font-weight: 800; line-height: 1.25; color: #0f172a; margin-top: 0; margin-bottom: 2rem; letter-spacing: -0.025em; }
h2 { font-size: 1.75rem; font-weight: 700; margin-top: 2rem; margin-bottom: 1rem; color: #1e293b; }
h3 { font-size: 1.35rem; font-weight: 600; margin-top: 1.75rem; margin-bottom: 0.75rem; color: #334155; }
p { margin-top: 0; margin-bottom: 1.5rem; color: #334155; font-size: 1.05rem; line-height: 1.75; }
img { max-width: 100%; height: auto; border-radius: 8px; }
blockquote { border-left: 4px solid #2563eb; margin: 1.75rem 0; padding: 0.75rem 1.5rem; color: #475569; background: #f8fafc; border-radius: 0 8px 8px 0; }
ul, ol { padding-left: 1.5rem; margin-bottom: 1.5rem; color: #334155; }
li { margin-bottom: 0.5rem; }
</style>
</head>
<body>
<article class="wp-site-preview-container">
${htmlContent}
</article>
</body>
</html>`;
      }

      // Write temp file to parse with htmlParser
      const tempPath = path.join(uploadDir, `wp_temp_${documentId}.html`);
      fs.writeFileSync(tempPath, htmlContent, "utf-8");

      let parseResult;
      try {
        parseResult = await htmlParser.parseFile(tempPath, false);
      } catch (parseErr) {
        console.error("[WP_HTML_PARSE_ERR]", parseErr);
        parseResult = {
          segments: [{ id: 1, source: pageTitle }],
          template: Buffer.from(`<h1>__SEG_1__</h1>`, "utf-8")
        };
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }

      // Save template to html_files
      if (parseResult.template) {
        await dbClient.from("html_files").upsert({
          id: documentId,
          content: parseResult.template
        });
      }

      // Track rich WordPress metadata in project settings
      const docMetadata = {
        source_type: "wordpress",
        wp_post_id: page.target_post_id || page.post_id,
        wp_root_post_id: page.post_id,
        wp_site_url: site_url,
        wp_callback_url: callback_url,
        wp_permalink: page.permalink,
        wp_preview_url: page.preview_url,
        wp_original_content: page.content,
        wp_rendered_html: page.rendered_html,
        linguist_assignments: page.linguist_assignments || {}
      };
      projectDocumentsMetadata[documentId] = docMetadata;

      const { error: docInsErr } = await dbClient.from("documents").insert({
        id: documentId,
        file_id: documentId,
        project_id: projectId,
        name: docName,
        source_lang: srcLang,
        target_lang: targetLangs[0] || "hi",
        owner_id: userId,
        organization_id: orgId,
        status: "active"
      });

      if (docInsErr) {
        console.error("[WP_DOC_INSERT_ERR]", docInsErr);
      }

      // Insert Template Segments (target_lang: null)
      const segmentInserts = (parseResult.segments || []).map((seg, idx) => ({
        document_id: documentId,
        segment_index: idx + 1,
        target_lang: null,
        source_text: seg.source || "",
        target_text: "",
        status: "draft"
      }));

      const BATCH_SIZE = 500;
      for (let i = 0; i < segmentInserts.length; i += BATCH_SIZE) {
        await dbClient.from("document_segments").insert(segmentInserts.slice(i, i + BATCH_SIZE));
      }

      // Check if WordPress or caller provided explicit linguist assignments per language
      const explicitAssignments = page.linguist_assignments || req.body.linguist_assignments || {};
      const hasAnyExplicitAssignment = Object.values(explicitAssignments).some(val => val && String(val).trim().length > 0);

      // Pre-create translation segments & assign linguists for each target language
      for (const tLang of targetLangs) {
        const cleanTLang = String(tLang).toLowerCase().trim();
        const baseCode = cleanTLang.split(/[-_]/)[0];

        let assignedLinguistId = explicitAssignments[cleanTLang] || explicitAssignments[tLang] || explicitAssignments[baseCode] || null;

        // ONLY fallback to auto-assign if NO linguists were configured at all in the request
        // AND strictly match the target language code
        if (!assignedLinguistId && !hasAnyExplicitAssignment) {
          const tTokens = expandLanguageTokens(cleanTLang);
          const matched = approvedLinguistsSummary.find(l => 
            l.target_languages.some(tl => tTokens.includes(tl))
          );
          if (matched) {
            assignedLinguistId = matched.user_id;
          }
        }

        // Resolve user_id for assignment
        let resolvedUserId = assignedLinguistId;
        if (assignedLinguistId) {
          const lpMatch = (allApprovedLps || []).find(l => l.id === assignedLinguistId || l.user_id === assignedLinguistId);
          if (lpMatch?.user_id) {
            resolvedUserId = lpMatch.user_id;
          }
        }

        // Check if existing translation draft was supplied by WordPress
        const existingDraft = page.existing_translations?.[cleanTLang] || page.existing_translations?.[tLang] || page.existing_translations?.[baseCode];
        let targetTextMap = {};

        if (existingDraft && (existingDraft.rendered_html || existingDraft.content)) {
          try {
            const draftHtml = existingDraft.rendered_html || existingDraft.content;
            const draftTempPath = path.join(os.tmpdir(), `draft_${Date.now()}_${Math.random().toString(36).substring(7)}.html`);
            fs.writeFileSync(draftTempPath, draftHtml, "utf8");
            const draftParseResult = await htmlParser.parseFile(draftTempPath, false);
            try { fs.unlinkSync(draftTempPath); } catch (_) {}
            (draftParseResult.segments || []).forEach((dSeg, dIdx) => {
              if (dSeg.source) {
                targetTextMap[dIdx + 1] = dSeg.source;
              }
            });
          } catch (_) {}
        }

        // If any segments are missing translations, run automatic translation to pre-populate target segments
        const missingSegments = (parseResult.segments || [])
          .map((s, idx) => ({ id: idx + 1, source: s.source }))
          .filter(s => !targetTextMap[s.id] && s.source && s.source.trim().length > 0);

        if (missingSegments.length > 0) {
          try {
            const { translateSegments } = require("../../services/translationService");
            const autoRes = await translateSegments(
              missingSegments,
              cleanTLang,
              srcLang,
              { isInstant: true },
              userId,
              orgId
            );
            const translatedItems = autoRes?.results || (Array.isArray(autoRes) ? autoRes : []);
            translatedItems.forEach(item => {
              if (item.id && item.translated) {
                targetTextMap[item.id] = item.translated;
              }
            });
          } catch (autoErr) {
            console.warn("[WP_BATCH_AUTO_TRANSLATE_WARN]", autoErr.message);
          }
        }

        // Create target language segments with pre-populated target_text
        const targetInserts = (parseResult.segments || []).map((seg, idx) => ({
          document_id: documentId,
          segment_index: idx + 1,
          target_lang: cleanTLang,
          source_text: seg.source || "",
          target_text: targetTextMap[idx + 1] || "",
          status: targetTextMap[idx + 1] ? "translated" : "draft"
        }));

        for (let i = 0; i < targetInserts.length; i += BATCH_SIZE) {
          await dbClient.from("document_segments").insert(targetInserts.slice(i, i + BATCH_SIZE));
        }

        // Grant access and assign to linguist if resolved
        if (resolvedUserId) {
          // 1. Upsert document_access record
          try {
            await dbClient.from("document_access").upsert({
              document_id: documentId,
              user_id: resolvedUserId,
              permission: "write"
            }, { onConflict: "document_id,user_id" });
          } catch (_) {}

          // 2. Track in project assignments with active status
          if (!projectLinguistAssignments[resolvedUserId]) {
            projectLinguistAssignments[resolvedUserId] = [];
          }
          projectLinguistAssignments[resolvedUserId].push({
            documentId: documentId,
            targetLang: cleanTLang,
            permission: "write",
            status: "active"
          });
        }
      }

      createdDocuments.push({
        document_id: documentId,
        post_id: page.post_id,
        name: docName,
        target_langs: targetLangs,
        total_segments: parseResult.segments?.length || 0,
        direct_url: `/project/${projectId}/file/${documentId}/lang/${targetLangs[0]}`
      });
    }

    // Update project settings with all linguist assignments and documents metadata
    await dbClient.from("projects").update({
      settings: {
        status: "active",
        linguistAssignments: projectLinguistAssignments,
        documentsMetadata: projectDocumentsMetadata,
        source: "wordpress",
        site_url: site_url,
        callback_url: callback_url
      }
    }).eq("id", projectId);

    return res.json({
      success: true,
      project_id: projectId,
      project_name: cleanProjectName,
      total_pages: pages.length,
      created_documents: createdDocuments
    });
  } catch (err) {
    console.error("[WORDPRESS_BATCH_REVIEW_ERR]", err);
    return res.status(500).json({ error: err.message || "Failed to submit batch for human review." });
  }
});

/**
 * 12. WordPress Integration: Complete Task & Dispatch Webhook
 * POST /api/v1/wordpress/complete-task
 */
publicApiRouter.post("/wordpress/complete-task", async (req, res) => {
  try {
    const { document_id, target_lang } = req.body;
    if (!document_id) {
      return res.status(400).json({ error: "document_id is required" });
    }

    const dbClient = supabaseAdmin || supabase;
    const { data: doc } = await dbClient
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .maybeSingle();

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    const tLang = target_lang || doc.target_lang || "hi";
    const docMeta = doc.metadata || {};
    const callbackUrl = docMeta.wp_callback_url;

    if (!callbackUrl) {
      return res.status(400).json({ error: "No WordPress callback URL configured for this document" });
    }

    // Fetch all translated segments for this target language
    const { data: segments } = await dbClient
      .from("document_segments")
      .select("segment_index, source_text, target_text, status")
      .eq("document_id", document_id)
      .eq("target_lang", tLang)
      .order("segment_index", { ascending: true });

    // Fetch template from html_files
    const { data: htmlData } = await dbClient
      .from("html_files")
      .select("content")
      .eq("id", document_id)
      .maybeSingle();

    let translatedHtml = "";
    if (htmlData && htmlData.content) {
      const htmlParser = require("../../utils/parsers/htmlParser");
      const exportSegments = (segments || []).map(s => ({
        id: s.segment_index,
        target: s.target_text || s.source_text
      }));
      const exportedBuffer = await htmlParser.exportFile(htmlData.content, exportSegments);
      translatedHtml = exportedBuffer.toString("utf-8");
    } else {
      translatedHtml = (segments || []).map(s => `<p>${s.target_text || s.source_text}</p>`).join("\n");
    }

    const translatedTitle = segments && segments.length > 0 && segments[0].target_text ? segments[0].target_text : "";

    // Construct 100% pristine Gutenberg block content by substituting text inside wp_original_content
    let pristineGutenberg = docMeta.wp_original_content || "";
    if (pristineGutenberg) {
      for (const seg of (segments || [])) {
        if (seg.source_text && seg.target_text && seg.source_text !== seg.target_text) {
          pristineGutenberg = pristineGutenberg.split(seg.source_text).join(seg.target_text);
        }
      }
    }

    // Send HTTP POST webhook to WordPress callback URL
    const axios = require("axios");
    const webhookPayload = {
      action: "translation_completed",
      document_id: document_id,
      post_id: docMeta.wp_post_id,
      source_lang: doc.source_lang,
      target_lang: tLang,
      translated_title: translatedTitle,
      translated_content: translatedHtml,
      gutenberg_content: pristineGutenberg,
      updated_segments: (segments || []).map(s => ({
        segment_index: s.segment_index,
        source_text: s.source_text,
        target_text: s.target_text || s.source_text
      })),
      status: "completed",
      timestamp: new Date().toISOString()
    };

    let wpResponseStatus = 200;
    let wpResponseBody = null;

    try {
      const wpRes = await axios.post(callbackUrl, webhookPayload, {
        headers: {
          "Content-Type": "application/json",
          "x-verbocat-event": "translation.completed"
        },
        timeout: 15000
      });
      wpResponseStatus = wpRes.status;
      wpResponseBody = wpRes.data;
    } catch (wpErr) {
      console.warn("[WORDPRESS_CALLBACK_WARN] Callback dispatch warning:", wpErr.message);
      wpResponseBody = wpErr.response?.data || wpErr.message;
    }

    // Update document status to completed
    await dbClient
      .from("documents")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", document_id);

    return res.json({
      success: true,
      message: "Translation marked as completed and dispatched to WordPress!",
      wordpress_response: wpResponseBody
    });
  } catch (err) {
    console.error("[WORDPRESS_COMPLETE_TASK_ERR]", err);
    return res.status(500).json({ error: err.message || "Failed to complete WordPress task." });
  }
});

/**
 * POST /api/v1/wordpress/sync-post-updates
 * Real-time synchronization when a WordPress root or translated post is saved/updated in WordPress.
 */
publicApiRouter.post("/wordpress/sync-post-updates", async (req, res) => {
  try {
    const { post_id, root_post_id, target_post_id, source_lang, target_lang, rendered_html, target_rendered_html } = req.body;
    const resolvedRootId = Number(root_post_id || post_id);
    const resolvedTargetId = Number(target_post_id || post_id);
    const tgtLang = target_lang || "hi";
    const dbClient = supabaseAdmin || supabase;

    // 1. Find all active documents referencing this WordPress post
    const { data: projects } = await dbClient
      .from("projects")
      .select("id, settings");

    const matchedDocIds = [];
    (projects || []).forEach(p => {
      const metaMap = p.settings?.documentsMetadata || {};
      Object.entries(metaMap).forEach(([dId, meta]) => {
        const dRoot = Number(meta.wp_root_post_id);
        const dPost = Number(meta.wp_post_id);
        if (dRoot === resolvedRootId || dPost === resolvedRootId || dPost === resolvedTargetId) {
          matchedDocIds.push({ docId: dId, projectId: p.id });
        }
      });
    });

    if (matchedDocIds.length === 0) {
      return res.json({ success: true, updated_documents: 0 });
    }

    // 2. Parse updated root rendered_html to extract new source segments
    let newSourceSegments = [];
    if (rendered_html) {
      const tempPath = path.join(os.tmpdir(), `wp_sync_root_${Date.now()}.html`);
      fs.writeFileSync(tempPath, rendered_html, "utf-8");
      try {
        const parsed = await htmlParser.parseFile(tempPath, false);
        newSourceSegments = parsed.segments || [];
      } catch (pe) {
        console.warn("[WP_SYNC_PARSE_ERR]", pe.message);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    }

    // 3. Parse updated target rendered_html to extract new target segments
    let newTargetSegments = [];
    if (target_rendered_html) {
      const tempPath = path.join(os.tmpdir(), `wp_sync_tgt_${Date.now()}.html`);
      fs.writeFileSync(tempPath, target_rendered_html, "utf-8");
      try {
        const parsed = await htmlParser.parseFile(tempPath, false);
        newTargetSegments = parsed.segments || [];
      } catch (pe) {
        console.warn("[WP_SYNC_TGT_PARSE_ERR]", pe.message);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    }

    const { getIo, getDocumentRoomId } = require("../../services/socket");
    const io = getIo();

    for (const { docId } of matchedDocIds) {
      const bulkUpdates = [];

      for (let i = 0; i < Math.max(newSourceSegments.length, newTargetSegments.length); i++) {
        const segIdx = i + 1;
        const srcText = newSourceSegments[i]?.source;
        const tgtText = newTargetSegments[i]?.source;

        if (srcText !== undefined) {
          // Update template row
          await dbClient
            .from("document_segments")
            .update({ source_text: srcText })
            .eq("document_id", docId)
            .eq("segment_index", segIdx)
            .is("target_lang", null);
        }

        if (srcText !== undefined || tgtText !== undefined) {
          const updateObj = {};
          if (srcText !== undefined) updateObj.source_text = srcText;
          if (tgtText !== undefined) {
            updateObj.target_text = tgtText;
            updateObj.status = "translated";
          }
          await dbClient
            .from("document_segments")
            .update(updateObj)
            .eq("document_id", docId)
            .eq("segment_index", segIdx)
            .eq("target_lang", tgtLang);

          bulkUpdates.push({
            id: segIdx,
            segment_index: segIdx,
            source: srcText,
            target: tgtText,
            status: "translated"
          });
        }
      }

      // Broadcast WebSocket live update to Centroid frontend
      if (io && bulkUpdates.length > 0) {
        io.to(getDocumentRoomId(docId, tgtLang)).emit("segments-bulk-updated", {
          segments: bulkUpdates,
          targetLang: tgtLang
        });
      }
    }

    res.json({ success: true, updated_documents: matchedDocIds.length });
  } catch (err) {
    console.error("[WP_SYNC_POST_UPDATES_ERR]", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = publicApiRouter;


