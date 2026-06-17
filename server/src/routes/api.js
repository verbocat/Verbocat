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

apiRouter.post("/upload", upload.single("file"), async (request, response) => {
  try {
    const result = await processUploadedFile(request.file);
    response.json(result);
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

module.exports = {
  apiRouter
};
