const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const mammoth = require("mammoth");
const { v4: uuidv4 } = require("uuid");

const uploadsDir = path.join(__dirname, "../../uploads");

const SKIP_SELECTOR = "script,style,noscript,svg,canvas";

const normalizeSegmentText = (text) =>
  (text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .trim();

const escapeHtml = (text) =>
  String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const stripVisibleTags = (text) =>
  String(text || "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const toHtmlText = (text) =>
  escapeHtml(stripVisibleTags(text)).replace(/\n/g, "<br/>");

const createHtmlSegments = ($) => {
  const segments = [];
  let segmentIndex = 0;

  $("body")
    .find("*")
    .contents()
    .each((_, element) => {
      if (element.type !== "text") {
        return;
      }

      const $parent = $(element).parent();
      if ($parent.closest(SKIP_SELECTOR).length > 0) {
        return;
      }

      const rawText = $(element).text();
      const source = normalizeSegmentText(rawText);
      if (!source) {
        return;
      }

      const leading = rawText.match(/^\s*/)?.[0] || "";
      const trailing = rawText.match(/\s*$/)?.[0] || "";
      const segmentId = segmentIndex++;
      $(element).replaceWith(`__SEG_${segmentId}__`);
      segments.push({
        id: segmentId,
        source,
        target: "",
        leading,
        trailing
      });
    });

  return segments;
};

const processUploadedFile = async (file) => {
  if (!file) {
    const error = new Error("No file uploaded");
    error.status = 400;
    throw error;
  }

  const originalName = file.originalname.toLowerCase();

  if (originalName.endsWith(".html")) {
    const html = fs.readFileSync(file.path, "utf-8");
    const $ = cheerio.load(html, {
      decodeEntities: false
    });

    const segments = createHtmlSegments($);

    const fileId = uuidv4();
    const filePath = path.join(uploadsDir, `${fileId}.html`);
    fs.writeFileSync(filePath, $.html());

    return {
      type: "html",
      fileId,
      segments
    };
  }

  if (originalName.endsWith(".docx")) {
    const result = await mammoth.extractRawText({
      path: file.path
    });

    const segments = result.value
      .split(/\n{2,}|\r?\n/)
      .map(normalizeSegmentText)
      .filter(Boolean)
      .map((paragraph, index) => ({
        id: index,
        source: paragraph,
        target: ""
      }));

    return {
      type: "docx",
      segments
    };
  }

  const error = new Error("Unsupported file");
  error.status = 400;
  throw error;
};

const exportHtml = (fileId, segments) => {
  if (!fileId) {
    const error = new Error("Cannot export: No file ID found. Please note that DOCX exports are not supported, only HTML files can be exported.");
    error.status = 400;
    throw error;
  }

  const filePath = path.join(uploadsDir, `${fileId}.html`);

  if (!fs.existsSync(filePath)) {
    console.error(`Export failed: File ${filePath} not found on disk.`);
    const error = new Error(`File not found. Did you load an old project file? Try re-uploading the original HTML document.`);
    error.status = 404;
    throw error;
  }

  let html = fs.readFileSync(filePath, "utf-8");

  segments.forEach((segment) => {
    const replacement =
      escapeHtml(segment.leading || "") +
      toHtmlText(segment.target) +
      escapeHtml(segment.trailing || "");

    html = html.replace(`__SEG_${segment.id}__`, replacement);
  });

  return html;
};

module.exports = {
  processUploadedFile,
  exportHtml
};
