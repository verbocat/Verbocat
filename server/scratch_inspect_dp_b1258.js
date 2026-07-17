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

console.log('=== BLOCKS 1255 TO 1265 DETAILS ===');
for (let i = 1255; i <= 1265; i++) {
  console.log(`\nBlock #${i}:`);
  console.log('  SRC:', $src.html(srcLeafBlocks[i]));
  console.log('  TGT:', $tgt.html(tgtLeafBlocks[i]));
}
