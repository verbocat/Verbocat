const fs = require("fs");
const cheerio = require("cheerio");
const zlib = require("zlib");
const { extractPlaceholders, splitByPunctuation, balanceSegmentTags } = require("./segmentationUtils");
const { alignSegmentTags } = require("../tagProtection");

const BLOCK_TAGS = [
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "blockquote", 
  "section", "article", "nav", "header", "footer", "figcaption", "address", "main",
  "ul", "ol", "table", "tbody", "thead", "tr", "dl", "dt", "dd", "form", "fieldset",
  "body", "html"
];

// Clean up extra spaces around punctuation and Devanagari danda
function sanitizeTargetSpacing(text) {
  if (!text) return "";
  let clean = text
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([.,!?।॥])/g, "$1") // Remove spaces before punctuation
    .replace(/([.,!?।॥])(?=[^\s.,!?।॥<\d])/g, "$1 ") // Ensure space after punctuation if missing
    .trim();
  return clean;
}

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
  $(".__temp-leaf-block__").each((_, el) => {
    $(el).replaceWith($(el).contents());
  });

  $("td table, th table").each((_, tbl) => {
    $(tbl).replaceWith($(tbl).contents());
  });

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
      const $n = $(node);
      const tableEl = $n.closest("table");
      const trEl = $n.closest("tr");
      const cellEl = $n.closest("td, th");
      const liEl = $n.closest("li");

      const tagName = node.name ? node.name.toLowerCase() : "";
      node.headingTag = ["h1","h2","h3","h4","h5","h6"].includes(tagName) ? tagName : undefined;
      node.tableId = tableEl.length ? tableEl.attr("data-relink-table-id") : undefined;
      node.rowId = trEl.length ? trEl.index() : undefined;
      node.cellId = cellEl.length ? cellEl.index() : undefined;
      node.itemId = liEl.length ? liEl.index() : undefined;

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

// Extracts entity anchors (numbers, codes, URLs, emails) from text
function extractEntityAnchors(text) {
  if (!text) return new Set();
  const clean = String(text).replace(/<\/?\d+>/g, " ");
  const anchors = new Set();

  const numbers = clean.match(/\b\d+[\d.,/-]*\b/g);
  if (numbers) numbers.forEach(n => anchors.add(n.toLowerCase()));

  const urls = clean.match(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b|\b(?:https?:\/\/|www\.)[^\s]+\b/gi);
  if (urls) urls.forEach(u => anchors.add(u.toLowerCase()));

  const codes = clean.match(/\b[A-Z0-9_-]{3,}\b/g);
  if (codes) codes.forEach(c => anchors.add(c.toLowerCase()));

  return anchors;
}

// Global Dynamic Programming Sequence Aligner for Source & Target Leaf Blocks
function alignLeafBlocksDP(sourceBlockIndices, sourceGroups, targetBlockPlaceholders, targetBlockTableIds, sourceBlockTableIds, sourceLeafBlocks, targetLeafBlocks) {
  const N = sourceBlockIndices.length;
  const M = targetBlockPlaceholders.length;

  if (N === 0) return {};
  if (M === 0) {
    const fallback = {};
    sourceBlockIndices.forEach(bIdx => {
      fallback[bIdx] = "";
    });
    return fallback;
  }

  const srcInfos = sourceBlockIndices.map(bIdx => {
    const segs = sourceGroups[bIdx] || [];
    const fullText = segs.map(s => s.source || "").join(" ").trim();
    const cleanText = fullText.replace(/<\/?\d+>/g, "").trim();
    const bNode = sourceLeafBlocks ? sourceLeafBlocks[bIdx] : null;
    return {
      bIdx,
      fullText,
      cleanText,
      headingTag: bNode ? bNode.headingTag : undefined,
      tableId: bNode ? bNode.tableId : sourceBlockTableIds[bIdx],
      rowId: bNode ? bNode.rowId : undefined,
      cellId: bNode ? bNode.cellId : undefined,
      itemId: bNode ? bNode.itemId : undefined,
      anchors: extractEntityAnchors(fullText),
      len: cleanText.length
    };
  });

  const tgtInfos = targetBlockPlaceholders.map((ph, idx) => {
    const cleanText = (ph || "").replace(/<\/?\d+>/g, "").trim();
    const bNode = targetLeafBlocks ? targetLeafBlocks[idx] : null;
    return {
      tIdx: idx,
      fullText: ph || "",
      cleanText,
      headingTag: bNode ? bNode.headingTag : undefined,
      tableId: bNode ? bNode.tableId : targetBlockTableIds[idx],
      rowId: bNode ? bNode.rowId : undefined,
      cellId: bNode ? bNode.cellId : undefined,
      itemId: bNode ? bNode.itemId : undefined,
      anchors: extractEntityAnchors(ph),
      len: cleanText.length
    };
  });

  const DP = Array.from({ length: N + 1 }, () => new Float64Array(M + 1));
  const Backtrack = Array.from({ length: N + 1 }, () => new Int32Array(M + 1));
  const GAP_COST = 25.0;

  for (let i = 0; i <= N; i++) DP[i][0] = i * GAP_COST;
  for (let j = 0; j <= M; j++) DP[0][j] = j * GAP_COST;

  for (let i = 1; i <= N; i++) {
    const src = srcInfos[i - 1];
    for (let j = 1; j <= M; j++) {
      const tgt = tgtInfos[j - 1];

      let matchCost = 50.0;
      if (src.tableId !== undefined && tgt.tableId !== undefined && src.tableId !== tgt.tableId) {
        matchCost = 10000.0; // Table boundary mismatch penalty
      } else {
        let sharedAnchors = 0;
        src.anchors.forEach(a => {
          if (tgt.anchors.has(a)) sharedAnchors++;
        });

        const posDiff = Math.abs((i / N) - (j / M));
        const posPenalty = posDiff * 20.0;

        const lenRatio = src.len > 0 ? tgt.len / src.len : 1.0;
        let lenCost = 5.0;
        if (src.len <= 6 || tgt.len <= 6) {
          lenCost = 0.0;
        } else if (lenRatio >= 0.33 && lenRatio <= 3.0) {
          lenCost = Math.abs(lenRatio - 1.0) * 5.0;
        } else {
          lenCost = 35.0;
        }

        let domMatchBonus = 0.0;
        if (lenRatio >= 0.4 && lenRatio <= 2.5) {
          if (src.headingTag !== undefined && src.headingTag === tgt.headingTag) {
            domMatchBonus += 35.0;
          }
          if (src.tableId !== undefined && src.tableId === tgt.tableId) {
            if (src.rowId !== undefined && src.rowId === tgt.rowId && src.cellId !== undefined && src.cellId === tgt.cellId) {
              domMatchBonus += 40.0;
            }
          }
          if (src.itemId !== undefined && src.itemId === tgt.itemId) {
            domMatchBonus += 20.0;
          }
        }

        matchCost = lenCost + posPenalty - (sharedAnchors * 35.0) - domMatchBonus;
      }

      const costMatch = DP[i - 1][j - 1] + matchCost;
      const costSkipSrc = DP[i - 1][j] + GAP_COST;
      const costSkipTgt = DP[i][j - 1] + GAP_COST;

      if (costMatch <= costSkipSrc && costMatch <= costSkipTgt) {
        DP[i][j] = costMatch;
        Backtrack[i][j] = 1;
      } else if (costSkipSrc <= costSkipTgt) {
        DP[i][j] = costSkipSrc;
        Backtrack[i][j] = 2;
      } else {
        DP[i][j] = costSkipTgt;
        Backtrack[i][j] = 3;
      }
    }
  }

  const matchedPlaceholders = {};
  let currI = N;
  let currJ = M;

  while (currI > 0 || currJ > 0) {
    if (currI > 0 && currJ > 0 && Backtrack[currI][currJ] === 1) {
      const src = srcInfos[currI - 1];
      const tgt = tgtInfos[currJ - 1];
      matchedPlaceholders[src.bIdx] = tgt.fullText || "";
      currI--;
      currJ--;
    } else if (currI > 0 && (currJ === 0 || Backtrack[currI][currJ] === 2)) {
      const src = srcInfos[currI - 1];
      matchedPlaceholders[src.bIdx] = ""; // NEVER fallback to English source text!
      currI--;
    } else {
      currJ--;
    }
  }

  return matchedPlaceholders;
}

// Term-aware and word-boundary safe source tag projection onto target text
function projectSourceTagsOntoTarget(sourceText, targetText) {
  if (!sourceText) return sanitizeTargetSpacing(targetText || "");

  const tagPairs = [];
  const tagRegex = /<(\d+)>(.*?)<\/(\d+)>/g;
  let m;
  while ((m = tagRegex.exec(sourceText)) !== null) {
    if (m[1] === m[3]) {
      tagPairs.push({
        id: m[1],
        openTag: `<${m[1]}>`,
        closeTag: `</${m[1]}>`,
        innerSrc: m[2].replace(/<\/?\d+>/g, "").trim()
      });
    }
  }

  let resultTarget = sanitizeTargetSpacing(targetText || "");
  if (!resultTarget) return "";

  const existingTags = resultTarget.match(/<\/?\d+>/g) || [];
  if (existingTags.length > 0) {
    return balanceSegmentTags(resultTarget);
  }

  const cleanTarget = resultTarget.replace(/<[^>]+>/g, "").trim();
  if (!cleanTarget) return "";

  resultTarget = cleanTarget;

  tagPairs.forEach(pair => {
    if (resultTarget.includes(pair.openTag)) return;

    const inner = pair.innerSrc;
    let placed = false;

    if (inner && inner.length > 1) {
      const idx = resultTarget.indexOf(inner);
      if (idx !== -1) {
        resultTarget = resultTarget.slice(0, idx) + pair.openTag + inner + pair.closeTag + resultTarget.slice(idx + inner.length);
        placed = true;
      }
    }

    if (!placed) {
      const cleanSource = sourceText.replace(/<\/?\d+>/g, "").trim();
      const tagOffset = sourceText.indexOf(pair.openTag);
      const ratio = cleanSource.length > 0 ? Math.max(0, Math.min(1, tagOffset / sourceText.length)) : 0;

      const words = resultTarget.split(/(\s+)/);
      let targetWordIdx = Math.round(words.length * ratio);
      targetWordIdx = Math.max(0, Math.min(words.length - 1, targetWordIdx));

      let charIdx = 0;
      for (let w = 0; w < targetWordIdx; w++) {
        charIdx += words[w].length;
      }

      const wordLen = words[targetWordIdx] ? words[targetWordIdx].length : 0;
      resultTarget = resultTarget.slice(0, charIdx) + pair.openTag + resultTarget.slice(charIdx, charIdx + wordLen) + pair.closeTag + resultTarget.slice(charIdx + wordLen);
    }
  });

  return balanceSegmentTags(resultTarget);
}

// Aligns block target text to N source sub-segments using sentence splitting & proportional slicing
function alignBlockTargetToSourceN(targetPlaceholderStr, sourceSubSegments, targetTagMap, sourceTagMap) {
  const N = sourceSubSegments.length;
  if (!targetPlaceholderStr || targetPlaceholderStr.trim().length === 0) {
    return sourceSubSegments.map(() => "");
  }

  if (N <= 1) {
    let text = sanitizeTargetSpacing(targetPlaceholderStr);
    const srcText = sourceSubSegments[0] ? (sourceSubSegments[0].source || "") : "";
    if (sourceTagMap && targetTagMap && srcText) {
      text = alignSegmentTags(srcText, text, sourceTagMap, targetTagMap);
    }
    return [projectSourceTagsOntoTarget(srcText, text)];
  }

  let rawSegments = [];

  // Special handler for merged Yes/No table cell blocks
  if (N >= 2) {
    const cleanTgtText = targetPlaceholderStr.replace(/<[^>]+>/g, "").trim();
    if (/(?:हाँ|नहीं)/i.test(cleanTgtText)) {
      const srcTexts = sourceSubSegments.map(s => (s.source || "").replace(/<[^>]+>/g, "").trim().toLowerCase());
      const hasYesNoSrc = srcTexts.some(st => st === "yes" || st === "no");
      if (hasYesNoSrc) {
        const m = targetPlaceholderStr.match(/^(.*?)(?:<[^>]+>)*\s*(हाँ|नहीं|हाँनहीं|नहींहाँ|Yes|No)(?:<[^>]+>)*\s*(हाँ|नहीं|Yes|No)?/i);
        if (m) {
          const mainPart = m[1].trim();
          const opt1 = m[2] ? m[2].trim() : "हाँ";
          const opt2 = m[3] ? m[3].trim() : "नहीं";
          if (N === 2) {
            rawSegments = [opt1, opt2];
          } else if (N === 3) {
            rawSegments = [mainPart, opt1, opt2];
          }
        }
      }
    }
  }

  if (rawSegments.length === 0) {
    const targetSentences = splitByPunctuation(targetPlaceholderStr);
    if (targetSentences.length === N) {
      rawSegments = targetSentences;
    } else if (targetSentences.length >= N && targetSentences.length > 1) {
    const srcWeights = sourceSubSegments.map(s => Math.max(1, (s.source || "").replace(/<[^>]+>/g, "").trim().length));
    const totalSrcLen = srcWeights.reduce((a, b) => a + b, 0);
    const totalTgtLen = targetSentences.reduce((a, s) => a + s.length, 0);

    let tgtIdx = 0;
    for (let k = 0; k < N; k++) {
      if (k === N - 1) {
        rawSegments.push(targetSentences.slice(tgtIdx).join(" "));
        break;
      }
      const srcRatio = srcWeights[k] / totalSrcLen;
      const maxAllowedTake = Math.max(1, (targetSentences.length - tgtIdx) - (N - 1 - k));
      let accRatio = 0;
      let takeCount = 1;

      for (let j = tgtIdx; j < targetSentences.length - (N - 1 - k); j++) {
        const itemRatio = targetSentences[j].length / totalTgtLen;
        if (takeCount > 1 && (accRatio + itemRatio / 2) >= srcRatio) break;
        accRatio += itemRatio;
        if (accRatio >= srcRatio * 0.8 && takeCount >= 1) {
          break;
        }
        if (takeCount >= maxAllowedTake) break;
        takeCount++;
      }
      takeCount = Math.min(takeCount, maxAllowedTake);
      rawSegments.push(targetSentences.slice(tgtIdx, tgtIdx + takeCount).join(" "));
      tgtIdx += takeCount;
    }
  } else {
    // Proportional character ratio partition when target has fewer sentences than source subsegments
    const text = sanitizeTargetSpacing(targetPlaceholderStr);
    const srcWeights = sourceSubSegments.map(s => Math.max(1, (s.source || "").replace(/<[^>]+>/g, "").trim().length));
    const totalSrcLen = srcWeights.reduce((a, b) => a + b, 0);

    let currPos = 0;
    for (let k = 0; k < N; k++) {
      if (k === N - 1) {
        rawSegments.push(text.slice(currPos).trim());
        break;
      }
      const ratio = srcWeights[k] / totalSrcLen;
      let nextPos = Math.round(currPos + text.length * ratio);
      nextPos = Math.max(currPos + 1, Math.min(text.length - (N - 1 - k), nextPos));

      // Snap to nearest space or punctuation boundary so target words/sentences are not cut in half
      if (nextPos < text.length && !/\s/.test(text[nextPos - 1]) && !/\s/.test(text[nextPos])) {
        const nextSpace = text.indexOf(" ", nextPos);
        const prevSpace = text.lastIndexOf(" ", nextPos);
        if (nextSpace !== -1 && (prevSpace === -1 || (nextSpace - nextPos) <= (nextPos - prevSpace))) {
          nextPos = nextSpace + 1;
        } else if (prevSpace !== -1) {
          nextPos = prevSpace + 1;
        }
      }

      rawSegments.push(text.slice(currPos, nextPos).trim());
      currPos = nextPos;
    }
  }
}

  return rawSegments.map((segText, idx) => {
    const sourceSeg = sourceSubSegments[idx];
    const srcText = sourceSeg ? (sourceSeg.source || "") : "";
    let alignedTarget = sanitizeTargetSpacing(segText);
    if (sourceTagMap && targetTagMap && srcText) {
      alignedTarget = alignSegmentTags(srcText, alignedTarget, sourceTagMap, targetTagMap);
    }
    return projectSourceTagsOntoTarget(srcText, alignedTarget);
  });
}

// Main entry point for dual source & target HTML file relinking
async function processRelinkDualFiles(sourceFilePath, targetFilePath) {
  const htmlParser = require("./htmlParser");
  
  const sourceResult = await htmlParser.parseFile(sourceFilePath);
  const sourceSegments = sourceResult.segments || [];

  const sourceHtmlContent = fs.readFileSync(sourceFilePath, "utf-8");
  const $source = cheerio.load(sourceHtmlContent, { decodeEntities: false });
  $source("*").removeAttr("data-relink-table-id");
  $source(".__temp-leaf-block__").each((_, el) => {
    $source(el).replaceWith($source(el).contents());
  });

  const sourceLeafBlocks = getLeafTextBlocks($source);
  const sourceBlockTableIds = sourceLeafBlocks.map(b => b.tableId);

  const targetHtmlContent = fs.readFileSync(targetFilePath, "utf-8");
  const $target = cheerio.load(targetHtmlContent, { decodeEntities: false });
  $target("*").removeAttr("data-relink-table-id");
  $target(".__temp-leaf-block__").each((_, el) => {
    $target(el).replaceWith($target(el).contents());
  });

  const targetTagMap = new Map();
  const tagCounter = { value: 1 };

  const targetLeafBlocks = getLeafTextBlocks($target);
  const targetBlockTableIds = targetLeafBlocks.map(b => b.tableId);
  const targetBlockPlaceholders = targetLeafBlocks.map(blockNode => {
    return extractPlaceholders(blockNode, $target, targetTagMap, tagCounter);
  });

  let sourceTagMap = new Map();
  try {
    const buffer = Buffer.from(sourceResult.template, "base64");
    const unzipped = zlib.gunzipSync(buffer).toString("utf-8");
    const templateData = JSON.parse(unzipped);
    sourceTagMap = new Map(templateData.tagMap || []);
  } catch (e) {
    console.error("Failed to decode source tag map:", e);
  }

  const sourceGroups = {};
  sourceSegments.forEach(seg => {
    const bIdx = seg.blockIndex !== undefined ? seg.blockIndex : 0;
    if (!sourceGroups[bIdx]) {
      sourceGroups[bIdx] = [];
    }
    sourceGroups[bIdx].push(seg);
  });

  const sourceBlockIndices = Object.keys(sourceGroups).map(Number).sort((a, b) => a - b);
  
  // Use Global DP Sequence Aligner with DOM structural cell matching
  const matchedTargetPlaceholders = alignLeafBlocksDP(
    sourceBlockIndices,
    sourceGroups,
    targetBlockPlaceholders,
    targetBlockTableIds,
    sourceBlockTableIds,
    sourceLeafBlocks,
    targetLeafBlocks
  );

  const alignedSegments = [];

  sourceSegments.forEach(srcSeg => {
    const bIdx = srcSeg.blockIndex !== undefined ? srcSeg.blockIndex : 0;
    const blockSourceSegs = sourceGroups[bIdx] || [srcSeg];
    const targetPlaceholderStr = matchedTargetPlaceholders[bIdx] || "";

    const relativeIdx = blockSourceSegs.findIndex(s => s.id === srcSeg.id);
    const splitTargetSegs = alignBlockTargetToSourceN(targetPlaceholderStr, blockSourceSegs, targetTagMap, sourceTagMap);

    let targetText = splitTargetSegs[relativeIdx >= 0 ? relativeIdx : 0] || "";

    const srcLeading = (srcSeg.leading || "").trim();
    const srcTrailing = (srcSeg.trailing || "").trim();

    if (srcLeading && targetText.startsWith(srcLeading)) {
      targetText = targetText.slice(srcLeading.length).trim();
    }
    if (srcTrailing && targetText.endsWith(srcTrailing)) {
      targetText = targetText.slice(0, targetText.length - srcTrailing.length).trim();
    }

    targetText = sanitizeTargetSpacing(targetText);

    alignedSegments.push({
      id: srcSeg.id,
      source: srcSeg.source,
      target: targetText,
      leading: srcSeg.leading || "",
      trailing: srcSeg.trailing || "",
      blockIndex: srcSeg.blockIndex,
      status: targetText ? "translated" : "draft",
      verified: false
    });
  });

  let mergedTemplate = sourceResult.template;
  try {
    const buffer = Buffer.from(sourceResult.template, "base64");
    const unzipped = zlib.gunzipSync(buffer).toString("utf-8");
    const templateData = JSON.parse(unzipped);

    const mergedTagMap = new Map(templateData.tagMap || []);
    targetTagMap.forEach((val, key) => {
      mergedTagMap.set(key, val);
    });

    templateData.tagMap = Array.from(mergedTagMap.entries());
    mergedTemplate = zlib.gzipSync(Buffer.from(JSON.stringify(templateData), "utf-8")).toString("base64");
  } catch (e) {
    console.error("Failed to merge targetTagMap into template:", e);
  }

  return {
    segments: alignedSegments,
    template: mergedTemplate,
    count: alignedSegments.length
  };
}

module.exports = {
  processRelinkDualFiles,
  alignBlockTargetToSourceN,
  alignLeafBlocksDP,
  getLeafTextBlocks,
  projectSourceTagsOntoTarget
};
