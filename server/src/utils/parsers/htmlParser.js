const fs = require("fs");
const zlib = require("zlib");
const cheerio = require("cheerio");

const SKIP_SELECTOR = "script,style,noscript,svg,canvas";

const normalizeSegmentText = (text) =>
  (text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .trim();

const escapeHtml = (text) =>
  String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const stripVisibleTags = (text) =>
  String(text || "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const toHtmlText = (text) =>
  escapeHtml(stripVisibleTags(text)).replace(/\n/g, "<br/>");

const parseFile = async (filePath) => {
  const html = fs.readFileSync(filePath, "utf-8");
  const $ = cheerio.load(html, { decodeEntities: false });
  const segments = [];
  let segmentIndex = 0;

  $("body").find("*").contents().each((_, element) => {
    if (element.type !== "text") return;
    const $parent = $(element).parent();
    if ($parent.closest(SKIP_SELECTOR).length > 0) return;

    const rawText = $(element).text();
    const source = normalizeSegmentText(rawText);
    if (!source) return;

    const leading = rawText.match(/^\s*/)?.[0] || "";
    const trailing = rawText.match(/\s*$/)?.[0] || "";
    const segmentId = segmentIndex++;
    
    $(element).replaceWith(`__SEG_${segmentId}__`);
    segments.push({ id: segmentId, source, target: "", leading, trailing });
  });

  const htmlString = $.html();
  const template = zlib.gzipSync(Buffer.from(htmlString, "utf-8")).toString("base64");
  return { segments, template };
};

const exportFile = async (templateBase64, segments) => {
  let html = "";
  try {
    const buffer = Buffer.from(templateBase64, "base64");
    html = zlib.gunzipSync(buffer).toString("utf-8");
  } catch (err) {
    html = templateBase64;
  }

  const segmentMap = new Map();
  segments.forEach((segment) => {
    const replacement = escapeHtml(segment.leading || "") + toHtmlText(segment.target) + escapeHtml(segment.trailing || "");
    segmentMap.set(segment.id, replacement);
  });

  html = html.replace(/__SEG_(\d+)__/g, (match, idStr) => {
    const id = parseInt(idStr, 10);
    if (segmentMap.has(id)) return segmentMap.get(id);
    return match;
  });

  return Buffer.from(html, "utf-8");
};

module.exports = { parseFile, exportFile };
