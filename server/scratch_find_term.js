const fs = require('fs');
const cheerio = require('cheerio');
const { parseFile } = require('./src/utils/parsers/htmlParser');

const srcHtml = fs.readFileSync('../client/src/testing/source.html', 'utf-8');
const $src = cheerio.load(srcHtml, { decodeEntities: false });

console.log('=== SEARCHING FOR "Termination or expiration" IN SOURCE.HTML RAW TEXT ===');
console.log('Raw text includes:', srcHtml.includes('Termination or expiration'));

$src('*').each((i, el) => {
  const text = $src(el).text();
  if (text.includes('Termination or expiration')) {
    if ($src(el).children().length === 0 || $src(el).find('p, td, div').length === 0) {
      console.log('Leaf tag:', el.tagName, el.attribs, text.slice(0, 150));
    }
  }
});

parseFile('../client/src/testing/source.html').then(res => {
  console.log('Total segments parsed by htmlParser:', res.segments.length);
  const found = res.segments.find(s => s.source.includes('Termination or expiration'));
  console.log('Found in htmlParser segments:', found);
});
