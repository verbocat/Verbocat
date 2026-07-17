const fs = require("fs");
const cheerio = require("cheerio");
const { extractPlaceholders, splitByPunctuation, balanceSegmentTags } = require("./segmentationUtils");
const { alignSegmentTags } = require("../tagProtection");
const { getLeafTextBlocks, projectSourceTagsOntoTarget } = require("./relinkEngine");

function sanitizeTargetSpacing(text) {
  if (!text) return "";
  let clean = text
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([.,!?।॥])/g, "$1")
    .replace(/([.,!?।॥])(?=[^\s.,!?।॥<\d])/g, "$1 ")
    .trim();
  return clean;
}

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
    const fullText = segs.map(s => s.source_text || s.source || "").join(" ").trim();
    const cleanText = fullText.replace(/<\/?\d+>/g, "").trim();
    const bNode = sourceLeafBlocks ? sourceLeafBlocks[bIdx] : null;
    return {
      bIdx,
      fullText,
      cleanText,
      tableId: bNode ? bNode.tableId : (sourceBlockTableIds ? sourceBlockTableIds[bIdx] : undefined),
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
        matchCost = 10000.0;
      } else {
        let sharedAnchors = 0;
        src.anchors.forEach(a => {
          if (tgt.anchors.has(a)) sharedAnchors++;
        });

        const posDiff = Math.abs((i / N) - (j / M));
        const posPenalty = posDiff * 20.0;

        const lenRatio = src.len > 0 ? tgt.len / src.len : 1.0;
        let lenCost = 5.0;
        if (src.len <= 15 || tgt.len <= 15) {
          lenCost = 0.0;
        } else if (lenRatio >= 0.2 && lenRatio <= 3.0) {
          lenCost = Math.abs(lenRatio - 1.0) * 5.0;
        } else {
          lenCost = 15.0;
        }

        let domMatchBonus = 0.0;
        if (src.tableId !== undefined && src.tableId === tgt.tableId) {
          if (src.rowId !== undefined && src.rowId === tgt.rowId && src.cellId !== undefined && src.cellId === tgt.cellId) {
            domMatchBonus += 40.0;
          }
        }
        if (src.itemId !== undefined && src.itemId === tgt.itemId) {
          domMatchBonus += 20.0;
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
      matchedPlaceholders[src.bIdx] = "";
      currI--;
    } else {
      currJ--;
    }
  }

  return matchedPlaceholders;
}

function splitTargetBlockToN(targetPlaceholderStr, N, sourceSubSegments, targetTagMap, sourceTagMap) {
  if (!targetPlaceholderStr || targetPlaceholderStr.trim().length === 0) {
    return sourceSubSegments.map(() => "");
  }

  if (N <= 1) {
    let text = sanitizeTargetSpacing(targetPlaceholderStr);
    const srcText = sourceSubSegments[0] ? (sourceSubSegments[0].source_text || sourceSubSegments[0].source || "") : "";
    if (sourceTagMap && targetTagMap && srcText) {
      text = alignSegmentTags(srcText, text, sourceTagMap, targetTagMap);
    }
    return [projectSourceTagsOntoTarget(srcText, text)];
  }

  const targetSentences = splitByPunctuation(targetPlaceholderStr);
  let rawSegments = [];

  if (targetSentences.length === N) {
    rawSegments = targetSentences;
  } else if (targetSentences.length >= N && targetSentences.length > 1) {
    const srcWeights = sourceSubSegments.map(s => Math.max(1, (s.source_text || s.source || "").replace(/<[^>]+>/g, "").trim().length));
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
    const text = sanitizeTargetSpacing(targetPlaceholderStr);
    const srcWeights = sourceSubSegments.map(s => Math.max(1, (s.source_text || s.source || "").replace(/<[^>]+>/g, "").trim().length));
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

  return rawSegments.map((segText, idx) => {
    const sourceSeg = sourceSubSegments[idx];
    const srcText = sourceSeg ? (sourceSeg.source_text || sourceSeg.source || "") : "";
    let alignedTarget = sanitizeTargetSpacing(segText);
    if (sourceTagMap && targetTagMap && srcText) {
      alignedTarget = alignSegmentTags(srcText, alignedTarget, sourceTagMap, targetTagMap);
    }
    return projectSourceTagsOntoTarget(srcText, alignedTarget);
  });
}

async function alignTargetHtmlToSource(targetFilePath, templateHtml, sourceTagMap, sourceSegments, sourceSegmentToBlockMap) {
  const targetHtmlContent = fs.readFileSync(targetFilePath, "utf-8");
  const $target = cheerio.load(targetHtmlContent, { decodeEntities: false });
  const targetTagMap = new Map();
  const tagCounter = { value: 1 };

  const targetLeafBlocks = getLeafTextBlocks($target);
  const targetBlockTableIds = targetLeafBlocks.map(b => b.tableId);
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

  const matchedTargetPlaceholders = alignLeafBlocksDP(
    sourceBlockIndices,
    sourceGroups,
    targetBlockPlaceholders,
    targetBlockTableIds,
    {}
  );

  const alignedMap = new Map();

  sourceBlockIndices.forEach(bIdx => {
    const blockSourceSegs = sourceGroups[bIdx] || [];
    const N = blockSourceSegs.length;
    const targetPlaceholderStr = matchedTargetPlaceholders[bIdx] || "";

    const splitTargetSegs = splitTargetBlockToN(targetPlaceholderStr, N, blockSourceSegs, targetTagMap, sourceTagMap);

    blockSourceSegs.forEach((srcSeg, idx) => {
      alignedMap.set(srcSeg.segment_index, sanitizeTargetSpacing(splitTargetSegs[idx] || ""));
    });
  });

  return alignedMap;
}

module.exports = {
  alignTargetHtmlToSource,
  splitTargetBlockToN,
  getLeafTextBlocks,
  projectSourceTagsOntoTarget
};
