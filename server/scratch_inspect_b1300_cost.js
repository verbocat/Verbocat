const fs = require('fs');
const cheerio = require('cheerio');
const { getLeafTextBlocks } = require('./src/utils/parsers/relinkEngine');
const { extractPlaceholders } = require('./src/utils/parsers/segmentationUtils');

const srcHtml = fs.readFileSync('../client/src/testing/source.html', 'utf-8');
const tgtHtml = fs.readFileSync('../client/src/testing/target.html', 'utf-8');

const $src = cheerio.load(srcHtml, { decodeEntities: false });
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false });

const srcLeafBlocks = getLeafTextBlocks($src);
const tgtLeafBlocks = getLeafTextBlocks($tgt);

console.log('=== DP MATCH COST FOR BLOCKS 1295 TO 1305 ===');

function calcCost(i, j) {
  const sNode = srcLeafBlocks[i];
  const tNode = tgtLeafBlocks[j];

  const sText = $src(sNode).text().trim();
  const tText = $tgt(tNode).text().trim();

  const sLen = sText.length;
  const tLen = tText.length;

  const lenRatio = sLen > 0 ? tLen / sLen : 1.0;
  let lenCost = 5.0;
  if (sLen <= 6 || tLen <= 6) {
    lenCost = 0.0;
  } else if (lenRatio >= 0.33 && lenRatio <= 3.0) {
    lenCost = Math.abs(lenRatio - 1.0) * 5.0;
  } else {
    lenCost = 35.0;
  }

  const N = srcLeafBlocks.length;
  const M = tgtLeafBlocks.length;
  const posDiff = Math.abs(((i + 1) / N) - ((j + 1) / M));
  const posPenalty = posDiff * 20.0;

  let domMatchBonus = 0.0;
  if (lenRatio >= 0.4 && lenRatio <= 2.5) {
    const sTag = sNode.name ? sNode.name.toLowerCase() : "";
    const tTag = tNode.name ? tNode.name.toLowerCase() : "";
    if (["h1","h2","h3","h4","h5","h6"].includes(sTag) && sTag === tTag) {
      domMatchBonus += 35.0;
    }
    if (sNode.tableId !== undefined && sNode.tableId === tNode.tableId) {
      if (sNode.rowId !== undefined && sNode.rowId === tNode.rowId && sNode.cellId !== undefined && sNode.cellId === tNode.cellId) {
        domMatchBonus += 40.0;
      }
    }
    if (sNode.itemId !== undefined && sNode.itemId === tNode.itemId) {
      domMatchBonus += 20.0;
    }
  }

  return lenCost + posPenalty - domMatchBonus;
}

for (let i = 1297; i <= 1302; i++) {
  console.log(`\nSrc[${i}] ("${$src(srcLeafBlocks[i]).text().trim().slice(0, 30)}"):`);
  for (let j = 1297; j <= 1302; j++) {
    const c = calcCost(i, j);
    console.log(`  vs Tgt[${j}] ("${$tgt(tgtLeafBlocks[j]).text().trim().slice(0, 30)}"): cost=${c.toFixed(2)}`);
  }
}
