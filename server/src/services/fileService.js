const fs = require("fs");
const cheerio = require("cheerio");
const mammoth = require("mammoth");
const { v4: uuidv4 } = require("uuid");

const htmlFiles = {};

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

    const segments = [];
    let segmentIndex = 0;

    $("body")
      .find("*")
      .contents()
      .each((_, element) => {
        if (element.type !== "text") {
          return;
        }

        const text = $(element).text();
        if (text.trim().length === 0) {
          return;
        }

        const segmentId = segmentIndex++;
        $(element).replaceWith(`__SEG_${segmentId}__`);
        segments.push({
          id: segmentId,
          source: text,
          target: ""
        });
      });

    const fileId = uuidv4();
    htmlFiles[fileId] = $.html();

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
      .split("\n")
      .filter((paragraph) => paragraph.trim() !== "")
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
  let html = htmlFiles[fileId];

  if (!html) {
    const error = new Error("File not found");
    error.status = 404;
    throw error;
  }

  segments.forEach((segment) => {
    html = html.replace(`__SEG_${segment.id}__`, segment.target);
  });

  return html;
};

module.exports = {
  processUploadedFile,
  exportHtml
};
