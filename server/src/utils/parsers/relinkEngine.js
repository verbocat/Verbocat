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

// Extracts leaf text blocks from DOM with Table-ID tagging
const getLeafTextBlocks = ($) => {
  $("table").each((idx, el) => {
    $(el).attr("data-relink-table-id", String(idx));
  });

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
      node.tableId = $(node).closest("table").attr("data-relink-table-id");
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
 * Projects 100% of English Source tags onto target translated text with Word-Boundary Snap Protection.
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

const KEYWORD_MAP = [
  { src: /annex\s*[a-c]/i, tgt: /अनुलग्नक|विवरण/i },
  { src: /computation of apr|apr/i, tgt: /apr\s*गणना|वार्षिक प्रतिशत दर/i },
  { src: /sr\.?\s*no\.?/i, tgt: /क्रमांक|क्र\.?\s*सं\.?|क्रम/i },
  { src: /parameter/i, tgt: /ब्योरा|विवरण/i },
  { src: /sanctioned loan amount/i, tgt: /स्वीकृत लोन/i },
  { src: /loan term/i, tgt: /लोन\s*अवधि|लोन\s*टर्म/i },
  { src: /rate of interest/i, tgt: /ब्याज\s*दर/i },
  { src: /fee\/charges/i, tgt: /फीस|चार्जेस/i },
  { src: /net disbursed/i, tgt: /नेट डिस्बर्स्ड|नेट डिस्बर्स/i }
];

function isCandidateForFutureSourceBlock(candText, currentBIdx, sourceBlockIndices, sourceGroups) {
  if (!candText || candText.length < 2) return false;
  const futureIndices = sourceBlockIndices.filter(idx => idx > currentBIdx).slice(0, 10);
  for (const fIdx of futureIndices) {
    const fSegs = sourceGroups[fIdx] || [];
    const fText = fSegs.map(s => s.source || "").join(" ").trim();
    if (!fText) continue;
    for (const rule of KEYWORD_MAP) {
      if (rule.src.test(fText) && rule.tgt.test(candText)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Main process function for dual source & target HTML file relinking
 */
async function processRelinkDualFiles(sourceFilePath, targetFilePath) {
  const htmlParser = require("./htmlParser");
  
  // 1. Parse source file & DOM
  const sourceResult = await htmlParser.parseFile(sourceFilePath);
  const sourceSegments = sourceResult.segments || [];

  const sourceHtmlContent = fs.readFileSync(sourceFilePath, "utf-8");
  const $source = cheerio.load(sourceHtmlContent, { decodeEntities: false });
  const sourceLeafBlocks = getLeafTextBlocks($source);
  const sourceBlockTableIds = sourceLeafBlocks.map(b => b.tableId);

  // 2. Parse target file DOM
  const targetHtmlContent = fs.readFileSync(targetFilePath, "utf-8");
  const $target = cheerio.load(targetHtmlContent, { decodeEntities: false });
  const targetTagMap = new Map();
  const tagCounter = { value: 1 };

  const targetLeafBlocks = getLeafTextBlocks($target);
  const targetBlockTableIds = targetLeafBlocks.map(b => b.tableId);
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

  // Dynamically match Target leaf blocks to Source leaf blocks with Table Isolation
  const sourceBlockIndices = Object.keys(sourceGroups).map(Number).sort((a, b) => a - b);
  const matchedTargetPlaceholders = {};
  
  let targetCursor = 0;
  const numTargetBlocks = targetBlockPlaceholders.length;

  sourceBlockIndices.forEach(bIdx => {
    const blockSourceSegs = sourceGroups[bIdx] || [];
    const sourceBlockText = blockSourceSegs.map(s => s.source || "").join(" ").trim();
    const srcClean = sourceBlockText.replace(/<\/?\d+>/g, "").trim();
    const isPureSymbol = /^[\s_\-—.*:;|=+]*$/.test(srcClean) && srcClean.length > 0;
    const srcTableId = sourceBlockTableIds[bIdx];

    // Enforce Table Isolation: align table blocks with matching target table IDs
    if (srcTableId !== undefined) {
      const currentTargetTableId = targetBlockTableIds[targetCursor];
      if (currentTargetTableId !== srcTableId) {
        const matchedIdx = targetBlockTableIds.findIndex((tid, idx) => idx >= targetCursor && tid === srcTableId);
        if (matchedIdx !== -1) {
          targetCursor = matchedIdx;
        }
      }
    } else if (srcTableId === undefined && targetBlockTableIds[targetCursor] !== undefined) {
      const nonTableIdx = targetBlockTableIds.findIndex((tid, idx) => idx >= targetCursor && tid === undefined);
      if (nonTableIdx !== -1) {
        targetCursor = nonTableIdx;
      }
    }
    
    while (targetCursor < numTargetBlocks - 1) {
      const candidateText = targetBlockPlaceholders[targetCursor] || "";
      const prevText = targetCursor > 0 ? (targetBlockPlaceholders[targetCursor - 1] || "") : "";
      
      const candClean = candidateText.replace(/<\/?\d+>/g, "").trim();

      // Skip duplicate blocks or mismatched non-numeric text for numeric source blocks
      if (bIdx > 0 && candidateText.length > 5 && prevText.length > 5 && candidateText.replace(/\s+/g, "") === prevText.replace(/\s+/g, "")) {
        targetCursor++;
        continue;
      }
      if (/^\d+$/.test(srcClean) && candClean.length > 10 && !/^\d+$/.test(candClean)) {
        targetCursor++;
        continue;
      }

      // Future Keyword Protection: If candidateText belongs to a future Source block, do not consume it for current block
      if (isCandidateForFutureSourceBlock(candClean, bIdx, sourceBlockIndices, sourceGroups)) {
        const srcMatchesRule = KEYWORD_MAP.some(rule => rule.src.test(srcClean) && rule.tgt.test(candClean));
        if (!srcMatchesRule) {
          targetCursor++;
          continue;
        }
      }

      // Symbol/Underscore protection: If source block is pure symbols/underscores (e.g. "___") and target candidate contains actual translated words, do not consume target candidate text!
      if (isPureSymbol && candClean.length > 0 && !/^[\s_\-—.*:;|=+]*$/.test(candClean)) {
        let foundSymbolAhead = -1;
        for (let look = targetCursor; look < Math.min(numTargetBlocks, targetCursor + 5); look++) {
          if (targetBlockTableIds[look] !== srcTableId) break;
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

  // Perform multi-strategy alignment per leaf block
  const alignedSegments = [];

  sourceSegments.forEach(srcSeg => {
    const bIdx = srcSeg.blockIndex !== undefined ? srcSeg.blockIndex : 0;
    const blockSourceSegs = sourceGroups[bIdx] || [srcSeg];
    const targetPlaceholderStr = matchedTargetPlaceholders[bIdx] || "";

    const relativeIdx = blockSourceSegs.findIndex(s => s.id === srcSeg.id);
    const splitTargetSegs = alignBlockTargetToSourceN(targetPlaceholderStr, blockSourceSegs, targetTagMap, sourceTagMap);

    let targetText = splitTargetSegs[relativeIdx >= 0 ? relativeIdx : 0] || "";

    // Strip redundant outer leading and trailing tags matching srcSeg.leading/srcSeg.trailing
    const srcLeading = (srcSeg.leading || "").trim();
    const srcTrailing = (srcSeg.trailing || "").trim();

    if (srcLeading && targetText.startsWith(srcLeading)) {
      targetText = targetText.slice(srcLeading.length).trim();
    }
    if (srcTrailing && targetText.endsWith(srcTrailing)) {
      targetText = targetText.slice(0, targetText.length - srcTrailing.length).trim();
    }

    alignedSegments.push({
      id: srcSeg.id,
      source: srcSeg.source,
      target: targetText,
      leading: srcSeg.leading || "",
      trailing: srcSeg.trailing || "",
      status: targetText ? "translated" : "draft",
      verified: false
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
