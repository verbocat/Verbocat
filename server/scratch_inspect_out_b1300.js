const fs = require('fs');
const cheerio = require('cheerio');
const { getLeafTextBlocks } = require('./src/utils/parsers/relinkEngine');

const outHtml = fs.readFileSync('../client/src/testing/new_fixed_output.html', 'utf-8');
const $out = cheerio.load(outHtml, { decodeEntities: false });

const outLeafBlocks = getLeafTextBlocks($out);
console.log('Out Leaf Blocks Count:', outLeafBlocks.length);

for (let i = 1295; i <= 1305; i++) {
  console.log(`\nOut Block #${i}:`);
  if (outLeafBlocks[i]) console.log('  OUT:', $out.html(outLeafBlocks[i]));
}
