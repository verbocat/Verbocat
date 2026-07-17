const fs = require('fs');
const cheerio = require('cheerio');
const { processRelinkDualFiles, getLeafTextBlocks, alignLeafBlocksDP } = require('./src/utils/parsers/relinkEngine');
const { extractPlaceholders } = require('./src/utils/parsers/segmentationUtils');

async function debugShift() {
  const srcPath = '../client/src/testing/source.html';
  const tgtPath = '../client/src/testing/target.html';

  const srcHtml = fs.readFileSync(srcPath, 'utf-8');
  const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

  const $src = cheerio.load(srcHtml, { decodeEntities: false });
  const $tgt = cheerio.load(tgtHtml, { decodeEntities: false });

  const srcLeafBlocks = getLeafTextBlocks($src);
  const tgtLeafBlocks = getLeafTextBlocks($tgt);

  console.log(`srcLeafBlocks count: ${srcLeafBlocks.length}`);
  console.log(`tgtLeafBlocks count: ${tgtLeafBlocks.length}`);

  const tagMapTgt = new Map();
  const counterTgt = { value: 1 };
  const targetBlockPlaceholders = tgtLeafBlocks.map(b => extractPlaceholders(b, $tgt, tagMapTgt, counterTgt));
  const targetBlockTableIds = tgtLeafBlocks.map(b => b.tableId);
  const sourceBlockTableIds = srcLeafBlocks.map(b => b.tableId);

  const res = await processRelinkDualFiles(srcPath, tgtPath);
  const sourceSegments = res.segments;

  const sourceGroups = {};
  sourceSegments.forEach(seg => {
    const bIdx = seg.blockIndex !== undefined ? seg.blockIndex : 0;
    if (!sourceGroups[bIdx]) sourceGroups[bIdx] = [];
    sourceGroups[bIdx].push(seg);
  });

  const sourceBlockIndices = Object.keys(sourceGroups).map(Number).sort((a, b) => a - b);

  const matchedTargetPlaceholders = alignLeafBlocksDP(
    sourceBlockIndices,
    sourceGroups,
    targetBlockPlaceholders,
    targetBlockTableIds,
    sourceBlockTableIds,
    srcLeafBlocks,
    tgtLeafBlocks
  );

  console.log('\n=== LEAF BLOCKS 1240 TO 1270 ALIGNMENT MAP ===');
  for (let i = 1240; i <= 1270; i++) {
    const sText = srcLeafBlocks[i] ? $src(srcLeafBlocks[i]).text().trim().slice(0, 50) : "N/A";
    const tText = tgtLeafBlocks[i] ? $tgt(tgtLeafBlocks[i]).text().trim().slice(0, 50) : "N/A";
    const mText = (matchedTargetPlaceholders[i] || "").replace(/<[^>]+>/g, "").trim().slice(0, 50);

    console.log(`\nBlock #${i}:`);
    console.log('  SRC [i]:', JSON.stringify(sText));
    console.log('  TGT [i]:', JSON.stringify(tText));
    console.log('  MATCHED:', JSON.stringify(mText));
  }
}

debugShift().catch(err => console.error(err));
