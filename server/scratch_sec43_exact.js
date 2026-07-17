const fs = require('fs');
const cheerio = require('cheerio');

const srcHtml = fs.readFileSync('../client/src/testing/source.html', 'utf-8');
const tgtHtml = fs.readFileSync('../client/src/testing/target.html', 'utf-8');
const outHtml = fs.readFileSync('../client/src/testing/letest file we got from tool.html', 'utf-8');

const $src = cheerio.load(srcHtml);
const $tgt = cheerio.load(tgtHtml);
const $out = cheerio.load(outHtml);

console.log('=== SOURCE.HTML LEAF BLOCKS AROUND 4.3 ===');
$src('*:contains("4.3")').each((i, el) => {
  if ($src(el).children().length === 0 || $src(el).find('p, td, div').length === 0) {
    console.log('SRC block:', $src(el).text().trim());
  }
});

console.log('\n=== TARGET.HTML LEAF BLOCKS AROUND 4.3 ===');
$tgt('*:contains("4.3")').each((i, el) => {
  if ($tgt(el).children().length === 0 || $tgt(el).find('p, td, div').length === 0) {
    console.log('TGT block:', $tgt(el).text().trim());
  }
});

console.log('\n=== TOOL OUTPUT LEAF BLOCKS AROUND 4.3 ===');
$out('*:contains("4.3")').each((i, el) => {
  if ($out(el).children().length === 0 || $out(el).find('p, td, div').length === 0) {
    console.log('OUT block:', $out(el).text().trim());
  }
});
