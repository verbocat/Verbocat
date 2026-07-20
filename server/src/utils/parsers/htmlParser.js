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
  "ul", "ol", "table", "tbody", "thead", "tfoot", "tr", "colgroup", "col", "caption",
  "dl", "dt", "dd", "form", "fieldset",
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

const getRawTags = (node, sourceHtml) => {
  if (node.startIndex === null || node.startIndex === undefined) {
    return null;
  }

  // Find the end of the opening tag starting from node.startIndex
  let openTagEnd = -1;
  let insideQuotes = false;
  let quoteChar = null;
  const len = sourceHtml.length;
  for (let k = node.startIndex + 1; k < len; k++) {
    const char = sourceHtml[k];
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
        openTagEnd = k;
        break;
      }
    }
  }

  if (openTagEnd === -1) return null;

  const openingTag = sourceHtml.substring(node.startIndex, openTagEnd + 1);
  const isSelfClosing = openingTag.trim().endsWith("/>");

  let closingTag = "";
  if (!isSelfClosing && node.endIndex !== null && node.endIndex !== undefined) {
    const tagName = node.name;
    const searchStartLimit = Math.max(node.startIndex, node.endIndex - (tagName ? tagName.length : 10) - 15);
    const subStr = sourceHtml.substring(searchStartLimit, node.endIndex + 1);
    const lastOpenIndexInSub = subStr.lastIndexOf("</");
    if (lastOpenIndexInSub !== -1) {
      const lastOpenIndex = searchStartLimit + lastOpenIndexInSub;
      if (lastOpenIndex >= openTagEnd) {
        closingTag = sourceHtml.substring(lastOpenIndex, node.endIndex + 1);
      }
    }
  }

  return { openingTag, closingTag };
};

const getBlockRange = (node, html) => {
  let startIndex = node.startIndex;
  let endIndex = node.endIndex;

  if (node.attribs && node.attribs.class && node.attribs.class.includes("__temp-leaf-block__")) {
    if (node.children && node.children.length > 0) {
      let firstChild = null;
      let lastChild = null;
      for (let i = 0; i < node.children.length; i++) {
        if (node.children[i].startIndex !== null && node.children[i].startIndex !== undefined) {
          firstChild = node.children[i];
          break;
        }
      }
      for (let i = node.children.length - 1; i >= 0; i--) {
        if (node.children[i].endIndex !== null && node.children[i].endIndex !== undefined) {
          lastChild = node.children[i];
          break;
        }
      }
      if (firstChild && lastChild) {
        startIndex = firstChild.startIndex;
        endIndex = lastChild.endIndex;
      }
    }
  }

  if (startIndex === null || startIndex === undefined || endIndex === null || endIndex === undefined) {
    return null;
  }

  const isVirtual = node.attribs && node.attribs.class && node.attribs.class.includes("__temp-leaf-block__");
  if (isVirtual) {
    return {
      start: startIndex,
      end: endIndex + 1
    };
  }

  let openTagEnd = -1;
  let insideQuotes = false;
  let quoteChar = null;
  const len = html.length;
  for (let k = startIndex + 1; k < len; k++) {
    const char = html[k];
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
        openTagEnd = k;
        break;
      }
    }
  }

  if (openTagEnd === -1) return null;

  let endTagStart = -1;
  const openingTag = html.substring(startIndex, openTagEnd + 1);
  const isSelfClosing = openingTag.trim().endsWith("/>");

  if (!isSelfClosing) {
    const tagName = node.name;
    const searchStartLimit = Math.max(startIndex, endIndex - (tagName ? tagName.length : 10) - 15);
    const subStr = html.substring(searchStartLimit, endIndex + 1);
    const lastOpenIndexInSub = subStr.lastIndexOf("</");
    if (lastOpenIndexInSub !== -1) {
      const lastOpenIndex = searchStartLimit + lastOpenIndexInSub;
      if (lastOpenIndex >= openTagEnd) {
        endTagStart = lastOpenIndex;
      }
    }
  }

  return {
    start: openTagEnd + 1,
    end: endTagStart === -1 ? openTagEnd + 1 : endTagStart
  };
};

const extractPlaceholdersRaw = (element, $, tagMap, tagCounter, sourceHtml) => {
  let str = "";
  $(element)
    .contents()
    .each((_, child) => {
      if (child.type === "text") {
        str += $(child).text().replace(/\s+/g, " ");
      } else if (child.type === "tag") {
        const id = tagCounter.value++;
        const raw = getRawTags(child, sourceHtml);
        const openingTag = raw ? raw.openingTag : "";
        const closingTag = raw ? raw.closingTag : "";

        tagMap.set(`<${id}>`, openingTag);
        tagMap.set(`</${id}>`, closingTag);

        str += `<${id}>`;
        str += extractPlaceholdersRaw(child, $, tagMap, tagCounter, sourceHtml);
        if (closingTag !== "") {
          str += `</${id}>`;
        }
      } else if (child.type === "comment") {
        const id = tagCounter.value++;
        if (child.startIndex !== null && child.endIndex !== null) {
          const rawComment = sourceHtml.substring(child.startIndex, child.endIndex + 1);
          tagMap.set(`<${id}>`, rawComment);
        } else {
          tagMap.set(`<${id}>`, `<!--${child.data}-->`);
        }
        tagMap.set(`</${id}>`, "");
        str += `<${id}></${id}>`;
      }
    });
  return str;
};

const parseFile = async (filePath) => {
  const html = fs.readFileSync(filePath, "utf-8");
  
  // We use _useHtmlParser2 to track character indices and perform raw template generation
  const $ = cheerio.load(html, {
    _useHtmlParser2: true,
    withStartIndices: true,
    withEndIndices: true,
    decodeEntities: false
  });
  const segments = [];
  let segmentIndex = 0;

  const tagMapGlobal = new Map();
  const tagCounter = { value: 1 };

  const { getLeafTextBlocks } = require("./relinkEngine");
  const leafTextBlocks = getLeafTextBlocks($);

  const replacements = [];
  leafTextBlocks.forEach((blockNode, blockIdx) => {
    const range = getBlockRange(blockNode, html);
    if (range) {
      const placeholderStr = extractPlaceholdersRaw(blockNode, $, tagMapGlobal, tagCounter, html);
      const subSegments = splitByPunctuation(placeholderStr, tagMapGlobal);

      let replacementPlaceholder = "";
      subSegments.forEach((subSeg) => {
        const segmentId = segmentIndex++;
        replacementPlaceholder += `__SEG_${segmentId}__`;
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

      replacements.push({
        start: range.start,
        end: range.end,
        text: replacementPlaceholder
      });
    }
  });

  // Perform segment replacements in reverse order of indices to avoid index shifting
  replacements.sort((a, b) => b.start - a.start);
  let templateHtml = html;
  replacements.forEach((rep) => {
    templateHtml = templateHtml.substring(0, rep.start) + rep.text + templateHtml.substring(rep.end);
  });

  const templateData = {
    html: templateHtml,
    tagMap: Array.from(tagMapGlobal.entries()),
    segmentTags: segments.map(seg => ({ id: seg.id, leading: seg.leading, trailing: seg.trailing })),
    isXml: false
  };
  const template = zlib
    .gzipSync(Buffer.from(JSON.stringify(templateData), "utf-8"))
    .toString("base64");
    
  return { segments, template };
};

const escapeRawAmpersands = (str) => {
  if (typeof str !== "string") return str;
  return str.replace(/&(?!(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/gi, "&amp;");
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

    // Escape raw ampersands inside translation text (excluding tag placeholders)
    rawTarget = escapeRawAmpersands(rawTarget);

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

  // Backward compatibility: Remove temporary data-relink-table-id attributes if present
  html = html.replace(/\s*data-relink-table-id="[^"]*"/g, "");

  // Backward compatibility: Unwrap virtual __temp-leaf-block__ div wrappers if present
  let prev;
  let guard = 0;
  do {
    prev = html;
    html = html.replace(/<div\s+class=["']__temp-leaf-block__["']\s*>([\s\S]*?)<\/div>/g, "$1");
    guard++;
  } while (html !== prev && guard < 10);

  return Buffer.from(html, "utf-8");
};

module.exports = { parseFile, exportFile };
