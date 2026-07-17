const fs = require('fs');
const cheerio = require('cheerio');

const srcHtml = fs.readFileSync('../client/src/testing/source.html', 'utf-8');
const $src = cheerio.load(srcHtml, { decodeEntities: false });

$src('td').each((i, el) => {
  const text = $src(el).text();
  if (text.includes('Termination or expiration')) {
    console.log('=== FULL OUTER HTML OF TD ===');
    console.log($src.html(el));
  }
});
