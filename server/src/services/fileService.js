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

let cachedPythonCmd = null;
function getPythonCommand() {
  if (cachedPythonCmd) return cachedPythonCmd;
  const localWindowsPath = 'C:\\Users\\divya\\AppData\\Local\\Programs\\Python\\Python310\\python.exe';
  if (fs.existsSync(localWindowsPath)) {
    cachedPythonCmd = localWindowsPath;
    return cachedPythonCmd;
  }
  try {
    execSync('python3 --version', { stdio: 'ignore' });
    cachedPythonCmd = 'python3';
    return cachedPythonCmd;
  } catch (_) {}
  try {
    execSync('python --version', { stdio: 'ignore' });
    cachedPythonCmd = 'python';
    return cachedPythonCmd;
  } catch (_) {}
  cachedPythonCmd = 'python';
  return cachedPythonCmd;
}

let isPdf2DocxVerified = false;
function ensurePdf2DocxInstalled() {
  if (isPdf2DocxVerified) return;
  const pythonCmd = getPythonCommand();
  try {
    execSync(`"${pythonCmd}" -c "import pdf2docx"`, { stdio: 'ignore' });
    isPdf2DocxVerified = true;
  } catch (e) {
    console.log("pdf2docx is not installed on system. Attempting auto-installation...");
    try {
      execSync(`"${pythonCmd}" -m pip install pdf2docx --break-system-packages`, { stdio: 'ignore' });
      isPdf2DocxVerified = true;
      console.log("pdf2docx installed successfully!");
    } catch (installErr) {
      console.error("Failed to auto-install pdf2docx via pip:", installErr.message);
      throw installErr;
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

let isDocx2PdfVerified = false;
function ensureDocx2PdfInstalled() {
  if (isDocx2PdfVerified) return;
  const pythonCmd = getPythonCommand();
  try {
    execSync(`"${pythonCmd}" -c "import docx2pdf"`, { stdio: 'ignore' });
    isDocx2PdfVerified = true;
  } catch (e) {
    console.log("docx2pdf is not installed on system. Attempting auto-installation...");
    try {
      execSync(`"${pythonCmd}" -m pip install docx2pdf --break-system-packages`, { stdio: 'ignore' });
      isDocx2PdfVerified = true;
      console.log("docx2pdf installed successfully!");
    } catch (installErr) {
      console.error("Failed to auto-install docx2pdf via pip:", installErr.message);
    }
  }
}

async function convertDocxToPdf(docxPath, pdfPath) {
  const pythonCmd = getPythonCommand();
  
  const escapedDocxPath = docxPath.replace(/\\/g, '\\\\');
  const escapedPdfPath = pdfPath.replace(/\\/g, '\\\\');
  
  console.log(`Converting DOCX to PDF: ${docxPath} -> ${pdfPath}`);
  
  // 1. Try docx2pdf (Windows with MS Word)
  try {
    ensureDocx2PdfInstalled();
    const pyScript = `from docx2pdf import convert; convert('${escapedDocxPath}', '${escapedPdfPath}')`;
    execSync(`"${pythonCmd}" -c "${pyScript}"`, { stdio: 'ignore' });
    if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) return;
  } catch (err) {
    console.warn("docx2pdf unavailable or failed (expected on Linux Render):", err.message);
  }

  // 2. Try LibreOffice / soffice (Linux server with libreoffice installed)
  try {
    execSync(`libreoffice --headless --convert-to pdf --outdir "${path.dirname(pdfPath)}" "${docxPath}"`, { stdio: 'ignore' });
    if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) return;
  } catch (_) {}

  try {
    execSync(`soffice --headless --convert-to pdf --outdir "${path.dirname(pdfPath)}" "${docxPath}"`, { stdio: 'ignore' });
    if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) return;
  } catch (_) {}

  // 3. Fallback: Generate PDF directly via PyMuPDF + python-docx (Cross-platform Linux fallback)
  try {
    const pyFallback = `import fitz, docx
d = docx.Document('${escapedDocxPath}')
pdf = fitz.open()
page = pdf.new_page(width=595.28, height=841.89)
y = 50
for p in d.paragraphs:
    txt = p.text.strip()
    if not txt: continue
    rect = fitz.Rect(50, y, 545, y + 100)
    tw = fitz.TextWriter(page.rect)
    tw.fill_textbox(rect, txt, fontsize=11, font=fitz.Font('helv'))
    tw.write_text(page, color=(0,0,0))
    y += 28
    if y > 780:
        page = pdf.new_page(width=595.28, height=841.89)
        y = 50
pdf.save('${escapedPdfPath}')
pdf.close()`;
    execSync(`"${pythonCmd}" -c "${pyFallback}"`, { stdio: 'ignore' });
    if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) return;
  } catch (fbErr) {
    console.error("PyMuPDF DOCX->PDF fallback error:", fbErr.message);
  }

  throw new Error("Unable to convert DOCX to PDF on server environment.");
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
    case '.html':
    case '.htm': return htmlParser;
    case '.docx':
    case '.doc': return docxParser;
    case '.pptx': return pptxParser;
    case '.xlsx':
    case '.csv': return xlsxParser;
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
    // For PDF files, try converting PDF to DOCX using pdf2docx; fall back to direct pdfParser if pdf2docx is unavailable or fails
    if (ext === '.pdf') {
      const tempDocxPath = file.path + '.docx';
      try {
        await convertPdfToDocx(file.path, tempDocxPath);
        const { segments, template: docxTemplate } = await docxParser.parseFile(tempDocxPath);
        const fileId = uuidv4();
        const { error: insertError } = await supabase
          .from("html_files")
          .insert([{ id: fileId, content: docxTemplate }]);

        if (insertError) throw insertError;

        return {
          type: 'pdf',
          fileId,
          segments,
          originalName: file.originalname
        };
      } catch (pdf2docxErr) {
        console.warn("pdf2docx processing failed on server, falling back to direct pdfParser:", pdf2docxErr.message);
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

  // ── Combined Template Routing & Detection ──────────────────────────────
  let isDocxPackage = false;
  let isPyMuPdfTemplate = false;
  try {
    const rawBuf = Buffer.from(templateContent, 'base64');
    if (rawBuf.length >= 2 && rawBuf[0] === 0x50 && rawBuf[1] === 0x4b) {
      isDocxPackage = true;
    } else {
      const zlib = require('zlib');
      let jsonStr = templateContent;
      try {
        try { jsonStr = zlib.unzipSync(rawBuf).toString('utf-8'); }
        catch (_) { jsonStr = rawBuf.toString('utf-8'); }
      } catch (_) {}
      const parsedData = JSON.parse(jsonStr);
      if (parsedData && (parsedData.pdfBytes || parsedData.document_model || parsedData.pdf_bytes || parsedData.items)) {
        isPyMuPdfTemplate = true;
      }
    }
  } catch (_) {}

  if (isPyMuPdfTemplate) {
    parser = pdfParser;
  } else if (isDocxPackage) {
    parser = docxParser;
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (!parser) {
    const error = new Error(`Unsupported export type: ${ext}`);
    error.status = 400;
    throw error;
  }

  // Normalize segment IDs safely without corrupting string UUIDs to NaN
  const normalizedSegments = segments.map((seg, idx) => ({
    ...seg,
    id: (seg.id !== undefined && seg.id !== null && !isNaN(Number(seg.id))) ? Number(seg.id) : (seg.id || idx + 1),
    target: seg.target !== undefined && seg.target !== null ? seg.target : (seg.source || "")
  }));

  // If exporting as PDF and template is a DOCX package (pdf2docx workflow), compile DOCX and convert to PDF
  if (ext === '.pdf' && isDocxPackage) {
    const os = require('os');
    const tempDocxPath = path.join(os.tmpdir(), `matecat_export_docx_${uuidv4()}.docx`);
    const tempPdfPath = path.join(os.tmpdir(), `matecat_export_pdf_${uuidv4()}.pdf`);
    try {
      const docxBuffer = await docxParser.exportFile(templateContent, normalizedSegments, targetLang);
      fs.writeFileSync(tempDocxPath, docxBuffer);
      try {
        await convertDocxToPdf(tempDocxPath, tempPdfPath);
        if (fs.existsSync(tempPdfPath) && fs.statSync(tempPdfPath).size > 0) {
          const pdfResultBuffer = fs.readFileSync(tempPdfPath);
          return pdfResultBuffer;
        }
      } catch (convErr) {
        console.warn("convertDocxToPdf failed on server, returning DOCX buffer as safety fallback:", convErr.message);
      }
      return docxBuffer;
    } finally {
      for (const p of [tempDocxPath, tempPdfPath]) {
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
      }
    }
  }

  // Handle PDF to DOCX export conversion for legacy PyMuPDF templates
  if (ext === '.docx' && isPyMuPdfTemplate) {
    const os = require('os');
    const tempPdfPath = path.join(os.tmpdir(), `matecat_export_pdf_${uuidv4()}.pdf`);
    const tempDocxPath = path.join(os.tmpdir(), `matecat_export_docx_${uuidv4()}.docx`);
    try {
      const pdfBuffer = await pdfParser.exportFile(templateContent, normalizedSegments, targetLang);
      fs.writeFileSync(tempPdfPath, pdfBuffer);
      await convertPdfToDocx(tempPdfPath, tempDocxPath);
      const docxBuffer = fs.readFileSync(tempDocxPath);
      return docxBuffer;
    } finally {
      for (const p of [tempPdfPath, tempDocxPath]) {
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
      }
    }
  }

  const buffer = await parser.exportFile(templateContent, normalizedSegments, targetLang);
  return buffer;
};

module.exports = {
  processUploadedFile,
  exportHtml // Kept same export name for backwards compatibility, but it supports all formats
};
