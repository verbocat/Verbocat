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
 * Projects 100% of English Source tags onto target translated text.
 */
function projectSourceTagsOntoTarget(sourceText, targetText) {
  if (!sourceText) return targetText || "";
  
  const sourceTags = sourceText.match(/<\/?\d+>/g);
  if (!sourceTags || sourceTags.length === 0) {
    return (targetText || "").replace(/<[^>]+>/g, "").trim();
  }

  const targetTagMatches = (targetText || "").match(/<\/?\d+>/g) || [];
  const missingSourceTags = sourceTags.filter(t => !targetTagMatches.includes(t));
  if (missingSourceTags.length === 0 && targetTagMatches.length === sourceTags.length) {
    return targetText;
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

  let tagIndex = 0;
  while ((match = tagRegex.exec(sourceText)) !== null) {
    const rawIdx = match.index;
    const textBefore = sourceText.slice(lastRawIdx, rawIdx).replace(/<\/?\d+>/g, "");
    pureOffset += textBefore.length;
    lastRawIdx = rawIdx + match[0].length;

    tagSpecs.push({
      tag: match[0],
      ratio: pureOffset / pureSourceLen,
      order: tagIndex++
    });
  }

  const targetLen = cleanTarget.length;

  const isInsideWord = (str, idx) => {
    if (idx <= 0 || idx >= str.length) return false;
    const prevChar = str[idx - 1];
    const nextChar = str[idx];
    return !/\s/.test(prevChar) && !/\s/.test(nextChar);
  };

  const targetTagPositions = tagSpecs.map(spec => {
    let pIdx = Math.round(targetLen * spec.ratio);
    pIdx = Math.max(0, Math.min(targetLen, pIdx));

    if (isInsideWord(cleanTarget, pIdx)) {
      const nextSpace = cleanTarget.indexOf(" ", pIdx);
      const prevSpace = cleanTarget.lastIndexOf(" ", pIdx);
      if (nextSpace !== -1 && (prevSpace === -1 || (nextSpace - pIdx) <= (pIdx - prevSpace))) {
        pIdx = nextSpace;
      } else if (prevSpace !== -1) {
        pIdx = prevSpace + 1;
      }
    }

    return {
      tag: spec.tag,
      pos: pIdx,
      order: spec.order
    };
  });

  // Position descending (right to left); for equal positions, order descending (so earlier source tags insert after later source tags at same index, preserving left-to-right order)
  targetTagPositions.sort((a, b) => (b.pos - a.pos) || (b.order - a.order));

  let resultTarget = cleanTarget;
  targetTagPositions.forEach(item => {
    resultTarget = resultTarget.slice(0, item.pos) + item.tag + resultTarget.slice(item.pos);
  });

  return resultTarget;
}

function splitTargetBySentence(str) {
  const sentences = [];
  const regex = /([^.!?।॥]+[.!?।॥]+(?:\s+|$))/g;
  let match;
  let lastIdx = 0;
  while ((match = regex.exec(str)) !== null) {
    sentences.push(match[0].trim());
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < str.length) {
    const rem = str.slice(lastIdx).trim();
    if (rem) sentences.push(rem);
  }
  return sentences.length ? sentences : [str];
}

/**
 * 100% Language-Agnostic Segment Partitioner with Sentence-Aware Partitioning and Source Tag Projection.
 */
function splitTargetBlockToN(targetPlaceholderStr, N, sourceSubSegments, targetTagMap, sourceTagMap) {
  if (!targetPlaceholderStr || targetPlaceholderStr.trim().length === 0) {
    return sourceSubSegments.map(s => projectSourceTagsOntoTarget(s.source_text || "", ""));
  }

  if (N <= 1) {
    let text = targetPlaceholderStr.trim();
    const srcText = sourceSubSegments[0] ? (sourceSubSegments[0].source_text || "") : "";
    if (sourceTagMap && targetTagMap && srcText) {
      text = alignSegmentTags(srcText, text, sourceTagMap, targetTagMap);
    }
    return [projectSourceTagsOntoTarget(srcText, text)];
  }

  const targetSentences = splitTargetBySentence(targetPlaceholderStr);
  let rawSegments = [];

  if (targetSentences.length === N) {
    rawSegments = targetSentences;
  } else if (targetSentences.length > 1) {
    const srcWeights = sourceSubSegments.map(s => Math.max(1, (s.source_text || "").replace(/<[^>]+>/g, "").trim().length));
    const totalSrcLen = srcWeights.reduce((a, b) => a + b, 0);
    const totalTgtLen = targetSentences.reduce((a, s) => a + s.length, 0);

    let tgtIdx = 0;
    for (let k = 0; k < N; k++) {
      if (k === N - 1) {
        rawSegments.push(targetSentences.slice(tgtIdx).join(" "));
        break;
      }
      const srcRatio = srcWeights[k] / totalSrcLen;
      let accRatio = 0;
      let takeCount = 1;
      for (let j = tgtIdx; j < targetSentences.length - (N - 1 - k); j++) {
        accRatio += targetSentences[j].length / totalTgtLen;
        if (accRatio >= srcRatio) break;
        takeCount++;
      }
      rawSegments.push(targetSentences.slice(tgtIdx, tgtIdx + takeCount).join(" "));
      tgtIdx += takeCount;
    }
  } else {
    const { pureText, pureToRawPos } = createPureTextMapping(targetPlaceholderStr);
    const sourceWeights = sourceSubSegments.map(s => Math.max(1, (s.source_text || "").replace(/<\/?\d+>/g, "").trim().length));
    const totalSourceLen = sourceWeights.reduce((a, b) => a + b, 0);

    const pureSplitIndices = [];
    let accumulatedRatio = 0;
    for (let k = 0; k < N - 1; k++) {
      accumulatedRatio += sourceWeights[k] / totalSourceLen;
      const pureIdx = Math.min(pureText.length - 1, Math.max(1, Math.round(pureText.length * accumulatedRatio)));
      pureSplitIndices.push(pureIdx);
    }

    const rawSplitIndices = pureSplitIndices.map(pIdx => {
      let rawIdx = pureToRawPos[Math.min(pIdx, pureToRawPos.length - 1)];
      const trailingTagRegex = /^(\s*<\/\d+>)+/;
      const remainder = targetPlaceholderStr.slice(rawIdx);
      const m = remainder.match(trailingTagRegex);
      if (m) rawIdx += m[0].length;
      return rawIdx;
    });

    let startRawIdx = 0;
    for (let k = 0; k < N; k++) {
      const endRawIdx = (k < N - 1) ? rawSplitIndices[k] : targetPlaceholderStr.length;
      rawSegments.push(targetPlaceholderStr.slice(startRawIdx, endRawIdx).trim());
      startRawIdx = endRawIdx;
    }
  }

  return rawSegments.map((segText, idx) => {
    const sourceSeg = sourceSubSegments[idx];
    const srcText = sourceSeg ? (sourceSeg.source_text || "") : "";
    let alignedTarget = segText;
    if (sourceTagMap && targetTagMap && srcText) {
      alignedTarget = alignSegmentTags(srcText, segText, sourceTagMap, targetTagMap);
    }
    return projectSourceTagsOntoTarget(srcText, alignedTarget);
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

  $target("table").each((idx, el) => {
    $target(el).attr("data-relink-table-id", String(idx));
  });

  const targetLeafBlocks = getLeafTextBlocks($target);
  const targetBlockTableIds = targetLeafBlocks.map(b => $target(b).closest("table").attr("data-relink-table-id"));
  const targetBlockPlaceholders = targetLeafBlocks.map(blockNode => {
    return extractPlaceholders(blockNode, $target, targetTagMap, tagCounter);
  });

  const sourceGroups = {};
  sourceSegments.forEach(seg => {
    const blockIdx = sourceSegmentToBlockMap[seg.segment_index] !== undefined ? sourceSegmentToBlockMap[seg.segment_index] : 0;
    if (!sourceGroups[blockIdx]) {
      sourceGroups[blockIdx] = [];
    }
    sourceGroups[blockIdx].push(seg);
  });

  const sourceBlockIndices = Object.keys(sourceGroups).map(Number).sort((a, b) => a - b);
  const matchedTargetPlaceholders = {};
  let targetCursor = 0;
  const numTargetBlocks = targetBlockPlaceholders.length;

  sourceBlockIndices.forEach(bIdx => {
    const blockSourceSegs = sourceGroups[bIdx] || [];
    const sourceBlockText = blockSourceSegs.map(s => s.source_text || "").join(" ").trim();
    const srcClean = sourceBlockText.replace(/<\/?\d+>/g, "").trim();
    const isPureSymbol = /^[\s_\-—.*:;|=+]*$/.test(srcClean) && srcClean.length > 0;
    
    while (targetCursor < numTargetBlocks - 1) {
      const candidateText = targetBlockPlaceholders[targetCursor] || "";
      const prevText = targetCursor > 0 ? (targetBlockPlaceholders[targetCursor - 1] || "") : "";
      const candClean = candidateText.replace(/<\/?\d+>/g, "").trim();

      if (bIdx > 0 && candidateText.length > 5 && prevText.length > 5 && candidateText.replace(/\s+/g, "") === prevText.replace(/\s+/g, "")) {
        targetCursor++;
        continue;
      }
      if (/^\d+$/.test(srcClean) && candClean.length > 10 && !/^\d+$/.test(candClean)) {
        targetCursor++;
        continue;
      }

      if (isPureSymbol && candClean.length > 0 && !/^[\s_\-—.*:;|=+]*$/.test(candClean)) {
        let foundSymbolAhead = -1;
        for (let look = targetCursor; look < Math.min(numTargetBlocks, targetCursor + 5); look++) {
          const aheadClean = (targetBlockPlaceholders[look] || "").replace(/<\/?\d+>/g, "").trim();
          if (/^[\s_\-—.*:;|=+]*$/.test(aheadClean) && aheadClean.length > 0) {
            foundSymbolAhead = look;
            break;
          }
        }
        if (foundSymbolAhead !== -1) {
          targetCursor = foundSymbolAhead;
        } else {
          matchedTargetPlaceholders[bIdx] = sourceBlockText;
          return;
        }
      }
      break;
    }

    matchedTargetPlaceholders[bIdx] = targetBlockPlaceholders[targetCursor] || sourceBlockText;
    targetCursor++;
  });

  const alignedMap = new Map();

  sourceBlockIndices.forEach(bIdx => {
    const blockSourceSegs = sourceGroups[bIdx] || [];
    const N = blockSourceSegs.length;
    const targetPlaceholderStr = matchedTargetPlaceholders[bIdx] || "";

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
  createPureTextMapping,
  projectSourceTagsOntoTarget
};
