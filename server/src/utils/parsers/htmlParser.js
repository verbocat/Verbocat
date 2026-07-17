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

const isBlockNode = (node) => {
  if (!node || node.type !== "tag") return false;
  if (node._isBlockNodeCached !== undefined) return node._isBlockNodeCached;

  const tagName = node.name.toLowerCase();
  if (BLOCK_TAGS.includes(tagName)) {
    node._isBlockNodeCached = true;
    return true;
  }
  
  let hasBlockDescendant = false;
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.type === "tag" && isBlockNode(child)) {
        hasBlockDescendant = true;
        break;
      }
    }
  }

  node._isBlockNodeCached = hasBlockDescendant;
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
      if (isBlockNode(child)) {
        hasBlock = true;
      } else if (!["script", "style", "noscript"].includes(child.name.toLowerCase())) {
        hasInline = true;
      }
    }
  });

  if (hasBlock && hasInline) {
    let currentGroup = [];
    
    children.each((_, child) => {
      const isBlock = child.type === "tag" && isBlockNode(child);
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

  const { getLeafTextBlocks } = require("./relinkEngine");
  const leafTextBlocks = getLeafTextBlocks($);

  // 3. Process each leaf text block
  leafTextBlocks.forEach((blockNode, blockIdx) => {
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
        blockIndex: blockIdx
      });
    });
  });

  const htmlString = $.html();
  const templateData = {
    html: htmlString,
    tagMap: Array.from(tagMapGlobal.entries()),
    segmentTags: segments.map(seg => ({ id: seg.id, leading: seg.leading, trailing: seg.trailing }))
  };
  const template = zlib
    .gzipSync(Buffer.from(JSON.stringify(templateData), "utf-8"))
    .toString("base64");
    
  return { segments, template };
};

const exportFile = async (templateBase64, segments) => {
  let html = "";
  let tagMapGlobal = new Map();
  let segmentTagsMap = new Map();

  try {
    const buffer = Buffer.from(templateBase64, "base64");
    const unzipped = zlib.gunzipSync(buffer).toString("utf-8");
    try {
      const templateData = JSON.parse(unzipped);
      // Guard: if this JSON doesn't contain an 'html' key it's a non-HTML template
      // (e.g. a PDF template routed here by mistake) — treat the raw string as HTML.
      if (templateData.html !== undefined) {
        html = templateData.html;
        tagMapGlobal = new Map(templateData.tagMap || []);
        segmentTagsMap = new Map((templateData.segmentTags || []).map(t => [t.id, t]));
      } else {
        html = unzipped;
      }
    } catch (e) {
      html = unzipped;
    }
  } catch (err) {
    html = templateBase64;
  }

  const segmentMap = new Map();
  segments.forEach((segment) => {
    const savedTags = segmentTagsMap.get(segment.id) || {};
    const leading = savedTags.leading || segment.leading || "";
    const trailing = savedTags.trailing || segment.trailing || "";
    
    let rawTarget = (segment.target !== undefined && segment.target !== null && segment.target.trim() !== "") 
      ? segment.target.trim() 
      : (segment.source || "");

    // Guard against double-tagging: strip leading/trailing tags if rawTarget already has them
    if (leading && rawTarget.startsWith(leading.trim())) {
      rawTarget = rawTarget.slice(leading.trim().length).trim();
    }
    if (trailing && rawTarget.endsWith(trailing.trim())) {
      rawTarget = rawTarget.slice(0, rawTarget.length - trailing.trim().length).trim();
    }

    const fullTarget = leading + rawTarget + trailing;
    // Restore the tags using the global tag map
    const restoredText = restorePlaceholders(fullTarget, tagMapGlobal);
    segmentMap.set(segment.id, restoredText);
  });

  html = html.replace(/__SEG_(\d+)__/g, (match, idStr) => {
    const id = parseInt(idStr, 10);
    if (segmentMap.has(id)) return segmentMap.get(id);
    return match;
  });

  // Postprocess: unwrap virtual blocks completely and strip temporary relink attributes
  const $ = cheerio.load(html, { decodeEntities: false });
  $("*").removeAttr("data-relink-table-id");
  let guard = 0;
  while ($(".__temp-leaf-block__").length > 0 && guard < 10) {
    $(".__temp-leaf-block__").each((_, el) => {
      $(el).replaceWith($(el).contents());
    });
    guard++;
  }

  return Buffer.from($.html(), "utf-8");
};

module.exports = { parseFile, exportFile };
