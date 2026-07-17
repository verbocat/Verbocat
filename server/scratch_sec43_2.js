const fs = require('fs');
const cheerio = require('cheerio');

const srcHtml = fs.readFileSync('../client/src/testing/source.html', 'utf-8');
const tgtHtml = fs.readFileSync('../client/src/testing/target.html', 'utf-8');
const outHtml = fs.readFileSync('../client/src/testing/letest file we got from tool.html', 'utf-8');

const $src = cheerio.load(srcHtml);
const $tgt = cheerio.load(tgtHtml);
const $out = cheerio.load(outHtml);

function printCells($, label) {
  console.log(`\n====================================`);
  console.log(`=== ${label} CELLS AROUND PREPAYMENT & DISBURSEMENT ===`);
  console.log(`====================================`);
  $('td, p, div').each((i, el) => {
    const text = $(el).text().trim();
    if ($(el).children().length === 0 && (text.includes('4.3') || text.includes('4.4') || text.includes('premature') || text.includes('मृत्यु') || text.includes('disbursement') || text.includes('डिस्बर्समेंट'))) {
      console.log(`[${el.tagName}]`, text.slice(0, 200));
    }
  });
}

printCells($src, 'SOURCE.HTML');
printCells($tgt, 'TARGET.HTML');
printCells($out, 'LETEST FILE WE GOT FROM TOOL.HTML');
