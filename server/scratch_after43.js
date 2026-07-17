const fs = require('fs');
const cheerio = require('cheerio');
const { getLeafTextBlocks } = require('./src/utils/parsers/relinkEngine');

const srcHtml = fs.readFileSync('../client/src/testing/source.html', 'utf-8');
const tgtHtml = fs.readFileSync('../client/src/testing/target.html', 'utf-8');
const outHtml = fs.readFileSync('../client/src/testing/letest file we got from tool.html', 'utf-8');

const $src = cheerio.load(srcHtml, { decodeEntities: false });
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false });
const $out = cheerio.load(outHtml, { decodeEntities: false });

const srcBlocks = getLeafTextBlocks($src);
const tgtBlocks = getLeafTextBlocks($tgt);
const outBlocks = getLeafTextBlocks($out);

const idx43Src = srcBlocks.findIndex(b => $src(b).text().trim() === '4.3');
const idx43Tgt = tgtBlocks.findIndex(b => $tgt(b).text().trim() === '4.3');

console.log('=== SOURCE BLOCKS AFTER 4.3 ===');
for (let i = idx43Src; i < idx43Src + 8; i++) {
  if (srcBlocks[i]) console.log(`SRC [${i}]:`, $src(srcBlocks[i]).text().trim());
}

console.log('\n=== TARGET BLOCKS AFTER 4.3 ===');
for (let i = idx43Tgt; i < idx43Tgt + 8; i++) {
  if (tgtBlocks[i]) console.log(`TGT [${i}]:`, $tgt(tgtBlocks[i]).text().trim());
}

console.log('\n=== TOOL OUTPUT BLOCKS AFTER 4.3 ===');
for (let i = idx43Src; i < idx43Src + 8; i++) {
  if (outBlocks[i]) console.log(`OUT [${i}]:`, $out(outBlocks[i]).text().trim());
}
