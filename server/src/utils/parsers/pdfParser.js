require('regenerator-runtime/runtime');
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

const FONT_MAP = {
  // Devanagari (Hindi, Marathi)
  'hi': {
    name: 'NotoSansDevanagari-Regular.ttf',
    system: [
      'C:\\Windows\\Fonts\\Nirmala.ttf',
      'C:\\Windows\\Fonts\\mangal.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf',
      '/usr/share/fonts/noto/NotoSansDevanagari-Regular.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf'
    ]
  },
  'mr': {
    name: 'NotoSansDevanagari-Regular.ttf',
    system: [
      'C:\\Windows\\Fonts\\Nirmala.ttf',
      'C:\\Windows\\Fonts\\mangal.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf',
      '/usr/share/fonts/noto/NotoSansDevanagari-Regular.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf'
    ]
  },
  // Bengali
  'bn': {
    name: 'NotoSansBengali-Regular.ttf',
    system: [
      'C:\\Windows\\Fonts\\Nirmala.ttf',
      'C:\\Windows\\Fonts\\vrinda.ttf',
      'C:\\Windows\\Fonts\\shonar.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansBengali/NotoSansBengali-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansBengali/NotoSansBengali-Regular.ttf'
    ]
  },
  // Tamil
  'ta': {
    name: 'NotoSansTamil-Regular.ttf',
    system: [
      'C:\\Windows\\Fonts\\Nirmala.ttf',
      'C:\\Windows\\Fonts\\latha.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansTamil-Regular.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansTamil/NotoSansTamil-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansTamil/NotoSansTamil-Regular.ttf'
    ]
  },
  // Telugu
  'te': {
    name: 'NotoSansTelugu-Regular.ttf',
    system: [
      'C:\\Windows\\Fonts\\Nirmala.ttf',
      'C:\\Windows\\Fonts\\gautami.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansTelugu-Regular.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansTelugu/NotoSansTelugu-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansTelugu/NotoSansTelugu-Regular.ttf'
    ]
  },
  // Gujarati
  'gu': {
    name: 'NotoSansGujarati-Regular.ttf',
    system: [
      'C:\\Windows\\Fonts\\Nirmala.ttf',
      'C:\\Windows\\Fonts\\shruti.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansGujarati-Regular.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansGujarati/NotoSansGujarati-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansGujarati/NotoSansGujarati-Regular.ttf'
    ]
  },
  // Punjabi / Gurmukhi
  'pa': {
    name: 'NotoSansGurmukhi-Regular.ttf',
    system: [
      'C:\\Windows\\Fonts\\Nirmala.ttf',
      'C:\\Windows\\Fonts\\raavi.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansGurmukhi-Regular.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansGurmukhi/NotoSansGurmukhi-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansGurmukhi/NotoSansGurmukhi-Regular.ttf'
    ]
  },
  // Kannada
  'kn': {
    name: 'NotoSansKannada-Regular.ttf',
    system: [
      'C:\\Windows\\Fonts\\Nirmala.ttf',
      'C:\\Windows\\Fonts\\tunga.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansKannada-Regular.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansKannada/NotoSansKannada-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansKannada/NotoSansKannada-Regular.ttf'
    ]
  },
  // Malayalam
  'ml': {
    name: 'NotoSansMalayalam-Regular.ttf',
    system: [
      'C:\\Windows\\Fonts\\Nirmala.ttf',
      'C:\\Windows\\Fonts\\kartika.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansMalayalam-Regular.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansMalayalam/NotoSansMalayalam-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansMalayalam/NotoSansMalayalam-Regular.ttf'
    ]
  },
  // Arabic & Urdu
  'ar': {
    name: 'NotoSansArabic-Regular.ttf',
    system: [
      'C:\\Windows\\Fonts\\tahoma.ttf',
      'C:\\Windows\\Fonts\\arial.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansArabic/NotoSansArabic-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansArabic/NotoSansArabic-Regular.ttf'
    ]
  },
  'ur': {
    name: 'NotoSansArabic-Regular.ttf',
    system: [
      'C:\\Windows\\Fonts\\tahoma.ttf',
      'C:\\Windows\\Fonts\\arial.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansArabic/NotoSansArabic-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansArabic/NotoSansArabic-Regular.ttf'
    ]
  },
  // Cyrillic (Russian)
  'ru': {
    name: 'NotoSans-Regular.ttf',
    system: [
      'C:\\Windows\\Fonts\\arial.ttf',
      'C:\\Windows\\Fonts\\segoeui.ttf',
      '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf'
    ]
  },
  // Thai
  'th': {
    name: 'NotoSansThai-Regular.ttf',
    system: [
      'C:\\Windows\\Fonts\\leelawad.ttf',
      'C:\\Windows\\Fonts\\cordia.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf'
    ]
  },
  // Chinese (Simplified)
  'zh-cn': {
    name: 'NotoSansSC-Regular.otf',
    system: [
      'C:\\Windows\\Fonts\\msyh.ttc',
      'C:\\Windows\\Fonts\\msyh.ttf',
      'C:\\Windows\\Fonts\\simsun.ttc',
      'C:\\Windows\\Fonts\\simsun.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf'
    ]
  },
  // Japanese
  'ja': {
    name: 'NotoSansJP-Regular.otf',
    system: [
      'C:\\Windows\\Fonts\\meiryo.ttc',
      'C:\\Windows\\Fonts\\msgothic.ttc',
      'C:\\Windows\\Fonts\\msmincho.ttc'
    ],
    urls: [
      'https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf'
    ]
  },
  // Korean
  'ko': {
    name: 'NotoSansKR-Regular.otf',
    system: [
      'C:\\Windows\\Fonts\\malgun.ttf',
      'C:\\Windows\\Fonts\\batang.ttc'
    ],
    urls: [
      'https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf'
    ]
  },
  // Standard NotoSans for Latin-based / other languages
  'default': {
    name: 'NotoSans-Regular.ttf',
    system: [
      'C:\\Windows\\Fonts\\segoeui.ttf',
      'C:\\Windows\\Fonts\\arial.ttf',
      '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    ],
    urls: [
      'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf',
      'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf'
    ]
  }
};

/**
 * Load the Unicode TTF/OTF font bytes dynamically based on target language.
 *
 * Returns a Buffer of TTF/OTF bytes, or null on complete failure.
 */
async function loadUnicodeFontBytes(targetLang = 'hi', forceDownload = false) {
  const cleanLang = String(targetLang || "").toLowerCase();
  const langPrefix = cleanLang.split('-')[0];
  const fontConfig = FONT_MAP[cleanLang] || FONT_MAP[langPrefix] || FONT_MAP['default'];

  // If forceDownload is false, try local options first
  if (!forceDownload) {
    // 1. Try bundled assets folder first
    const bundledPath = path.join(__dirname, '../../assets/fonts/', fontConfig.name);
    if (fs.existsSync(bundledPath)) {
      console.log(`PDF export: using bundled font ${fontConfig.name}`);
      return fs.readFileSync(bundledPath);
    }

    // 2. Try OS system fonts
    if (fontConfig.system) {
      for (const p of fontConfig.system) {
        if (fs.existsSync(p)) {
          console.log(`PDF export: using system font ${path.basename(p)}`);
          return fs.readFileSync(p);
        }
      }
    }
  }

  // 3. Try cache directory
  const cacheDir  = path.join(require('os').tmpdir(), 'matecat-fonts');
  const cachePath = path.join(cacheDir, fontConfig.name);
  if (fs.existsSync(cachePath)) {
    console.log(`PDF export: using cached font ${fontConfig.name}`);
    return fs.readFileSync(cachePath);
  }

  // 4. Try downloading
  if (fontConfig.urls) {
    for (const url of fontConfig.urls) {
      try {
        console.log(`PDF export: downloading ${fontConfig.name} from ${url.slice(0, 70)}…`);
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
        const buf = Buffer.from(res.data);
        const magic = buf.slice(0, 4).toString('hex');
        // TTF: 00010000, 74727565 (true); OTF: 4f54544f (OTTO); TTC: 74746366 (ttcf)
        if (!['00010000', '74727565', '4f54544f', '74746366'].includes(magic)) {
          console.warn(`  Invalid font magic (${magic}), skipping`);
          continue;
        }
        try {
          if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(cachePath, buf);
        } catch (_) {}
        console.log(`PDF export: downloaded ${fontConfig.name} (${buf.length} bytes)`);
        return buf;
      } catch (e) {
        console.warn(`  Download failed: ${e.message}`);
      }
    }
  }

  // 5. Final fallback to bundled font if any other font load failed
  if (fs.existsSync(BUNDLED_FONT_PATH)) {
    console.log('PDF export: fallback to bundled NotoSansDevanagari');
    return fs.readFileSync(BUNDLED_FONT_PATH);
  }

  console.error(`PDF export: could not obtain font for language ${targetLang}`);
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

    const pageItems = [];
    for (const item of textContent.items) {
      const rawText = (item.str || '').replace(/\u00a0/g, ' ');
      if (!rawText.trim()) continue;

      const tx       = item.transform[4];
      const ty       = item.transform[5];
      const fontSize = Math.abs(item.transform[3]) || 12;
      const fontName = (item.fontName || '').replace(/^g_d\d+_/, '');

      pageItems.push({
        text: rawText,
        x: tx,
        y: ty,
        width:  item.width  || 0,
        height: item.height || fontSize * 1.2,
        fontSize,
        fontName,
      });
    }

    // Sort page items: top-to-bottom, left-to-right
    pageItems.sort((a, b) => {
      if (Math.abs(a.y - b.y) <= 4) {
        return a.x - b.x;
      }
      return b.y - a.y;
    });

    // Group items into lines
    const lines = [];
    for (const item of pageItems) {
      if (lines.length === 0) {
        lines.push([item]);
      } else {
        const lastLine = lines[lines.length - 1];
        const representative = lastLine[0];
        const prevItem = lastLine[lastLine.length - 1];

        const gap = item.x - (prevItem.x + prevItem.width);
        const maxGap = Math.max(representative.fontSize * 5, 50);

        if (Math.abs(item.y - representative.y) <= 4 && gap < maxGap) {
          lastLine.push(item);
        } else {
          lines.push([item]);
        }
      }
    }

    // Process grouped lines
    for (const lineItems of lines) {
      let mergedText = "";
      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        if (i === 0) {
          mergedText = item.text;
        } else {
          const prev = lineItems[i - 1];
          const hasSpace = prev.text.endsWith(" ") || item.text.startsWith(" ");
          const needsSpace = !hasSpace && (item.x - (prev.x + prev.width) > 1);
          mergedText += (needsSpace ? " " : "") + item.text;
        }
      }
      mergedText = mergedText.trim();
      if (!mergedText) continue;

      const firstItem = lineItems[0];
      const lastItem = lineItems[lineItems.length - 1];

      const x = firstItem.x;
      const y = firstItem.y;
      const calculatedWidth = (lastItem.x + lastItem.width) - firstItem.x;
      const width = calculatedWidth > 0 ? calculatedWidth : Math.max(...lineItems.map(li => li.width));
      const height = Math.max(...lineItems.map(li => li.height));
      const fontSize = Math.max(...lineItems.map(li => li.fontSize));
      const fontName = firstItem.fontName;

      const id = segmentIndex++;
      segments.push({ id, source: mergedText, target: '' });
      itemMeta.push({
        id, pageIndex,
        x, y,
        width, height,
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

function splitIntoScriptRuns(text, unicodeFont) {
  if (!unicodeFont) {
    return [{ text, isUnicode: false }];
  }

  const runs = [];
  let currentRun = "";
  let currentIsUnicode = null;

  for (const char of text) {
    const isUnicode = char.codePointAt(0) > 127;

    if (currentIsUnicode === null) {
      currentIsUnicode = isUnicode;
      currentRun = char;
    } else if (currentIsUnicode === isUnicode) {
      currentRun += char;
    } else {
      runs.push({ text: currentRun, isUnicode: currentIsUnicode });
      currentIsUnicode = isUnicode;
      currentRun = char;
    }
  }

  if (currentRun) {
    runs.push({ text: currentRun, isUnicode: currentIsUnicode });
  }

  return runs;
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────

const exportFile = async (templateBase64, segments, targetLang = 'hi') => {
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

  // Embed the Unicode font based on target language
  let unicodeFont = null;
  let fontBytes = await loadUnicodeFontBytes(targetLang, false);
  if (fontBytes) {
    try {
      unicodeFont = await pdfDoc.embedFont(fontBytes);
      console.log(`PDF export: Unicode font for ${targetLang} embedded successfully`);
    } catch (e) {
      console.warn(`PDF export: Initial font embed failed for ${targetLang}, trying download fallback...`, e.message);
      fontBytes = await loadUnicodeFontBytes(targetLang, true);
      if (fontBytes) {
        try {
          unicodeFont = await pdfDoc.embedFont(fontBytes);
          console.log(`PDF export: Downloaded fallback font for ${targetLang} embedded successfully`);
        } catch (downloadErr) {
          console.error(`PDF export: Downloaded fallback font embed failed as well for ${targetLang}:`, downloadErr.message);
        }
      }
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
    //  - unicodeFont for ANY non-ASCII character
    //  - standard WinAnsi font only for pure ASCII
    const hasNonAscii = /[^\x20-\x7E]/.test(text);
    const font = (hasNonAscii && unicodeFont)
      ? unicodeFont
      : await getStdFont(pickStandardFont(fontName));

    // Estimate erase width — CJK, Indic, Arabic, Latin have different widths
    let charWidth = 0.55;
    if (hasNonAscii) {
      const cleanLang = String(targetLang || "").toLowerCase();
      const isCJK = /^(zh|ja|ko)/.test(cleanLang);
      const isIndic = /^(hi|mr|bn|ta|te|gu|pa|kn|ml)/.test(cleanLang);
      if (isCJK) {
        charWidth = 1.1;
      } else if (isIndic) {
        charWidth = 0.7;
      } else {
        charWidth = 0.65;
      }
    }
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

    // 2. Draw translated text at the same position, splitting into script runs
    let currentX = x;
    const runs = splitIntoScriptRuns(text, unicodeFont);

    for (const run of runs) {
      const runFont = run.isUnicode
        ? unicodeFont
        : await getStdFont(pickStandardFont(fontName));

      try {
        page.drawText(run.text, {
          x: currentX,
          y,
          size: drawSize,
          font: runFont,
          color: rgb(0, 0, 0),
          lineBreak: false,
        });
      } catch (err) {
        // Fallback if drawing fails
        const fallback = run.isUnicode
          ? await getStdFont(StandardFonts.Helvetica)
          : unicodeFont;

        if (fallback) {
          try {
            page.drawText(run.text, {
              x: currentX,
              y,
              size: drawSize,
              font: fallback,
              color: rgb(0, 0, 0),
            });
          } catch (_) {}
        }
      }

      // Advance currentX by width of run
      try {
        const runWidth = runFont.widthOfTextAtSize(run.text, drawSize);
        currentX += runWidth;
      } catch (_) {
        currentX += drawSize * run.text.length * (run.isUnicode ? charWidth : 0.55);
      }
    }
  }

  const resultBytes = await pdfDoc.save();
  return Buffer.from(resultBytes);
};

module.exports = { parseFile, exportFile };
