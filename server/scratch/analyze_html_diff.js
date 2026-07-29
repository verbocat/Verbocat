const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

console.log(`Source byte length: ${srcHtml.length}, line count: ${srcHtml.split('\n').length}`);
console.log(`Target byte length: ${tgtHtml.length}, line count: ${tgtHtml.split('\n').length}`);

const $src = cheerio.load(srcHtml);
const $tgt = cheerio.load(tgtHtml);

const tagsToCompare = ['html', 'head', 'body', 'style', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'div', 'p', 'span', 'b', 'i', 'strong', 'em', 'img', 'br', 'hr', 'ul', 'ol', 'li'];

console.log('\n--- TAG COUNT COMPARISON ---');
tagsToCompare.forEach(tag => {
  const srcCount = $src(tag).length;
  const tgtCount = $tgt(tag).length;
  if (srcCount !== tgtCount) {
    console.log(`MISMATCH: <${tag}> Source=${srcCount}, Target=${tgtCount}`);
  } else {
    console.log(`MATCH: <${tag}> count=${srcCount}`);
  }
});

// Compare inner HTML of styles
const srcStyles = $src('style').html();
const tgtStyles = $tgt('style').html();
console.log(`Styles match: ${srcStyles === tgtStyles}`);

// Let's check table count and structure
const srcTables = $src('table');
const tgtTables = $tgt('table');
console.log(`\nSource tables: ${srcTables.length}, Target tables: ${tgtTables.length}`);
