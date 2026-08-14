const fs = require('fs');
const zlib = require('zlib');

const normalizeSegmentText = (text) => (text || "")
  .replace(/\r\n/g, "\n")
  .replace(/\u00a0/g, " ")
  .replace(/[ \t\f\v]+/g, " ")
  .trim();

const parseFile = async (filePath) => {
  const rawText = fs.readFileSync(filePath, "utf-8");
  const normalized = rawText.replace(/\r\n/g, "\n");
  
  const rawBlocks = normalized.split(/\n\s*\n/);
  
  const segments = [];
  let segmentIndex = 1; // STRICT 1-BASED INDEXING (__SEG_1__, __SEG_2__, ...)
  const templateBlocks = [];

  for (const block of rawBlocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    const lines = trimmedBlock.split("\n");
    if (lines.length >= 2 && /^\d+$/.test(lines[0].trim()) && lines[1].includes("-->")) {
      const seqNum = lines[0].trim();
      const timestampLine = lines[1];
      const textLines = lines.slice(2);
      const rawSubText = textLines.join("\n");
      const cleanSubText = normalizeSegmentText(rawSubText);

      if (cleanSubText) {
        const segId = segmentIndex++;
        segments.push({
          id: segId,
          source: cleanSubText,
          target: "",
          blockNum: seqNum,
          timestamp: timestampLine
        });
        templateBlocks.push(`${seqNum}\n${timestampLine}\n__SEG_${segId}__`);
      } else {
        templateBlocks.push(trimmedBlock);
      }
    } else {
      templateBlocks.push(trimmedBlock);
    }
  }

  const templateStr = templateBlocks.join("\n\n") + "\n";
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
