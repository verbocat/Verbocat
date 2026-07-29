const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

const $src = cheerio.load(srcHtml, { decodeEntities: false });
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false });

// Let's compare all elements with bold tag <b>
const srcB = $src('b');
const tgtB = $tgt('b');

console.log(`Source <b> count: ${srcB.length}, Target <b> count: ${tgtB.length}`);

// Let's check where <b> tags are unclosed in target
// Inspect td cells in target that have unclosed <b> or mismatched <b>
let tdUnclosedBCount = 0;
$tgt('td').each((i, td) => {
  const html = $tgt(td).html() || '';
  const openCount = (html.match(/<b[\s>]/gi) || []).length;
  const closeCount = (html.match(/<\/b>/gi) || []).length;
  if (openCount !== closeCount) {
    tdUnclosedBCount++;
    if (tdUnclosedBCount <= 10) {
      console.log(`TD #${i} <b> mismatch: open=${openCount}, close=${closeCount}`);
      console.log(`   HTML snippet: ${html.substring(0, 150)}`);
    }
  }
});
console.log(`Total TD cells in target with mismatched <b>: ${tdUnclosedBCount}`);

// Inspect span cells in target
let tdUnclosedSpanCount = 0;
$tgt('td').each((i, td) => {
  const html = $tgt(td).html() || '';
  const openCount = (html.match(/<span[\s>]/gi) || []).length;
  const closeCount = (html.match(/<\/span>/gi) || []).length;
  if (openCount !== closeCount) {
    tdUnclosedSpanCount++;
    if (tdUnclosedSpanCount <= 10) {
      console.log(`TD #${i} <span> mismatch: open=${openCount}, close=${closeCount}`);
      console.log(`   HTML snippet: ${html.substring(0, 150)}`);
    }
  }
});
console.log(`Total TD cells in target with mismatched <span>: ${tdUnclosedSpanCount}`);
