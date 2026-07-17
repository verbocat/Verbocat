const fs = require("fs");
const cheerio = require("cheerio");
const { extractPlaceholders, splitByPunctuation, balanceSegmentTags } = require("./segmentationUtils");
const { alignSegmentTags } = require("../tagProtection");
const { getLeafTextBlocks, projectSourceTagsOntoTarget } = require("./relinkEngine");

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

function alignLeafBlocksDP(sourceBlockIndices, sourceGroups, targetBlockPlaceholders, targetBlockTableIds, sourceBlockTableIds) {
  const N = sourceBlockIndices.length;
  const M = targetBlockPlaceholders.length;

  if (N === 0) return {};
  if (M === 0) {
    const fallback = {};
    sourceBlockIndices.forEach(bIdx => {
      fallback[bIdx] = (sourceGroups[bIdx] || []).map(s => s.source_text || s.source || "").join(" ").trim();
    });
    return fallback;
  }

  const srcInfos = sourceBlockIndices.map(bIdx => {
    const segs = sourceGroups[bIdx] || [];
    const fullText = segs.map(s => s.source_text || s.source || "").join(" ").trim();
    const cleanText = fullText.replace(/<\/?\d+>/g, "").trim();
    return {
      bIdx,
      fullText,
      cleanText,
      tableId: sourceBlockTableIds[bIdx],
      anchors: extractEntityAnchors(fullText),
      len: cleanText.length
    };
  });

  const tgtInfos = targetBlockPlaceholders.map((ph, idx) => {
    const cleanText = (ph || "").replace(/<\/?\d+>/g, "").trim();
    return {
      tIdx: idx,
      fullText: ph || "",
      cleanText,
      tableId: targetBlockTableIds[idx],
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
        let lenCost = 10.0;
        if (lenRatio >= 0.4 && lenRatio <= 2.2) {
          lenCost = Math.abs(lenRatio - 1.1) * 5.0;
        } else {
          lenCost = 35.0;
        }

        matchCost = lenCost + posPenalty - (sharedAnchors * 35.0);
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
      matchedPlaceholders[src.bIdx] = tgt.fullText || src.fullText;
      currI--;
      currJ--;
    } else if (currI > 0 && (currJ === 0 || Backtrack[currI][currJ] === 2)) {
      const src = srcInfos[currI - 1];
      matchedPlaceholders[src.bIdx] = src.fullText;
      currI--;
    } else {
      currJ--;
    }
  }

  return matchedPlaceholders;
}

function splitTargetBlockToN(targetPlaceholderStr, N, sourceSubSegments, targetTagMap, sourceTagMap) {
  if (!targetPlaceholderStr || targetPlaceholderStr.trim().length === 0) {
    return sourceSubSegments.map(s => projectSourceTagsOntoTarget(s.source_text || s.source || "", ""));
  }

  if (N <= 1) {
    let text = targetPlaceholderStr.trim();
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
  } else if (targetSentences.length > 1) {
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
    let text = targetPlaceholderStr.trim();
    for (let k = 0; k < N; k++) {
      if (k === 0) rawSegments.push(text);
      else rawSegments.push("");
    }
  }

  return rawSegments.map((segText, idx) => {
    const sourceSeg = sourceSubSegments[idx];
    const srcText = sourceSeg ? (sourceSeg.source_text || sourceSeg.source || "") : "";
    let alignedTarget = segText;
    if (sourceTagMap && targetTagMap && srcText) {
      alignedTarget = alignSegmentTags(srcText, segText, sourceTagMap, targetTagMap);
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
  const sourceBlockTableIds = sourceLeafBlocks => sourceLeafBlocks.map(b => b.tableId); // Dummy if needed

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
      alignedMap.set(srcSeg.segment_index, splitTargetSegs[idx] || "");
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
