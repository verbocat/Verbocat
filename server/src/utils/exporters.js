const cheerio = require("cheerio");

const escapeXml = (unsafe) => {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const generateXliff = (segments, sourceLang = "en", targetLang = "hi", fileName = "document") => {
  let xliff = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xliff += `<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">\n`;
  xliff += `  <file original="${escapeXml(fileName)}" source-language="${sourceLang}" target-language="${targetLang}" datatype="plaintext">\n`;
  xliff += `    <body>\n`;
  
  segments.forEach((seg, idx) => {
    xliff += `      <trans-unit id="${seg.id || idx + 1}">\n`;
    xliff += `        <source>${escapeXml(seg.source)}</source>\n`;
    xliff += `        <target>${escapeXml(seg.target || "")}</target>\n`;
    xliff += `      </trans-unit>\n`;
  });
  
  xliff += `    </body>\n`;
  xliff += `  </file>\n`;
  xliff += `</xliff>\n`;
  return xliff;
};

const generateTmx = (segments, sourceLang = "en", targetLang = "hi") => {
  let tmx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  tmx += `<tmx version="1.4">\n`;
  tmx += `  <header creationtool="Verbocat" creationtoolversion="1.0" datatype="PlainText" segtype="sentence" adminlang="en-US" srclang="${sourceLang}"/>\n`;
  tmx += `  <body>\n`;
  
  segments.forEach((seg) => {
    // Only export segments that have actual translations
    if (seg.target && seg.target.trim() !== "") {
      tmx += `    <tu>\n`;
      tmx += `      <tuv xml:lang="${sourceLang}">\n`;
      tmx += `        <seg>${escapeXml(seg.source)}</seg>\n`;
      tmx += `      </tuv>\n`;
      tmx += `      <tuv xml:lang="${targetLang}">\n`;
      tmx += `        <seg>${escapeXml(seg.target)}</seg>\n`;
      tmx += `      </tuv>\n`;
      tmx += `    </tu>\n`;
    }
  });
  
  tmx += `  </body>\n`;
  tmx += `</tmx>\n`;
  return tmx;
};

const parseXliff = (xmlContent) => {
  const $ = cheerio.load(xmlContent, { xmlMode: true });
  const segments = [];
  
  $("trans-unit").each((_, tuEl) => {
    const tu = $(tuEl);
    const id = tu.attr("id") || "";
    const source = tu.find("source").text().trim();
    const target = tu.find("target").text().trim();
    
    if (source) {
      segments.push({
        id,
        source,
        target
      });
    }
  });
  return segments;
};

const parseTmx = (xmlContent) => {
  const $ = cheerio.load(xmlContent, { xmlMode: true });
  const entries = [];
  
  $("tu").each((_, tuEl) => {
    const tu = $(tuEl);
    const tuvs = tu.find("tuv");
    if (tuvs.length >= 2) {
      const sourceTuv = tuvs.first();
      const targetTuv = tuvs.eq(1);
      
      const sourceText = sourceTuv.find("seg").text().trim();
      const targetText = targetTuv.find("seg").text().trim();
      const sourceLang = sourceTuv.attr("xml:lang") || "en";
      const targetLang = targetTuv.attr("xml:lang") || "hi";
      
      if (sourceText && targetText) {
        entries.push({
          sourceText,
          targetText,
          sourceLang,
          targetLang
        });
      }
    }
  });
  return entries;
};

module.exports = {
  generateXliff,
  generateTmx,
  parseXliff,
  parseTmx
};
