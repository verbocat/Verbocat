const fs = require('fs');
const cheerio = require('cheerio');
const { getLeafTextBlocks, alignLeafBlocksDP } = require('./src/utils/parsers/relinkEngine');

const srcHtml = fs.readFileSync('../client/src/testing/source.html', 'utf-8');
const tgtHtml = fs.readFileSync('../client/src/testing/target.html', 'utf-8');

const $src = cheerio.load(srcHtml, { decodeEntities: false });
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false });

const srcLeafBlocks = getLeafTextBlocks($src);
const tgtLeafBlocks = getLeafTextBlocks($tgt);

console.log('=== INSPECTING BLOCK #889, #1242, #1300 ===');

[887, 888, 889, 890, 1241, 1242, 1243, 1298, 1299, 1300, 1301].forEach(i => {
  console.log(`\nBlock #${i}:`);
  if (srcLeafBlocks[i]) console.log('  SRC:', $src.html(srcLeafBlocks[i]));
  if (tgtLeafBlocks[i]) console.log('  TGT:', $tgt.html(tgtLeafBlocks[i]));
});
