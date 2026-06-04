const fs = require('fs');
const zlib = require('zlib');

const normalizeSegmentText = (text) => (text || "").replace(/\u00a0/g, " ").replace(/[ \t\r\f\v]+/g, " ").replace(/\n\s*/g, "\n").trim();

const parseFile = async (filePath) => {
  const text = fs.readFileSync(filePath, "utf-8");
  const paragraphs = text.split(/\r?\n/);
  
  const segments = [];
  let segmentIndex = 0;
  
  const templateLines = paragraphs.map(p => {
    const source = normalizeSegmentText(p);
    if (!source) return p;
    
    const leading = p.match(/^\s*/)?.[0] || "";
    const trailing = p.match(/\s*$/)?.[0] || "";
    const segmentId = segmentIndex++;
    
    segments.push({ id: segmentId, source, target: "", leading, trailing });
    return `${leading}__SEG_${segmentId}__${trailing}`;
  });

  const templateStr = templateLines.join('\n');
  const template = zlib.gzipSync(Buffer.from(templateStr, "utf-8")).toString("base64");
  return { segments, template };
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
    segmentMap.set(segment.id, segment.target);
  });

  const resultStr = templateStr.replace(/__SEG_(\d+)__/g, (match, idStr) => {
    const id = parseInt(idStr, 10);
    if (segmentMap.has(id)) return segmentMap.get(id);
    return match;
  });

  return Buffer.from(resultStr, "utf-8");
};

module.exports = { parseFile, exportFile };
