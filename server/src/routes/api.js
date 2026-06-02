const express = require("express");
const multer = require("multer");
const { processUploadedFile, exportHtml } = require("../services/fileService");
const { translateSegments } = require("../services/translationService");
const { getProviderStatus } = require("../services/translationProviders");

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

apiRouter.post("/translate-batch", async (request, response) => {
  try {
    const { segments, target } = request.body;
    const result = await translateSegments(segments, target);
    response.json(result);
  } catch (error) {
    console.log(error);
    response.status(500).json({
      error: "Batch translation failed"
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

apiRouter.post("/export-html", async (request, response) => {
  try {
    const { fileId, segments } = request.body;
    const html = await exportHtml(fileId, segments);

    response.setHeader(
      "Content-Disposition",
      "attachment; filename=translated.html"
    );
    response.setHeader("Content-Type", "text/html");
    response.send(html);
  } catch (error) {
    console.log(error);
    response.status(error.status || 500).json({
      error: error.message || "Export failed"
    });
  }
});

module.exports = {
  apiRouter
};
