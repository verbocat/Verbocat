const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../config/supabase");

const htmlParser = require("./parsers/htmlParser");
const docxParser = require("./parsers/docxParser");
const pptxParser = require("./parsers/pptxParser");
const xlsxParser = require("./parsers/xlsxParser");
const txtParser = require("./parsers/txtParser");

const getParser = (ext) => {
  switch (ext) {
    case '.html': return htmlParser;
    case '.docx': return docxParser;
    case '.pptx': return pptxParser;
    case '.xlsx': return xlsxParser;
    case '.txt': return txtParser;
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
    const error = new Error(`Unsupported file type: ${ext}`);
    error.status = 400;
    throw error;
  }

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

  const parser = getParser(ext);
  if (!parser) {
    const error = new Error(`Unsupported export type: ${ext}`);
    error.status = 400;
    throw error;
  }

  const buffer = await parser.exportFile(data.content, segments);
  return buffer;
};

module.exports = {
  processUploadedFile,
  exportHtml // Kept same export name for backwards compatibility, but it supports all formats
};
