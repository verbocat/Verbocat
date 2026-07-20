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

const isValidXml = (str) => {
  if (!str || typeof str !== "string") return false;

  const stack = [];
  let i = 0;
  const len = str.length;

  while (i < len) {
    const nextTag = str.indexOf("<", i);
    if (nextTag === -1) {
      break;
    }
    i = nextTag;

    // CDATA
    if (str.startsWith("<![CDATA[", i)) {
      const closeCdata = str.indexOf("]]>", i + 9);
      if (closeCdata === -1) return false;
      i = closeCdata + 3;
      continue;
    }

    // Comment
    if (str.startsWith("<!--", i)) {
      const closeComment = str.indexOf("-->", i + 4);
      if (closeComment === -1) return false;
      i = closeComment + 3;
      continue;
    }

    // Processing instruction / XML declaration
    if (str.startsWith("<?", i)) {
      const closePI = str.indexOf("?>", i + 2);
      if (closePI === -1) return false;
      i = closePI + 2;
      continue;
    }

    // Doctype
    if (str.startsWith("<!", i)) {
      const closeDoc = str.indexOf(">", i + 2);
      if (closeDoc === -1) return false;
      i = closeDoc + 1;
      continue;
    }

    // Tag: find close tag, ignoring '>' inside quotes
    let closeTag = -1;
    let insideQuotes = false;
    let quoteChar = null;
    for (let k = i + 1; k < len; k++) {
      const char = str[k];
      if (insideQuotes) {
        if (char === quoteChar) {
          insideQuotes = false;
          quoteChar = null;
        }
      } else {
        if (char === '"' || char === "'") {
          insideQuotes = true;
          quoteChar = char;
        } else if (char === ">") {
          closeTag = k;
          break;
        }
      }
    }

    if (closeTag === -1) return false;

    let tagContent = str.slice(i + 1, closeTag).trim();
    i = closeTag + 1;

    // Self-closing tag
    if (tagContent.endsWith("/")) {
      tagContent = tagContent.slice(0, -1).trim();
      const tagNameMatch = tagContent.match(/^([a-zA-Z0-9:-]+)/);
      if (!tagNameMatch) return false;
      continue;
    }

    // End tag
    if (tagContent.startsWith("/")) {
      const tagName = tagContent.slice(1).trim();
      if (stack.length === 0) return false;
      const lastOpen = stack.pop();
      if (lastOpen !== tagName) return false;
      continue;
    }

    // Start tag
    const tagNameMatch = tagContent.match(/^([a-zA-Z0-9:-]+)/);
    if (!tagNameMatch) return false;
    const tagName = tagNameMatch[1];

    stack.push(tagName);
  }

  return stack.length === 0;
};

const parseFile = async (filePath) => {
  const html = fs.readFileSync(filePath, "utf-8");
  const isXml = isValidXml(html);
  const $ = cheerio.load(html, isXml ? { xmlMode: true, decodeEntities: false } : { decodeEntities: false });
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

  const htmlString = isXml ? $.xml() : $.html();
  const templateData = {
    html: htmlString,
    tagMap: Array.from(tagMapGlobal.entries()),
    segmentTags: segments.map(seg => ({ id: seg.id, leading: seg.leading, trailing: seg.trailing })),
    isXml: isXml
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
  let isXml = false;

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
        isXml = !!templateData.isXml;
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
  const $ = cheerio.load(html, isXml ? { xmlMode: true, decodeEntities: false } : { decodeEntities: false });
  $("*").removeAttr("data-relink-table-id");
  let guard = 0;
  while ($(".__temp-leaf-block__").length > 0 && guard < 10) {
    $(".__temp-leaf-block__").each((_, el) => {
      $(el).replaceWith($(el).contents());
    });
    guard++;
  }

  return Buffer.from(isXml ? $.xml() : $.html(), "utf-8");
};

module.exports = { parseFile, exportFile };
