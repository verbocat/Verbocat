const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const axios = require('axios');

// ─── pdfjs-dist (ESM-only in v4+) ────────────────────────────────────────────
let _pdfjsLib = null;
async function getPdfjsLib() {
  if (!_pdfjsLib) {
    _pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const workerPath = path.resolve(
      __dirname,
      '../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
    );
    _pdfjsLib.GlobalWorkerOptions.workerSrc =
      'file:///' + workerPath.replace(/\\/g, '/');
  }
  return _pdfjsLib;
}

// ─── pdf-lib + fontkit ───────────────────────────────────────────────────────
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

// ─── Bundled font path ───────────────────────────────────────────────────────
// NotoSansDevanagari covers: Devanagari (Hindi, Marathi, Sanskrit) + Latin.
// This file is committed to the repo so it's ALWAYS available — no network needed.
const BUNDLED_FONT_PATH = path.join(__dirname, '../../assets/fonts/NotoSansDevanagari-Regular.ttf');

// ─── Character sanitisation ───────────────────────────────────────────────────
// Wingdings/Symbol glyphs live in the Private Use Area (0xE000–0xF8FF).
// They have no standard Unicode representation at those codepoints, so we map
// the common ones to their proper Unicode equivalents.
const CHAR_SUBSTITUTIONS = new Map([
  [0xF0B7, '\u2022'], // Wingdings bullet       → •
  [0xF076, '\u2022'], // Wingdings solid bullet  → •
  [0xF0FC, '\u2713'], // Wingdings check mark    → ✓
  [0xF0D8, '\u25B6'], // Wingdings right arrow   → ▶
  [0xF0DE, '\u25BA'], // Wingdings right pointer → ►
  [0xF028, '('],
  [0xF029, ')'],
]);

function sanitiseText(str) {
  if (!str) return '';
  let out = '';
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (CHAR_SUBSTITUTIONS.has(cp)) {
      out += CHAR_SUBSTITUTIONS.get(cp);
    } else if (cp >= 0xE000 && cp <= 0xF8FF) {
      // Unmapped private-use glyph → space
      out += ' ';
    } else {
      out += ch;
    }
  }
  return out;
}

// ─── Font helpers ─────────────────────────────────────────────────────────────

function pickStandardFont(fontName) {
  const f = (fontName || '').toLowerCase();
  const bold   = f.includes('bold');
  const italic = f.includes('italic') || f.includes('oblique');
  if (f.includes('times') || f.includes('serif')) {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold)           return StandardFonts.TimesRomanBold;
    if (italic)         return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (f.includes('courier') || f.includes('mono')) {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold)           return StandardFonts.CourierBold;
    if (italic)         return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold)           return StandardFonts.HelveticaBold;
  if (italic)         return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

/**
 * Load the Unicode TTF font bytes.
 *
 * Priority order:
 *   1. Bundled font (always present in repo — fastest, no I/O surprises)
 *   2. OS system fonts (Windows only, for local dev)
 *   3. Download as last resort (Linux environments without the bundled file)
 *
 * Returns a Buffer of TTF bytes, or null on complete failure.
 */
async function loadUnicodeFontBytes() {
  // 1. Bundled font — always try this first
  if (fs.existsSync(BUNDLED_FONT_PATH)) {
    console.log('PDF export: using bundled NotoSansDevanagari');
    return fs.readFileSync(BUNDLED_FONT_PATH);
  }

  // 2. OS system fonts (Windows dev machine)
  const systemCandidates = [
    'C:\\Windows\\Fonts\\mangal.ttf',
    'C:\\Windows\\Fonts\\Nirmala.ttf',
    'C:\\Windows\\Fonts\\NirmalaS.ttf',
    'C:\\Windows\\Fonts\\segoeui.ttf',
    // Linux system paths
    '/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf',
    '/usr/share/fonts/noto/NotoSansDevanagari-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];
  for (const p of systemCandidates) {
    if (fs.existsSync(p)) {
      console.log(`PDF export: using system font ${path.basename(p)}`);
      return fs.readFileSync(p);
    }
  }

  // 3. Download (last resort — only if bundled font somehow missing)
  const cacheDir  = path.join(require('os').tmpdir(), 'matecat-fonts');
  const cachePath = path.join(cacheDir, 'NotoSansDevanagari-Regular.ttf');
  if (fs.existsSync(cachePath)) {
    console.log('PDF export: using cached NotoSansDevanagari');
    return fs.readFileSync(cachePath);
  }

  const downloadUrls = [
    'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf',
    'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf',
  ];

  for (const url of downloadUrls) {
    try {
      console.log(`PDF export: downloading NotoSansDevanagari from ${url.slice(0, 70)}…`);
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
      const buf = Buffer.from(res.data);
      // Validate TTF magic bytes (00010000 = TrueType, 74727565 = 'true', 4f54544f = 'OTTO')
      const magic = buf.slice(0, 4).toString('hex');
      if (!['00010000', '74727565', '4f54544f'].includes(magic)) {
        console.warn(`  Invalid TTF magic (${magic}), skipping`);
        continue;
      }
      try {
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cachePath, buf);
      } catch (_) { /* cache write failed — not fatal */ }
      console.log(`PDF export: downloaded NotoSansDevanagari (${buf.length} bytes)`);
      return buf;
    } catch (e) {
      console.warn(`  Download failed: ${e.message}`);
    }
  }

  console.error('PDF export: could not obtain a Unicode TTF font — non-Latin text may not render');
  return null;
}

// ─── IMPORT ───────────────────────────────────────────────────────────────────

const parseFile = async (filePath) => {
  const fileBuffer = fs.readFileSync(filePath);
  const pdfBytesBase64 = fileBuffer.toString('base64');

  const pdfjsLib = await getPdfjsLib();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(fileBuffer),
    disableWorker: true,
  });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const segments = [];
  const itemMeta = [];
  let segmentIndex = 0;

  for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
    const page = await pdfDoc.getPage(pageIndex + 1);

    const textContent = await page.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    });

    for (const item of textContent.items) {
      const rawText = (item.str || '').replace(/\u00a0/g, ' ').trim();
      if (!rawText) continue;

      const tx       = item.transform[4];
      const ty       = item.transform[5];
      const fontSize = Math.abs(item.transform[3]) || 12;
      const fontName = (item.fontName || '').replace(/^g_d\d+_/, '');

      const id = segmentIndex++;
      segments.push({ id, source: rawText, target: '' });
      itemMeta.push({
        id, pageIndex,
        x: tx, y: ty,
        width:  item.width  || 0,
        height: item.height || fontSize * 1.2,
        fontSize, fontName,
      });
    }
  }

  const templateData = { pdfBytes: pdfBytesBase64, items: itemMeta };
  const template = zlib
    .gzipSync(Buffer.from(JSON.stringify(templateData), 'utf-8'))
    .toString('base64');

  return { segments, template };
};

// ─── EXPORT ───────────────────────────────────────────────────────────────────

const exportFile = async (templateBase64, segments) => {
  // Unpack template
  let templateData;
  try {
    const buf = Buffer.from(templateBase64, 'base64');
    templateData = JSON.parse(zlib.gunzipSync(buf).toString('utf-8'));
  } catch (e) {
    throw new Error('PDF template is corrupted or in old format. Please re-upload the file.');
  }

  const { pdfBytes: pdfBytesBase64, items: itemMeta } = templateData;
  if (!pdfBytesBase64 || !itemMeta) {
    throw new Error('PDF template missing original bytes. Please re-upload the file.');
  }

  // Build segment map
  const segmentMap = new Map();
  for (const seg of segments) {
    segmentMap.set(Number(seg.id), seg.target || seg.source || '');
  }

  // Load original PDF and register fontkit
  const originalBytes = Buffer.from(pdfBytesBase64, 'base64');
  const pdfDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  pdfDoc.registerFontkit(fontkit);

  const pages = pdfDoc.getPages();

  // Embed the Unicode font (NotoSansDevanagari — covers Devanagari + Latin)
  let unicodeFont = null;
  const fontBytes = await loadUnicodeFontBytes();
  if (fontBytes) {
    try {
      unicodeFont = await pdfDoc.embedFont(fontBytes);
      console.log('PDF export: Unicode font embedded successfully');
    } catch (e) {
      console.error('PDF export: font embed failed —', e.message);
    }
  }

  // Standard font cache (for pure-ASCII text)
  const stdFontCache = new Map();
  const getStdFont = async (enumVal) => {
    if (!stdFontCache.has(enumVal)) {
      stdFontCache.set(enumVal, await pdfDoc.embedFont(enumVal));
    }
    return stdFontCache.get(enumVal);
  };

  // Overlay each text item
  for (const meta of itemMeta) {
    const { id, pageIndex, x, y, width, height, fontSize, fontName } = meta;
    if (pageIndex >= pages.length) continue;

    const rawText = segmentMap.get(id);
    if (rawText === undefined) continue;

    // Sanitise private-use / Wingdings characters
    const text = sanitiseText(rawText);
    if (!text.trim()) continue;

    const page     = pages[pageIndex];
    const drawSize = Math.max(fontSize, 6);

    // Choose font:
    //  - unicodeFont (NotoSansDevanagari) for ANY non-ASCII character
    //  - standard WinAnsi font only for pure ASCII
    const hasNonAscii = /[^\x20-\x7E]/.test(text);
    const font = (hasNonAscii && unicodeFont)
      ? unicodeFont
      : await getStdFont(pickStandardFont(fontName));

    // Estimate erase width — NotoSansDevanagari glyphs are wider than Latin
    const charWidth   = hasNonAscii ? 0.65 : 0.55;
    const eraseW      = Math.max(width, drawSize * text.length * charWidth) + 8;
    const eraseH      = height + 4;

    // 1. White rectangle to erase original text
    page.drawRectangle({
      x: x - 2, y: y - 2,
      width: eraseW, height: eraseH,
      color: rgb(1, 1, 1),
      opacity: 1,
      borderWidth: 0,
    });

    // 2. Draw translated text at the same position
    try {
      page.drawText(text, {
        x, y,
        size: drawSize,
        font,
        color: rgb(0, 0, 0),
        maxWidth: eraseW,
        lineBreak: false,
      });
    } catch (err) {
      // If chosen font fails, try the other type
      const fallback = (hasNonAscii && unicodeFont)
        ? await getStdFont(StandardFonts.Helvetica)
        : unicodeFont;

      if (fallback) {
        try {
          page.drawText(text, { x, y, size: drawSize, font: fallback, color: rgb(0, 0, 0) });
        } catch (_) { /* skip unrenderable segment */ }
      }
    }
  }

  const resultBytes = await pdfDoc.save();
  return Buffer.from(resultBytes);
};

module.exports = { parseFile, exportFile };
