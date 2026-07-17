const fs = require('fs');
const cheerio = require('cheerio');

const srcHtml = fs.readFileSync('../client/src/testing/source.html', 'utf-8');
const tgtHtml = fs.readFileSync('../client/src/testing/target.html', 'utf-8');
const outHtml = fs.readFileSync('../client/src/testing/letest file we got from tool.html', 'utf-8');

const $src = cheerio.load(srcHtml);
const $tgt = cheerio.load(tgtHtml);
const $out = cheerio.load(outHtml);

console.log('====================================');
console.log('1. TARGET.HTML - SECTION c, d, e, f');
console.log('====================================');
$tgt('*').each((i, el) => {
  const t = $tgt(el).text().trim();
  if (t.startsWith('c.\t') || t.startsWith('d.\t') || t.startsWith('e.\t') || t.startsWith('f.\t') || t.startsWith('c. ') || t.startsWith('d. ') || t.startsWith('e. ') || t.startsWith('f. ')) {
    if ($tgt(el).children().length === 0) {
      console.log('--- TGT ---');
      console.log(t);
    }
  }
});

console.log('\n====================================');
console.log('2. LETEST FILE WE GOT FROM TOOL.HTML - SECTION c, d, e, f');
console.log('====================================');
$out('*').each((i, el) => {
  const t = $out(el).text().trim();
  if (t.startsWith('c.\t') || t.startsWith('d.\t') || t.startsWith('e.\t') || t.startsWith('f.\t') || t.startsWith('c. ') || t.startsWith('d. ') || t.startsWith('e. ') || t.startsWith('f. ')) {
    if ($out(el).children().length === 0) {
      console.log('--- OUT ---');
      console.log(t);
    }
  }
});

console.log('\n====================================');
console.log('3. TARGET.HTML - SECTION 4.3');
console.log('====================================');
$tgt('*').each((i, el) => {
  const t = $tgt(el).text().trim();
  if (t.includes('4.3') && t.includes('प्रीपेमेंट')) {
    console.log('--- TGT 4.3 ---');
    console.log(t);
  }
});

console.log('\n====================================');
console.log('4. LETEST FILE WE GOT FROM TOOL.HTML - SECTION 4.3');
console.log('====================================');
$out('*').each((i, el) => {
  const t = $out(el).text().trim();
  if (t.includes('4.3') && t.includes('प्रीपेमेंट')) {
    console.log('--- OUT 4.3 ---');
    console.log(t);
  }
});
