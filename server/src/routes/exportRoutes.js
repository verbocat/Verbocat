const express = require("express");
const { exportHtml } = require("../services/fileService");
const { getProviderStatus } = require("../services/translationProviders");

const exportRouter = express.Router();

// 1. Provider Status
exportRouter.get("/provider-status", (request, response) => {
  try {
    const status = getProviderStatus();
    response.json(status);
  } catch (error) {
    console.error("Provider status error:", error);
    response.status(500).json({ error: "Provider status unavailable" });
  }
});

// 2. Export Document (HTML, PDF, DOCX, XLIFF, TMX)
exportRouter.post("/export", async (request, response) => {
  try {
    const { fileId, template, segments, extension, targetLang, fileName, exportSource } = request.body;
    const ext = extension || ".html";

    let exportSegments = segments;
    if (exportSource) {
      exportSegments = segments.map(seg => ({
        ...seg,
        target: seg.source,
        translated: seg.source
      }));
    }

    const buffer = await exportHtml(fileId, exportSegments, ext, targetLang || "hi", template);

    let mimeType = "application/octet-stream";
    if (ext === ".html" || ext === ".htm") mimeType = "text/html";
    else if (ext === ".pdf") mimeType = "application/pdf";
    else if (ext === ".docx") mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    else if (ext === ".xlf" || ext === ".xliff") mimeType = "application/x-xliff+xml";
    else if (ext === ".srt") mimeType = "application/x-subrip";

    const downloadName = fileName ? (fileName.endsWith(ext) ? fileName : `${fileName}${ext}`) : `translated_document${ext}`;

    response.setHeader("Content-Type", mimeType);
    response.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    response.send(buffer);
  } catch (error) {
    console.error("Export Error:", error);
    response.status(500).json({ error: error.message || "Failed to export document" });
  }
});

module.exports = {
  exportRouter
};
