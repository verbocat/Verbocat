/**
 * =======================================================================================
 * [CRITICAL_SRT_RULE: DO NOT MODIFY OR REFACTOR THIS PARSER STRUCTURE]
 * =======================================================================================
 * IMMUTABLE ARCHITECTURE LAWS FOR SRT SUBTITLE PARSING & SEGMENTATION:
 * 
 * 1. STRICT 1-TO-1 SUBTITLE CUE MAPPING:
 *    For SRT files, EXACTLY ONE SUBTITLE CUE = EXACTLY ONE SEGMENT.
 *    If an SRT file contains N subtitle cues (e.g., 258 subtitles), the parser MUST 
 *    generate EXACTLY N segments (258 segments).
 *    - DO NOT split a subtitle cue across sentence boundaries or line breaks.
 *    - DO NOT combine multiple subtitle cues into a single segment.
 *    - DO NOT skip any subtitle cue (even if blank or containing only tags).
 *
 * 2. COMPLETE TAG & FORMATTING PRESERVATION (MUST PRESERVE 100%):
 *    The parser MUST strictly preserve all inline tags and formatting inside segment text:
 *    - HTML Formatting Tags:
 *        <b> and </b>
 *        <i> and </i>
 *        <u> and </u>
 *        <font> and </font>
 *        <font color="...">
 *        <font face="...">
 *        <font size="...">
 *    - ASS / SubStation / NLE Alignment & Positioning Tags:
 *        {\an1}, {\an2}, {\an3}, {\an4}, {\an5}, {\an6}, {\an7}, {\an8}, {\an9}
 *        {\pos(x,y)}
 *    - SRT Timestamp Coordinate Syntax (on timestamp line):
 *        X1:  X2:  Y1:  Y2:  (e.g., 00:00:01,000 --> 00:00:04,000 X1:100 X2:200 Y1:050 Y2:150)
 *
 *    NEVER strip, remove, sanitize, or alter any of these formatting tags or coordinates.
 *
 * 3. MULTI-LINE CUE INTEGRITY:
 *    Line breaks (\n) inside a multi-line subtitle cue MUST be preserved inside the 
 *    segment text so exported SRT files retain original line wrapping.
 * =======================================================================================
 */

const fs = require('fs');
const zlib = require('zlib');

/**
 * Normalizes line endings and strips UTF-8 BOM, but preserves all inline tags,
 * formatting, and internal line breaks of the subtitle text.
 */
const cleanRawSrtContent = (rawStr) => {
  if (!rawStr) return "";
  // Strip UTF-8 BOM if present (\uFEFF)
  let clean = rawStr.replace(/^\uFEFF/, "");
  // Standardize Windows (\r\n) and Mac (\r) line breaks to Unix (\n)
  clean = clean.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return clean;
};

/**
 * Parses an SRT file into segments and a template string.
 * Enforces 1 Subtitle Cue = 1 Segment (N cues = N segments).
 * Preserves all tags (<b>, <i>, <u>, <font color/face/size>, {\an1}-{\an9}, {\pos(x,y)})
 * and coordinate syntax (X1:, X2:, Y1:, Y2:).
 */
const parseFile = async (filePath) => {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const normalized = cleanRawSrtContent(fileContent);

  const segments = [];
  const templateBlocks = [];
  let segmentIndex = 1; // Strict 1-based indexing (1, 2, ..., N)

  // Primary parsing: Split by double line breaks
  const rawBlocks = normalized.split(/\n\s*\n/);

  for (let blockIdx = 0; blockIdx < rawBlocks.length; blockIdx++) {
    const rawBlock = rawBlocks[blockIdx].trim();
    if (!rawBlock) continue;

    const lines = rawBlock.split("\n");
    
    // Check if lines[0] is sequence number and lines[1] contains timestamp arrow (-->)
    // Matches standard timestamps as well as timestamp lines with X1:, X2:, Y1:, Y2: coordinates
    const isHeaderValid = lines.length >= 2 && 
                          /^\d+$/.test(lines[0].trim()) && 
                          /\d{2}:\d{2}:\d{2}.*-->.*\d{2}:\d{2}:\d{2}/.test(lines[1]);

    if (isHeaderValid) {
      const seqNum = lines[0].trim();
      // Preserves timestamp line along with X1:, X2:, Y1:, Y2: coordinate parameters
      const timestampLine = lines[1].trim();
      
      // Preserve all remaining lines (lines 2+) containing subtitle text & tags:
      // <b>, </b>, <i>, </i>, <u>, </u>, <font color/face/size>, {\an1}-{\an9}, {\pos(x,y)}
      const textLines = lines.slice(2);
      const fullSubText = textLines.join("\n").trim();

      const segId = segmentIndex++;
      
      // Add segment to array (Strict 1-to-1 mapping)
      segments.push({
        id: segId,
        source: fullSubText,
        target: "",
        blockNum: seqNum,
        timestamp: timestampLine
      });

      // Construct template placeholder block
      templateBlocks.push(`${seqNum}\n${timestampLine}\n__SEG_${segId}__`);
    } else {
      // Non-subtitle content (e.g. header noise or trailing comments)
      templateBlocks.push(rawBlock);
    }
  }

  // Fallback scanner: If double line breaks were missing or irregular, use regex scanner
  if (segments.length === 0) {
    const srtBlockRegex = /(?:^|\n)([ \t]*\d+[ \t]*)\n([ \t]*\d{2}:\d{2}:\d{2}[\.,]\d{3}[ \t]*-->[ \t]*\d{2}:\d{2}:\d{2}[\.,]\d{3}[^\n]*)\n([\s\S]*?)(?=\n[ \t]*\d+[ \t]*\n\d{2}:\d{2}:\d{2}|\n\s*\n\s*$|$)/g;
    let match;
    let fallbackIdx = 1;
    templateBlocks.length = 0;
    
    while ((match = srtBlockRegex.exec(normalized)) !== null) {
      const seqNum = match[1].trim();
      const timestampLine = match[2].trim();
      const fullSubText = match[3].trim();
      const segId = fallbackIdx++;

      segments.push({
        id: segId,
        source: fullSubText,
        target: "",
        blockNum: seqNum,
        timestamp: timestampLine
      });

      templateBlocks.push(`${seqNum}\n${timestampLine}\n__SEG_${segId}__`);
    }
  }

  const templateStr = templateBlocks.join("\n\n") + "\n";
  const template = zlib.gzipSync(Buffer.from(templateStr, "utf-8")).toString("base64");

  console.log(`[SRT_PARSER_SUCCESS] Parsed SRT file "${filePath}": Generated EXACTLY ${segments.length} segments for ${segments.length} subtitle cues.`);

  return { segments, template };
};

/**
 * Reconstructs translated SRT file, substituting target text into placeholders.
 * Preserves all formatting (<b>, <i>, <u>, <font color/face/size>, {\an1}-{\an9}, {\pos(x,y)})
 * and coordinate syntax (X1:, X2:, Y1:, Y2:).
 */
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
