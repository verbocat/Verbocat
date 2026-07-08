const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../config/supabase");

const htmlParser = require("../utils/parsers/htmlParser");
const docxParser = require("../utils/parsers/docxParser");
const pptxParser = require("../utils/parsers/pptxParser");
const xlsxParser = require("../utils/parsers/xlsxParser");
const txtParser = require("../utils/parsers/txtParser");
const pdfParser = require("../utils/parsers/pdfParser");
const { parseXliff, generateXliff } = require("../utils/exporters");

const xliffParser = {
  parseFile: async (filePath) => {
    const xml = fs.readFileSync(filePath, "utf-8");
    const segments = parseXliff(xml);
    return {
      segments: segments.map((seg, idx) => ({
        id: seg.id || idx + 1,
        source: seg.source,
        target: seg.target || ""
      })),
      template: ""
    };
  },
  exportFile: async (template, segments) => {
    return Buffer.from(generateXliff(segments), "utf-8");
  }
};

const getParser = (ext) => {
  switch (ext) {
    case '.html': return htmlParser;
    case '.docx': return docxParser;
    case '.pptx': return pptxParser;
    case '.xlsx': return xlsxParser;
    case '.txt': return txtParser;
    case '.pdf': return pdfParser;
    case '.xlf':
    case '.xliff':
    case '.sdlxliff': return xliffParser;
    default: return null;
  }
};

const processUploadedFile = async (file) => {
  if (!file) {
    const error = new Error("No file uploaded");
    error.status = 400;
    throw error;
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const parser = getParser(ext);

  if (!parser) {
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (e) {
      console.error("Failed to delete temp file:", e);
    }
    const error = new Error(`Unsupported file type: ${ext}`);
    error.status = 400;
    throw error;
  }

  try {
    const { segments, template } = await parser.parseFile(file.path);
    const fileId = uuidv4();
    
    // Store template in Supabase (we reuse the html_files table for all formats)
    const { error: insertError } = await supabase
      .from("html_files")
      .insert([{ id: fileId, content: template }]);

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      const error = new Error("Failed to save document template securely to the database.");
      error.status = 500;
      throw error;
    }

    return {
      type: ext.substring(1),
      fileId,
      segments,
      originalName: file.originalname.replace(ext, "")
    };
  } finally {
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (e) {
      console.error("Failed to delete temp file in finally block:", e);
    }
  }
};

const exportHtml = async (fileId, segments, ext = '.html') => {
  if (!fileId) {
    const error = new Error("Cannot export: No file ID found.");
    error.status = 400;
    throw error;
  }

  const { data, error: fetchError } = await supabase
    .from("html_files")
    .select("content")
    .eq("id", fileId)
    .single();

  if (fetchError || !data || !data.content) {
    const error = new Error(`File template not found. Did you load an old project file?`);
    error.status = 404;
    throw error;
  }

  let parser = getParser(ext);

  // ── Smart template-type detection ─────────────────────────────────────────
  // If the stored template is a PDF template (contains pdfBytes), always use
  // pdfParser regardless of what ext the client sent. This protects against
  // stale state (e.g. project loaded from a .json file with wrong extension).
  try {
    const zlib = require('zlib');
    const buf = Buffer.from(data.content, 'base64');
    let rawJson;
    try { rawJson = zlib.gunzipSync(buf).toString('utf-8'); } catch (_) { rawJson = data.content; }
    const templateData = JSON.parse(rawJson);
    if (templateData && templateData.pdfBytes && templateData.items) {
      // It's definitely a PDF template
      const pdfParser = require('../utils/parsers/pdfParser');
      parser = pdfParser;
    }
  } catch (_) { /* not JSON or not a PDF template — keep parser as-is */ }
  // ──────────────────────────────────────────────────────────────────────────

  if (!parser) {
    const error = new Error(`Unsupported export type: ${ext}`);
    error.status = 400;
    throw error;
  }

  // Normalize segment IDs to match 0-based indexing if they are 1-based
  const hasZero = segments.some(seg => Number(seg.id) === 0);
  const normalizedSegments = (!hasZero && segments.length > 0)
    ? segments.map(seg => ({ ...seg, id: Number(seg.id) - 1 }))
    : segments.map(seg => ({ ...seg, id: Number(seg.id) }));

  const buffer = await parser.exportFile(data.content, normalizedSegments);
  return buffer;
};

module.exports = {
  processUploadedFile,
  exportHtml // Kept same export name for backwards compatibility, but it supports all formats
};
