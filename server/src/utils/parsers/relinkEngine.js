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

// Wrap inline sibling nodes inside virtual leaf block wrappers
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

// Extracts leaf text blocks from DOM
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

// Creates pure-text mapping to prevent splitting inside tag placeholders
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
 * Projects 100% of English Source tags onto target translated text.
 * Guarantees that every opening/closing tag from English Source is present in target.
 */
function projectSourceTagsOntoTarget(sourceText, targetText) {
  if (!sourceText) return targetText || "";
  
  const sourceTags = sourceText.match(/<\/?\d+>/g);
  if (!sourceTags || sourceTags.length === 0) {
    return (targetText || "").replace(/<[^>]+>/g, "").trim();
  }

  // Check if target text already has all source tags present
  const targetTagMatches = (targetText || "").match(/<\/?\d+>/g) || [];
  const missingSourceTags = sourceTags.filter(t => !targetTagMatches.includes(t));
  if (missingSourceTags.length === 0 && targetTagMatches.length === sourceTags.length) {
    return targetText; // All tags present
  }

  const cleanTarget = (targetText || "").replace(/<[^>]+>/g, "").trim();
  if (!cleanTarget) return sourceText;

  const { pureText: pureSource } = createPureTextMapping(sourceText);
  const pureSourceLen = Math.max(1, pureSource.length);

  const tagSpecs = [];
  const tagRegex = /<\/?\d+>/g;
  let match;
  let pureOffset = 0;
  let lastRawIdx = 0;

  while ((match = tagRegex.exec(sourceText)) !== null) {
    const rawIdx = match.index;
    const textBefore = sourceText.slice(lastRawIdx, rawIdx).replace(/<\/?\d+>/g, "");
    pureOffset += textBefore.length;
    lastRawIdx = rawIdx + match[0].length;

    tagSpecs.push({
      tag: match[0],
      ratio: pureOffset / pureSourceLen
    });
  }

  const targetLen = cleanTarget.length;
  const targetTagPositions = tagSpecs.map(spec => {
    let pIdx = Math.round(targetLen * spec.ratio);
    pIdx = Math.max(0, Math.min(targetLen, pIdx));

    if (pIdx > 0 && pIdx < targetLen) {
      const nextSpace = cleanTarget.indexOf(" ", pIdx);
      const prevSpace = cleanTarget.lastIndexOf(" ", pIdx);
      if (nextSpace !== -1 && (nextSpace - pIdx) <= 4) {
        pIdx = nextSpace;
      } else if (prevSpace !== -1 && (pIdx - prevSpace) <= 4) {
        pIdx = prevSpace + 1;
      }
    }

    return {
      tag: spec.tag,
      pos: pIdx
    };
  });

  targetTagPositions.sort((a, b) => b.pos - a.pos);

  let resultTarget = cleanTarget;
  targetTagPositions.forEach(item => {
    resultTarget = resultTarget.slice(0, item.pos) + item.tag + resultTarget.slice(item.pos);
  });

  return resultTarget;
}

/**
 * 100% Language-Agnostic Segment Partitioner with Source Tag Projection.
 */
function alignBlockTargetToSourceN(targetPlaceholderStr, sourceSubSegments, targetTagMap, sourceTagMap) {
  const N = sourceSubSegments.length;
  if (!targetPlaceholderStr || targetPlaceholderStr.trim().length === 0) {
    return sourceSubSegments.map(s => projectSourceTagsOntoTarget(s.source || "", ""));
  }

  if (N <= 1) {
    let text = targetPlaceholderStr.trim();
    const srcText = sourceSubSegments[0] ? (sourceSubSegments[0].source || "") : "";
    if (sourceTagMap && targetTagMap && srcText) {
      text = alignSegmentTags(srcText, text, sourceTagMap, targetTagMap);
    }
    return [projectSourceTagsOntoTarget(srcText, text)];
  }

  const { pureText, pureToRawPos } = createPureTextMapping(targetPlaceholderStr);

  const sourceWeights = sourceSubSegments.map(s => {
    const cleanText = (s.source || "").replace(/<\/?\d+>/g, "").trim();
    return Math.max(1, cleanText.length);
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

  // Re-align tag placeholders and force project English source tags
  return rawSegments.map((segText, idx) => {
    const sourceSeg = sourceSubSegments[idx];
    const srcText = sourceSeg ? (sourceSeg.source || "") : "";
    let alignedTarget = segText;
    if (sourceTagMap && targetTagMap && srcText) {
      alignedTarget = alignSegmentTags(srcText, segText, sourceTagMap, targetTagMap);
    }
    return projectSourceTagsOntoTarget(srcText, alignedTarget);
  });
}

/**
 * Main process function for dual source & target HTML file relinking
 */
async function processRelinkDualFiles(sourceFilePath, targetFilePath) {
  const htmlParser = require("./htmlParser");
  
  // 1. Parse source file
  const sourceResult = await htmlParser.parseFile(sourceFilePath);
  const sourceSegments = sourceResult.segments || [];

  // 2. Parse target file DOM
  const targetHtmlContent = fs.readFileSync(targetFilePath, "utf-8");
  const $target = cheerio.load(targetHtmlContent, { decodeEntities: false });
  const targetTagMap = new Map();
  const tagCounter = { value: 1 };

  const targetLeafBlocks = getLeafTextBlocks($target);
  const targetBlockPlaceholders = targetLeafBlocks.map(blockNode => {
    return extractPlaceholders(blockNode, $target, targetTagMap, tagCounter);
  });

  // Decode source tag map
  let sourceTagMap = new Map();
  try {
    const buffer = Buffer.from(sourceResult.template, "base64");
    const unzipped = zlib.gunzipSync(buffer).toString("utf-8");
    const templateData = JSON.parse(unzipped);
    sourceTagMap = new Map(templateData.tagMap || []);
  } catch (e) {
    console.error("Failed to decode source tag map:", e);
  }

  // Group source segments by block index
  const sourceGroups = {};
  sourceSegments.forEach(seg => {
    const bIdx = seg.blockIndex !== undefined ? seg.blockIndex : 0;
    if (!sourceGroups[bIdx]) {
      sourceGroups[bIdx] = [];
    }
    sourceGroups[bIdx].push(seg);
  });

  // Perform multi-strategy alignment per leaf block
  const alignedSegments = [];

  sourceSegments.forEach(srcSeg => {
    const bIdx = srcSeg.blockIndex !== undefined ? srcSeg.blockIndex : 0;
    const blockSourceSegs = sourceGroups[bIdx] || [srcSeg];
    const targetPlaceholderStr = targetBlockPlaceholders[bIdx] || "";

    const relativeIdx = blockSourceSegs.findIndex(s => s.id === srcSeg.id);
    const splitTargetSegs = alignBlockTargetToSourceN(targetPlaceholderStr, blockSourceSegs, targetTagMap, sourceTagMap);

    const targetText = splitTargetSegs[relativeIdx >= 0 ? relativeIdx : 0] || "";

    alignedSegments.push({
      id: srcSeg.id + 1,
      source: srcSeg.source,
      target: targetText,
      leading: srcSeg.leading || "",
      trailing: srcSeg.trailing || "",
      status: targetText ? "translated" : "draft",
      verified: !!targetText
    });
  });

  return {
    segments: alignedSegments,
    template: sourceResult.template,
    count: alignedSegments.length
  };
}

module.exports = {
  processRelinkDualFiles,
  alignBlockTargetToSourceN,
  getLeafTextBlocks,
  createPureTextMapping,
  projectSourceTagsOntoTarget
};
