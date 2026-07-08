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

// ─── Character sanitisation ───────────────────────────────────────────────────
// Map private-use / Symbol / Wingdings codepoints to safe Unicode equivalents
// so they can be drawn with any standard font.
const CHAR_SUBSTITUTIONS = new Map([
  [0xF0B7, '\u2022'], // Wingdings bullet → •
  [0xF076, '\u2022'], // Wingdings solid bullet → •
  [0xF0FC, '\u2713'], // Wingdings check mark → ✓
  [0xF0D8, '\u25B6'], // Wingdings right arrow → ▶
  [0xF0DE, '\u25BA'], // Wingdings right pointer → ►
]);

/**
 * Replace private-use area characters and known Symbol/Wingdings codepoints
 * with safe Unicode equivalents so pdf-lib's WinAnsi-based fonts don't reject them.
 * Characters that have no substitution and fall outside the printable range are
 * replaced with a plain space so they don't cause a hard crash.
 */
function sanitiseText(str) {
  if (!str) return '';
  let out = '';
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (CHAR_SUBSTITUTIONS.has(cp)) {
      out += CHAR_SUBSTITUTIONS.get(cp);
    } else if (cp >= 0xE000 && cp <= 0xF8FF) {
      // Private-use area: unmapped glyph – use a space
      out += ' ';
    } else {
      out += ch;
    }
  }
  return out;
}

// ─── Font helpers ─────────────────────────────────────────────────────────────

/**
 * Map a pdfjs font-name string to a pdf-lib StandardFonts value (best-effort).
 * Falls back to Helvetica for unknown fonts.
 */
function pickStandardFont(fontName) {
  const f = (fontName || '').toLowerCase();
  const isBold = f.includes('bold');
  const isItalic = f.includes('italic') || f.includes('oblique');
  if (f.includes('times') || f.includes('serif')) {
    if (isBold && isItalic) return StandardFonts.TimesRomanBoldItalic;
    if (isBold)   return StandardFonts.TimesRomanBold;
    if (isItalic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (f.includes('courier') || f.includes('mono')) {
    if (isBold && isItalic) return StandardFonts.CourierBoldOblique;
    if (isBold)   return StandardFonts.CourierBold;
    if (isItalic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (isBold && isItalic) return StandardFonts.HelveticaBoldOblique;
  if (isBold)   return StandardFonts.HelveticaBold;
  if (isItalic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

/**
 * Find a Unicode-capable TTF font on the system.
 * Prefers fonts known to cover Devanagari; falls back to broad Unicode fonts.
 * Returns null if nothing is found.
 */
async function findUnicodeTTF() {
  // ── Windows: use built-in system fonts ────────────────────────────────────
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Windows\\Fonts\\mangal.ttf',      // Devanagari-specific (best)
      'C:\\Windows\\Fonts\\Nirmala.ttf',     // Nirmala UI – broad Indic
      'C:\\Windows\\Fonts\\NirmalaS.ttf',
      'C:\\Windows\\Fonts\\segoeui.ttf',     // Segoe UI – broad Unicode
      'C:\\Windows\\Fonts\\arial.ttf',
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        console.log(`PDF export: using Windows font ${path.basename(c)}`);
        return c;
      }
    }
  }

  // ── Linux / cloud: check system font dirs (Devanagari-capable first) ──────
  if (process.platform !== 'win32') {
    const sysCandidates = [
      // Devanagari-specific Noto fonts
      '/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf',
      '/usr/share/fonts/noto/NotoSansDevanagari-Regular.ttf',
      '/usr/share/fonts/opentype/noto/NotoSansDevanagari-Regular.otf',
      // Combined Noto (may or may not have Devanagari depending on distro)
      '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
      '/usr/share/fonts/noto/NotoSans-Regular.ttf',
      // Generic Unicode fallbacks
      '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ];
    for (const c of sysCandidates) {
      if (fs.existsSync(c)) {
        console.log(`PDF export: using system font ${path.basename(c)}`);
        return c;
      }
    }
  }

  // ── Download NotoSansDevanagari as fallback (covers Devanagari + Latin) ───
  // NotoSansDevanagari-Regular supports both Devanagari and Latin scripts.
  // NotoSans-Regular is Latin-ONLY and will show boxes for Devanagari.
  const fontName = 'NotoSansDevanagari-Regular.ttf';
  const fontDirs = [
    path.join(__dirname, '../../assets/fonts'),
    path.join(require('os').tmpdir(), 'matecat-fonts'),
  ];

  // Only TTF URLs — WOFF/WOFF2 cannot be embedded by fontkit
  const downloadUrls = [
    'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf',
    'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf',
  ];

  for (const fontDir of fontDirs) {
    try {
      if (!fs.existsSync(fontDir)) fs.mkdirSync(fontDir, { recursive: true });
      const fontPath = path.join(fontDir, fontName);

      // Already downloaded from a previous run
      if (fs.existsSync(fontPath)) {
        console.log(`PDF export: using cached font ${fontName}`);
        return fontPath;
      }

      for (const url of downloadUrls) {
        try {
          console.log(`Downloading ${fontName}…`);
          const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
          // Sanity check: a valid TTF starts with bytes 0x00010000 or 'true' or 'OTTO'
          const magic = Buffer.from(res.data).slice(0, 4).toString('hex');
          const validTTF = ['00010000', '74727565', '4f54544f'].includes(magic);
          if (!validTTF) {
            console.warn(`  Skipping — downloaded data is not a TTF (magic: ${magic})`);
            continue;
          }
          fs.writeFileSync(fontPath, Buffer.from(res.data));
          console.log(`✅ Downloaded ${fontName} (${res.data.byteLength} bytes)`);
          return fontPath;
        } catch (dlErr) {
          console.warn(`  Download failed from ${url.slice(0, 60)}: ${dlErr.message}`);
        }
      }
    } catch (dirErr) {
      console.warn(`Font dir ${fontDir} not writable: ${dirErr.message}`);
    }
  }

  console.error('Could not obtain a Devanagari-capable TTF font for PDF export.');
  return null;
}

// ─── IMPORT ───────────────────────────────────────────────────────────────────

/**
 * Parse a PDF file and return:
 *  - segments[]  — one per translatable text item, with rich position data
 *  - template    — gzipped+base64 JSON blob:
 *      { pdfBytes: <base64 original PDF>, items: [ { pageIndex, id, x, y, width, height, fontSize, fontName } ] }
 */
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
    const viewport = page.getViewport({ scale: 1.0 });

    const textContent = await page.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    });

    for (const item of textContent.items) {
      const rawText = (item.str || '').replace(/\u00a0/g, ' ').trim();
      if (!rawText) continue;

      const tx = item.transform[4];
      const ty = item.transform[5];
      const fontSize = Math.abs(item.transform[3]) || 12;
      const fontName = (item.fontName || '').replace(/^g_d\d+_/, '');

      const id = segmentIndex++;
      segments.push({ id, source: rawText, target: '' });
      itemMeta.push({
        id,
        pageIndex,
        x: tx,
        y: ty,
        width: item.width || 0,
        height: item.height || fontSize * 1.2,
        fontSize,
        fontName,
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

/**
 * Rebuild the PDF using overlay strategy:
 *  1. Load original PDF bytes from the template
 *  2. Register fontkit so pdf-lib can embed custom TTF fonts
 *  3. Embed a Unicode-capable TTF for non-Latin text
 *  4. For each segment: erase original text with a white rect, draw translated text
 */
const exportFile = async (templateBase64, segments) => {
  // ── Unpack template ──────────────────────────────────────────────────────
  let templateData;
  try {
    const buf = Buffer.from(templateBase64, 'base64');
    templateData = JSON.parse(zlib.gunzipSync(buf).toString('utf-8'));
  } catch (e) {
    throw new Error(
      'PDF template is corrupted or in old format. Please re-upload the file.'
    );
  }

  const { pdfBytes: pdfBytesBase64, items: itemMeta } = templateData;
  if (!pdfBytesBase64 || !itemMeta) {
    throw new Error('PDF template missing original bytes. Please re-upload the file.');
  }

  // ── Build segment map ────────────────────────────────────────────────────
  const segmentMap = new Map();
  for (const seg of segments) {
    segmentMap.set(Number(seg.id), seg.target || seg.source || '');
  }

  // ── Load original PDF & register fontkit ─────────────────────────────────
  const originalBytes = Buffer.from(pdfBytesBase64, 'base64');
  const pdfDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  pdfDoc.registerFontkit(fontkit); // REQUIRED before embedFont with custom TTF

  const pages = pdfDoc.getPages();

  // ── Embed Unicode TTF (covers Devanagari, Latin, and most scripts) ────────
  let unicodeFont = null;
  const ttfPath = await findUnicodeTTF();
  if (ttfPath) {
    try {
      const fontBytes = fs.readFileSync(ttfPath);
      unicodeFont = await pdfDoc.embedFont(fontBytes, { subset: false });
      console.log(`PDF export: using font ${path.basename(ttfPath)}`);
    } catch (e) {
      console.error('Could not embed Unicode TTF:', e.message);
    }
  }

  // ── Pre-embed standard font cache ────────────────────────────────────────
  const stdFontCache = new Map();
  const getStdFont = async (enumVal) => {
    if (!stdFontCache.has(enumVal)) {
      stdFontCache.set(enumVal, await pdfDoc.embedFont(enumVal));
    }
    return stdFontCache.get(enumVal);
  };

  // ── Overlay each text item ───────────────────────────────────────────────
  for (const meta of itemMeta) {
    const { id, pageIndex, x, y, width, height, fontSize, fontName } = meta;

    if (pageIndex >= pages.length) continue;

    let rawText = segmentMap.get(id);
    if (rawText === undefined) continue;

    // Sanitise private-use / Symbol characters to safe Unicode equivalents
    const translatedText = sanitiseText(rawText);
    if (!translatedText.trim()) continue;

    const page = pages[pageIndex];

    // 1. Erase original text with a white rectangle
    const eraseW = Math.max(width, fontSize * translatedText.length * 0.55) + 4;
    const eraseH = height + 2;
    page.drawRectangle({
      x: x - 2,
      y: y - 2,
      width: eraseW,
      height: eraseH,
      color: rgb(1, 1, 1),
      opacity: 1,
      borderWidth: 0,
    });

    // 2. Pick font: prefer the Unicode TTF (handles Devanagari + Latin),
    //    fall back to a matching Standard font for pure-ASCII text.
    const drawSize = Math.max(fontSize, 6);
    const needsUnicode = unicodeFont && /[^\x00-\x7F]/.test(translatedText);
    const font = needsUnicode
      ? unicodeFont
      : await getStdFont(pickStandardFont(fontName));

    // 3. Draw translated text
    try {
      page.drawText(translatedText, {
        x,
        y,
        size: drawSize,
        font,
        color: rgb(0, 0, 0),
        maxWidth: eraseW,
        lineBreak: false,
      });
    } catch (drawErr) {
      // Fallback: try with the other font type
      try {
        const fallbackFont = needsUnicode
          ? await getStdFont(StandardFonts.Helvetica)
          : unicodeFont || await getStdFont(StandardFonts.Helvetica);

        page.drawText(translatedText, {
          x,
          y,
          size: drawSize,
          font: fallbackFont,
          color: rgb(0, 0, 0),
          maxWidth: eraseW,
          lineBreak: false,
        });
      } catch (e2) {
        // Last resort: draw only the ASCII-safe characters
        const asciiOnly = translatedText.replace(/[^\x20-\x7E]/g, '');
        if (asciiOnly.trim()) {
          try {
            const helv = await getStdFont(StandardFonts.Helvetica);
            page.drawText(asciiOnly, { x, y, size: drawSize, font: helv, color: rgb(0, 0, 0) });
          } catch (_) { /* give up on this segment */ }
        }
      }
    }
  }

  // ── Serialise & return ───────────────────────────────────────────────────
  const resultBytes = await pdfDoc.save();
  return Buffer.from(resultBytes);
};

module.exports = { parseFile, exportFile };
