const fs = require("fs");
const zlib = require("zlib");
const cheerio = require("cheerio");
const {
  extractPlaceholders,
  splitByPunctuation,
  restorePlaceholders,
  extractSegmentTags,
} = require("./segmentationUtils");

const SKIP_SELECTOR = "script,style,noscript,svg,canvas";
const BLOCK_TAGS = [
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "blockquote", 
  "section", "article", "nav", "header", "footer", "figcaption", "address", "main"
];

const parseFile = async (filePath) => {
  const html = fs.readFileSync(filePath, "utf-8");
  const $ = cheerio.load(html, { decodeEntities: false });
  const segments = [];
  let segmentIndex = 0;

  const tagMapGlobal = new Map();
  const tagCounter = { value: 1 };
  const processedBlocks = new Set();

  $("body").find("*").contents().each((_, element) => {
    if (element.type !== "text") return;

    // Skip text nodes that have been detached from the body (already processed inside a block)
    if ($(element).parents("body").length === 0) return;

    const rawText = $(element).text().trim();
    if (!rawText) return;

    let $block = $(element).closest(BLOCK_TAGS.join(","));
    if ($block.length === 0) {
      $block = $(element).parent();
    }

    if ($block.closest(SKIP_SELECTOR).length > 0) return;

    const blockNode = $block[0];
    if (processedBlocks.has(blockNode)) return;
    processedBlocks.add(blockNode);

    const placeholderStr = extractPlaceholders(blockNode, $, tagMapGlobal, tagCounter);
    const subSegments = splitByPunctuation(placeholderStr);

    $block.empty();

    subSegments.forEach((subSeg) => {
      const segmentId = segmentIndex++;
      $block.append(`__SEG_${segmentId}__`);
      const { leading, body, trailing } = extractSegmentTags(subSeg);
      segments.push({
        id: segmentId,
        source: body,
        target: "",
        leading,
        trailing,
      });
    });
  });

  const htmlString = $.html();
  const templateData = {
    html: htmlString,
    tagMap: Array.from(tagMapGlobal.entries()),
  };
  const template = zlib
    .gzipSync(Buffer.from(JSON.stringify(templateData), "utf-8"))
    .toString("base64");
    
  return { segments, template };
};

const exportFile = async (templateBase64, segments) => {
  let html = "";
  let tagMapGlobal = new Map();

  try {
    const buffer = Buffer.from(templateBase64, "base64");
    const unzipped = zlib.gunzipSync(buffer).toString("utf-8");
    try {
      const templateData = JSON.parse(unzipped);
      html = templateData.html;
      tagMapGlobal = new Map(templateData.tagMap || []);
    } catch (e) {
      html = unzipped;
    }
  } catch (err) {
    html = templateBase64;
  }

  const segmentMap = new Map();
  segments.forEach((segment) => {
    // If the target is empty, fallback to source
    const targetText = (segment.leading || "") + (segment.target || segment.source) + (segment.trailing || "");
    // Restore the tags using the global tag map
    const restoredText = restorePlaceholders(targetText, tagMapGlobal);
    segmentMap.set(segment.id, restoredText);
  });

  html = html.replace(/__SEG_(\d+)__/g, (match, idStr) => {
    const id = parseInt(idStr, 10);
    if (segmentMap.has(id)) return segmentMap.get(id);
    return match;
  });

  return Buffer.from(html, "utf-8");
};

module.exports = { parseFile, exportFile };
