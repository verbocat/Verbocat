const fs = require('fs');
const cheerio = require('./server/node_modules/cheerio');

const srcHtml = fs.readFileSync('client/src/testing/PL_DIGITAL_LOAN_AGREEMENT_PROD.html', 'utf-8');
const tgtHtml = fs.readFileSync('client/src/testing/PL_DIGITAL_LOAN_AGREEMENT_PROD_Hindi_Revised 01.html', 'utf-8');

const $src = cheerio.load(srcHtml);
const $tgt = cheerio.load(tgtHtml);

console.log('=== SOURCE HTML around "The Borrower shall ensure that no part" ===');
$src('*').each((i, el) => {
  const text = $src(el).text().trim();
  if (text.includes("The Borrower shall ensure that no part")) {
    console.log(i, el.tagName, el.attribs, text.slice(0, 150));
  }
});

console.log('\n=== TARGET HTML around "उधारकर्ता को हर समय भारत" ===');
$tgt('*').each((i, el) => {
  const text = $tgt(el).text().trim();
  if (text.includes("उधारकर्ता को हर समय भारत")) {
    console.log(i, el.tagName, el.attribs, text.slice(0, 150));
  }
});
