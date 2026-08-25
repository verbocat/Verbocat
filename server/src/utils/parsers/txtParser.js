const fs = require('fs');
const zlib = require('zlib');
const { segmentParagraph } = require('./segmentationUtils');

const parseFile = async (filePath) => {
  const rawText = fs.readFileSync(filePath, "utf-8");
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  
  // Split by 2+ consecutive newlines (paragraphs separated by blank lines)
  const blocks = normalized.split(/(\n\s*\n+)/);

  const segments = [];
  let segmentIndex = 1; // STRICT 1-BASED INDEXING (__SEG_1__, __SEG_2__, ...)

  const templateBlocks = blocks.map((block, idx) => {
    // If it's a delimiter block or whitespace-only, preserve as-is in template
    if (idx % 2 === 1 || !block.trim()) {
      return block;
    }

    const leading = block.match(/^\s*/)?.[0] || "";
    const trailing = block.match(/\s*$/)?.[0] || "";
    const trimmed = block.trim();

    const subSegments = segmentParagraph(trimmed, null, { maxWords: 150 });
    const segPlaceholders = [];

    for (const subSeg of subSegments) {
      const segmentId = segmentIndex++;
      segments.push({
        id: segmentId,
        source: subSeg,
        target: "",
        leading: "",
        trailing: ""
      });
      segPlaceholders.push(`__SEG_${segmentId}__`);
    }

    return `${leading}${segPlaceholders.join(" ")}${trailing}`;
  });

  const templateStr = templateBlocks.join('');
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
  segments.forEach((segment, arrayIdx) => {
    const targetText = (segment.target !== undefined && segment.target !== null && segment.target !== "")
      ? segment.target
      : (segment.source || "");
    const key = segment.id !== undefined && segment.id !== null ? Number(segment.id) : (arrayIdx + 1);
    segmentMap.set(key, targetText);
    if (segment.id) segmentMap.set(Number(segment.id), targetText);
  });

  const resultStr = templateStr.replace(/__SEG_(\d+)__/g, (match, idStr) => {
    const id = parseInt(idStr, 10);
    if (segmentMap.has(id)) return segmentMap.get(id);
    return match;
  });

  return Buffer.from(resultStr, "utf-8");
};

module.exports = { parseFile, exportFile };
