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
  "section", "article", "nav", "header", "footer", "figcaption", "address", "main",
  "ul", "ol", "table", "tbody", "thead", "tr", "dl", "dt", "dd", "form", "fieldset",
  "body", "html"
];

const isBlockNode = (node, $) => {
  if (node.type !== "tag") return false;
  const tagName = node.name.toLowerCase();
  if (BLOCK_TAGS.includes(tagName)) return true;
  
  let hasBlockDescendant = false;
  $(node).find("*").each((_, desc) => {
    if (BLOCK_TAGS.includes(desc.name.toLowerCase())) {
      hasBlockDescendant = true;
      return false;
    }
  });
  return hasBlockDescendant;
};

const wrapInlineSiblings = (element, $) => {
  $(element).children().each((_, child) => {
    wrapInlineSiblings(child, $);
  });

  const children = $(element).contents();
  let hasBlock = false;
  let hasInline = false;

  children.each((_, child) => {
    if (child.type === "text") {
      if ($(child).text().trim()) {
        hasInline = true;
      }
    } else if (child.type === "tag") {
      if (isBlockNode(child, $)) {
        hasBlock = true;
      } else if (!["script", "style", "noscript"].includes(child.name.toLowerCase())) {
        hasInline = true;
      }
    }
  });

  if (hasBlock && hasInline) {
    let currentGroup = [];
    
    children.each((_, child) => {
      const isBlock = child.type === "tag" && isBlockNode(child, $);
      const isWhitespaceText = child.type === "text" && !$(child).text().trim();
      const isIgnoredTag = child.type === "tag" && ["script", "style", "noscript"].includes(child.name.toLowerCase());

      if (isBlock || isIgnoredTag) {
        if (currentGroup.length > 0) {
          const wrapper = $("<div class='__temp-leaf-block__'></div>");
          $(currentGroup[0]).replaceWith(wrapper);
          currentGroup.forEach((node) => {
            wrapper.append(node);
          });
          currentGroup = [];
        }
      } else if (!isWhitespaceText) {
        currentGroup.push(child);
      }
    });

    if (currentGroup.length > 0) {
      const wrapper = $("<div class='__temp-leaf-block__'></div>");
      $(currentGroup[0]).replaceWith(wrapper);
      currentGroup.forEach((node) => {
        wrapper.append(node);
      });
    }
  }
};

const parseFile = async (filePath) => {
  const html = fs.readFileSync(filePath, "utf-8");
  const $ = cheerio.load(html, { decodeEntities: false });
  const segments = [];
  let segmentIndex = 0;

  const tagMapGlobal = new Map();
  const tagCounter = { value: 1 };

  // Preprocess body to wrap inline siblings in virtual leaf blocks
  if ($("body").length > 0) {
    wrapInlineSiblings($("body")[0], $);
  }

  // 1. Find all block elements in the document that contain non-empty text
  const blocks = [];
  const selectors = [...BLOCK_TAGS, ".__temp-leaf-block__"].join(",");
  $(selectors).each((_, el) => {
    // Check if this block contains any text (excluding scripts/styles)
    const clone = $(el).clone();
    clone.find(SKIP_SELECTOR).remove();
    const hasText = clone.text().trim().length > 0;
    if (hasText) {
      blocks.push(el);
    }
  });

  // 2. Filter to keep only the leaf-most blocks (blocks that do not contain any other block in the list)
  const leafTextBlocks = blocks.filter(block => {
    return !blocks.some(otherBlock => {
      if (otherBlock === block) return false;
      return $(block).find(otherBlock).length > 0;
    });
  });

  // 3. Process each leaf text block
  leafTextBlocks.forEach((blockNode) => {
    const placeholderStr = extractPlaceholders(blockNode, $, tagMapGlobal, tagCounter);
    const subSegments = splitByPunctuation(placeholderStr, tagMapGlobal);

    $(blockNode).empty();

    subSegments.forEach((subSeg) => {
      const segmentId = segmentIndex++;
      $(blockNode).append(`__SEG_${segmentId}__`);
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

  // Postprocess: unwrap virtual blocks
  const $ = cheerio.load(html, { decodeEntities: false });
  $(".__temp-leaf-block__").each((_, el) => {
    $(el).replaceWith($(el).contents());
  });

  return Buffer.from($.html(), "utf-8");
};

module.exports = { parseFile, exportFile };
