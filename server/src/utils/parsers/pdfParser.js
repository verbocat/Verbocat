const fs = require('fs');
const zlib = require('zlib');
const PDFDocument = require('pdfkit');
const axios = require('axios');
const path = require('path');

// pdfjs-dist is ESM-only in v4+; use dynamic import and cache
let _pdfjsLib = null;
async function getPdfjsLib() {
  if (!_pdfjsLib) {
    _pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // Point to the bundled worker so it works in Node.js without a browser
    const workerPath = path.resolve(__dirname, '../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
    _pdfjsLib.GlobalWorkerOptions.workerSrc = 'file:///' + workerPath.replace(/\\/g, '/');
  }
  return _pdfjsLib;
}

const normalizeSegmentText = (text) => 
  (text || "").replace(/\u00a0/g, " ").replace(/[ \t\r\f\v]+/g, " ").replace(/\n\s*/g, "\n").trim();

// Custom page renderer to inject form feeds as page separators
function renderPageWithSeparator(pageData) {
  let render_options = {
    normalizeWhitespace: true,
    disableCombineTextItems: false
  };

  return pageData.getTextContent(render_options)
    .then(function(textContent) {
      let lastY, text = '';
      for (let item of textContent.items) {
        if (lastY === item.transform[5] || !lastY) {
          text += item.str;
        } else {
          text += '\n' + item.str;
        }
        lastY = item.transform[5];
      }
      return text + '\f';
    });
}

const parseFile = async (filePath) => {
  const fileBuffer = fs.readFileSync(filePath);

  // Load PDF using pdfjs-dist legacy build (ESM, loaded via dynamic import)
  const pdfjsLib = await getPdfjsLib();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer), disableWorker: true });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const pageTexts = [];

  // Extract text from each page using custom renderer
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const text = await renderPageWithSeparator(page);
    pageTexts.push(text);
  }

  // pdfjs pages already include a form feed at the end of each page's text
  const rawText = pageTexts.join('');
  // Split pages by form feed
  const pages = rawText.split('\f');
  // Remove the trailing empty page if there is one
  if (pages.length > 0 && !pages[pages.length - 1].trim()) {
    pages.pop();
  }

  const segments = [];
  let segmentIndex = 0;
  const templatePages = pages.map((pageText) => {
    const lines = pageText.split(/\r?\n/);
    const templateLines = lines.map(line => {
      const source = normalizeSegmentText(line);
      if (!source) return line;

      const leading = line.match(/^\s*/)?.[0] || "";
      const trailing = line.match(/\s*$/)?.[0] || "";
      const segmentId = segmentIndex++;

      segments.push({ id: segmentId, source, target: "", leading, trailing });
      return `${leading}__SEG_${segmentId}__${trailing}`;
    });
    return templateLines.join('\n');
  });

  const templateStr = templatePages.join('\f');
  const template = zlib.gzipSync(Buffer.from(templateStr, "utf-8")).toString("base64");

  return { segments, template };
};

const ensureFontInstalled = async (targetLang) => {
  const isHindi = (targetLang || "").toLowerCase().startsWith('hi');

  // On Windows, prefer built-in system fonts — they work reliably with pdfkit/fontkit
  if (process.platform === 'win32') {
    // Segoe UI has broad Unicode coverage including Devanagari and works with fontkit
    const segoeui = 'C:\\Windows\\Fonts\\segoeui.ttf';
    if (fs.existsSync(segoeui)) return segoeui;
    // Arial as general fallback
    const arial = 'C:\\Windows\\Fonts\\arial.ttf';
    if (fs.existsSync(arial)) return arial;
  }

  // Non-Windows: try to download NotoSans (Latin variant, simpler tables, no fontkit crash)
  const fontDir = path.join(__dirname, '../../assets/fonts');
  if (!fs.existsSync(fontDir)) {
    fs.mkdirSync(fontDir, { recursive: true });
  }

  const fontName = 'NotoSans-Regular.ttf';
  const fontPath = path.join(fontDir, fontName);

  if (!fs.existsSync(fontPath)) {
    console.log(`Downloading ${fontName} for PDF export...`);
    const url = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf';
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
      fs.writeFileSync(fontPath, Buffer.from(response.data));
      console.log(`Successfully downloaded ${fontName}`);
    } catch (err) {
      console.error(`Failed to download ${fontName}:`, err.message);
      return null;
    }
  }

  return fontPath;
};

const exportFile = async (templateBase64, segments) => {
  let templateStr = "";
  try {
    const buffer = Buffer.from(templateBase64, "base64");
    templateStr = zlib.gunzipSync(buffer).toString("utf-8");
  } catch (err) {
    templateStr = templateBase64;
  }

  const segmentMap = new Map();
  segments.forEach((segment) => {
    segmentMap.set(segment.id, segment.target || segment.source);
  });

  const resultStr = templateStr.replace(/__SEG_(\d+)__/g, (match, idStr) => {
    const id = parseInt(idStr, 10);
    if (segmentMap.has(id)) return segmentMap.get(id);
    return match;
  });

  const exportedPages = resultStr.split('\f');

  // Detect script language based on translation targets
  let hasDevanagari = false;
  for (const segment of segments) {
    const textToCheck = segment.target || segment.source || "";
    if (/[\u0900-\u097F]/.test(textToCheck)) {
      hasDevanagari = true;
      break;
    }
  }

  const targetLangType = hasDevanagari ? 'hi' : 'en';
  const fontPath = await ensureFontInstalled(targetLangType);

  const doc = new PDFDocument({ margin: 50 });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', err => reject(err));

    if (fontPath) {
      doc.font(fontPath);
    }

    exportedPages.forEach((pageText, idx) => {
      if (idx > 0) {
        doc.addPage();
      }
      doc.text(pageText);
    });

    doc.end();
  });
};

module.exports = { parseFile, exportFile };
