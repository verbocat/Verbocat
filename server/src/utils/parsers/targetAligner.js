const fs = require("fs");
const cheerio = require("cheerio");
const zlib = require("zlib");
const { extractPlaceholders } = require("./segmentationUtils");
const { alignSegmentTags } = require("../tagProtection");

const BLOCK_TAGS = [
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "blockquote", 
  "section", "article", "nav", "header", "footer", "figcaption", "address", "main",
  "ul", "ol", "table", "tbody", "thead", "tr", "dl", "dt", "dd", "form", "fieldset",
  "body", "html"
];

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
      const isBlock = BLOCK_TAGS.includes(child.name.toLowerCase()) || 
        (child.attribs && child.attribs.class && child.attribs.class.includes("__temp-leaf-block__"));
      if (isBlock) {
        hasBlock = true;
      } else if (!["script", "style", "noscript"].includes(child.name.toLowerCase())) {
        hasInline = true;
      }
    }
  });

  if (hasBlock && hasInline) {
    let currentGroup = [];
    
    children.each((_, child) => {
      const isBlock = child.type === "tag" && (
        BLOCK_TAGS.includes(child.name.toLowerCase()) || 
        (child.attribs && child.attribs.class && child.attribs.class.includes("__temp-leaf-block__"))
      );
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

const getLeafTextBlocks = ($) => {
  if ($("body").length > 0) {
    wrapInlineSiblings($("body")[0], $);
  }

  const leafTextBlocks = [];
  const traverse = (node) => {
    if (!node) return false;
    if (node.type === "tag") {
      const tagName = node.name.toLowerCase();
      if (["script", "style", "noscript", "svg", "canvas"].includes(tagName)) {
        return false;
      }
    }
    if (node.type === "text") {
      return node.data.trim().length > 0;
    }
    let hasText = false;
    let hasDescendantBlock = false;
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const isChildBlock = child.type === "tag" && 
          (BLOCK_TAGS.includes(child.name.toLowerCase()) || 
           (child.attribs && child.attribs.class && child.attribs.class.includes("__temp-leaf-block__")));
        const childHasText = traverse(child);
        if (childHasText) hasText = true;
        if (isChildBlock && childHasText) hasDescendantBlock = true;
      }
    }
    const isThisBlock = node.type === "tag" && 
      (BLOCK_TAGS.includes(node.name.toLowerCase()) || 
       (node.attribs && node.attribs.class && node.attribs.class.includes("__temp-leaf-block__")));
    if (isThisBlock && hasText && !hasDescendantBlock) {
      leafTextBlocks.push(node);
    }
    return hasText;
  };

  if ($("body").length > 0) {
    traverse($("body")[0]);
  } else {
    traverse($.root()[0]);
  }
  return leafTextBlocks;
};

function createPureTextMapping(targetPlaceholderStr) {
  let pureText = "";
  const pureToRawPos = [];
  let i = 0;

  while (i < targetPlaceholderStr.length) {
    if (targetPlaceholderStr[i] === '<') {
      const closingIdx = targetPlaceholderStr.indexOf('>', i);
      if (closingIdx !== -1) {
        i = closingIdx + 1;
        continue;
      }
    }
    pureToRawPos.push(i);
    pureText += targetPlaceholderStr[i];
    i++;
  }
  pureToRawPos.push(targetPlaceholderStr.length);

  return { pureText, pureToRawPos };
}

/**
 * 100% Language-Agnostic Segment Partitioner.
 * Zero hardcoded punctuation regexes.
 * Uses Tag Fingerprint Anchoring and Source-Relative Length Weight Ratios.
 */
function splitTargetBlockToN(targetPlaceholderStr, N, sourceSubSegments, targetTagMap, sourceTagMap) {
  if (!targetPlaceholderStr || targetPlaceholderStr.trim().length === 0) {
    return Array(N).fill("");
  }

  if (N <= 1) {
    let text = targetPlaceholderStr.trim();
    if (sourceTagMap && targetTagMap && sourceSubSegments[0]) {
      text = alignSegmentTags(sourceSubSegments[0].source_text || "", text, sourceTagMap, targetTagMap);
    }
    return [text];
  }

  const { pureText, pureToRawPos } = createPureTextMapping(targetPlaceholderStr);

  const sourceWeights = sourceSubSegments.map(s => {
    const text = (s.source_text || "").replace(/<\/?\d+>/g, "").trim();
    return Math.max(1, text.length);
  });
  const totalSourceLen = sourceWeights.reduce((a, b) => a + b, 0);

  const pureSplitIndices = [];
  let accumulatedRatio = 0;

  for (let k = 0; k < N - 1; k++) {
    const ratio = sourceWeights[k] / totalSourceLen;
    accumulatedRatio += ratio;

    const pureIdx = Math.min(pureText.length - 1, Math.max(1, Math.round(pureText.length * accumulatedRatio)));
    pureSplitIndices.push(pureIdx);
  }

  const rawSplitIndices = pureSplitIndices.map(pIdx => {
    let rawIdx = pureToRawPos[Math.min(pIdx, pureToRawPos.length - 1)];
    const trailingTagRegex = /^(\s*<\/\d+>)+/;
    const remainder = targetPlaceholderStr.slice(rawIdx);
    const match = remainder.match(trailingTagRegex);
    if (match) {
      rawIdx += match[0].length;
    }
    return rawIdx;
  });

  const rawSegments = [];
  let startRawIdx = 0;
  for (let k = 0; k < N; k++) {
    const endRawIdx = (k < N - 1) ? rawSplitIndices[k] : targetPlaceholderStr.length;
    const segStr = targetPlaceholderStr.slice(startRawIdx, endRawIdx).trim();
    rawSegments.push(segStr);
    startRawIdx = endRawIdx;
  }

  return rawSegments.map((segText, idx) => {
    if (sourceTagMap && targetTagMap && sourceSubSegments[idx]) {
      return alignSegmentTags(sourceSubSegments[idx].source_text || "", segText, sourceTagMap, targetTagMap);
    }
    return segText;
  });
}

/**
 * Main entry point to align uploaded target HTML to source segments
 */
async function alignTargetHtmlToSource(targetFilePath, templateHtml, sourceTagMap, sourceSegments, sourceSegmentToBlockMap) {
  const targetHtmlContent = fs.readFileSync(targetFilePath, "utf-8");
  const $target = cheerio.load(targetHtmlContent, { decodeEntities: false });
  const targetTagMap = new Map();
  const tagCounter = { value: 1 };

  const targetLeafBlocks = getLeafTextBlocks($target);
  const targetBlockPlaceholders = targetLeafBlocks.map(blockNode => {
    return extractPlaceholders(blockNode, $target, targetTagMap, tagCounter);
  });

  const sourceGroups = {};
  sourceSegments.forEach(seg => {
    const blockIdx = sourceSegmentToBlockMap[seg.segment_index];
    if (blockIdx !== undefined) {
      if (!sourceGroups[blockIdx]) {
        sourceGroups[blockIdx] = [];
      }
      sourceGroups[blockIdx].push(seg);
    }
  });

  const alignedMap = new Map();

  Object.keys(sourceGroups).forEach(blockIdxStr => {
    const blockIdx = parseInt(blockIdxStr, 10);
    const blockSourceSegs = sourceGroups[blockIdx] || [];
    const N = blockSourceSegs.length;
    const targetPlaceholderStr = targetBlockPlaceholders[blockIdx] || "";

    const splitTargetSegs = splitTargetBlockToN(targetPlaceholderStr, N, blockSourceSegs, targetTagMap, sourceTagMap);

    blockSourceSegs.forEach((srcSeg, idx) => {
      alignedMap.set(srcSeg.segment_index, splitTargetSegs[idx] || "");
    });
  });

  return alignedMap;
}

module.exports = {
  alignTargetHtmlToSource,
  splitTargetBlockToN,
  getLeafTextBlocks,
  createPureTextMapping
};
