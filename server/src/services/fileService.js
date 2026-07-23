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
const { execSync } = require('child_process');

function getPythonCommand() {
  const localWindowsPath = 'C:\\Users\\divya\\AppData\\Local\\Programs\\Python\\Python310\\python.exe';
  if (fs.existsSync(localWindowsPath)) {
    return localWindowsPath;
  }
  try {
    execSync('python3 --version', { stdio: 'ignore' });
    return 'python3';
  } catch (_) {}
  try {
    execSync('python --version', { stdio: 'ignore' });
    return 'python';
  } catch (_) {}
  return 'python';
}

let isPdf2DocxVerified = false;
function ensurePdf2DocxInstalled() {
  if (isPdf2DocxVerified) return;
  try {
    const pythonCmd = getPythonCommand();
    execSync(`"${pythonCmd}" -c "import pdf2docx"`, { stdio: 'ignore' });
    isPdf2DocxVerified = true;
  } catch (e) {
    console.log("pdf2docx is not installed on system. Attempting auto-installation...");
    try {
      const pythonCmd = getPythonCommand();
      execSync(`"${pythonCmd}" -m pip install pdf2docx --break-system-packages`, { stdio: 'ignore' });
      isPdf2DocxVerified = true;
      console.log("pdf2docx installed successfully!");
    } catch (installErr) {
      console.error("Failed to auto-install pdf2docx via pip:", installErr.message);
    }
  }
}

async function convertPdfToDocx(pdfPath, docxPath) {
  ensurePdf2DocxInstalled();
  const pythonCmd = getPythonCommand();
  
  const escapedPdfPath = pdfPath.replace(/\\/g, '\\\\');
  const escapedDocxPath = docxPath.replace(/\\/g, '\\\\');
  
  const pyScript = `from pdf2docx import Converter; cv = Converter('${escapedPdfPath}'); cv.convert('${escapedDocxPath}'); cv.close()`;
  
  console.log(`Converting PDF to DOCX: ${pdfPath} -> ${docxPath}`);
  execSync(`"${pythonCmd}" -c "${pyScript}"`, { stdio: 'inherit' });
}

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
    case '.docx':
    case '.doc': return docxParser;
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
  let parser = getParser(ext);
  let parsePath = file.path;
  let finalType = ext.substring(1);

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
    // For PDF files, parse directly using the new high-fidelity pdfParser pipeline
    if (ext === '.pdf') {
      const { segments, template: pdfTemplate } = await pdfParser.parseFile(file.path);
      const fileId = uuidv4();
      const { error: insertError } = await supabase
        .from("html_files")
        .insert([{ id: fileId, content: pdfTemplate }]);

      if (insertError) throw insertError;

      return {
        type: 'pdf',
        fileId,
        segments,
        originalName: file.originalname
      };
    }

    // Default parser path for non-PDFs
    const { segments, template } = await parser.parseFile(parsePath);
    const fileId = uuidv4();
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
      type: finalType,
      fileId,
      segments,
      originalName: file.originalname
    };
  } finally {
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      const tempDocxPath = file.path + '.docx';
      if (fs.existsSync(tempDocxPath)) {
        fs.unlinkSync(tempDocxPath);
      }
    } catch (e) {
      console.error("Failed to delete temp files in finally block:", e);
    }
  }
};

const exportHtml = async (fileId, segments, ext = '.html', targetLang = 'hi', templateOverride = null) => {
  if (!fileId && !templateOverride) {
    const error = new Error("Cannot export: No file ID or template found.");
    error.status = 400;
    throw error;
  }

  let templateContent = templateOverride;

  if (!templateContent) {
    // 1. Try finding template in html_files where id = fileId
    let { data } = await supabase
      .from("html_files")
      .select("content")
      .eq("id", fileId)
      .single();

    // 2. Fallback: If fileId is a document ID from documents table, lookup documents.file_id
    if (!data || !data.content) {
      const { data: docData } = await supabase
        .from("documents")
        .select("file_id")
        .eq("id", fileId)
        .single();

      if (docData && docData.file_id) {
        const { data: htmlData } = await supabase
          .from("html_files")
          .select("content")
          .eq("id", docData.file_id)
          .single();

        if (htmlData && htmlData.content) {
          data = htmlData;
        }
      }
    }

    if (!data || !data.content) {
      const error = new Error(`File template not found for document ${fileId}. Did you load an old project file?`);
      error.status = 404;
      throw error;
    }

    templateContent = data.content;
  }

  let parser = getParser(ext);

  // ── Combined Template Detection & Routing ────────────────────────────────
  try {
    const rawJson = Buffer.from(data.content, 'base64').toString('utf-8');
    const combinedData = JSON.parse(rawJson);
    
    if (combinedData && combinedData.originalPdfBytes && combinedData.docxTemplate) {
      if (ext === '.docx') {
        parser = docxParser;
        templateContent = combinedData.docxTemplate;
      } else {
        parser = pdfParser;
        templateContent = combinedData.originalPdfBytes;
      }
    }
  } catch (_) {
    // If it's not a JSON object, fallback to checking if it's a raw gzip PDF template
    try {
      const zlib = require('zlib');
      const buf = Buffer.from(data.content, 'base64');
      let rawJson;
      try { rawJson = zlib.gunzipSync(buf).toString('utf-8'); } catch (_) { rawJson = data.content; }
      const templateData = JSON.parse(rawJson);
      if (templateData && templateData.pdfBytes && templateData.items) {
        parser = pdfParser;
      }
    } catch (_) {}
  }
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

  const buffer = await parser.exportFile(templateContent, normalizedSegments, targetLang);
  return buffer;
};

module.exports = {
  processUploadedFile,
  exportHtml // Kept same export name for backwards compatibility, but it supports all formats
};
