const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

const $src = cheerio.load(srcHtml, { decodeEntities: false });
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false });

console.log('=== CHECKING TD CELLS WITH CLASS number-col / first-col / second-col / third-col ===');

let longNumColInSrc = 0;
let longNumColInTgt = 0;

$src('td').each((i, td) => {
  const cls = $src(td).attr('class') || '';
  const text = $src(td).text().trim();
  if (cls.includes('number-col') || cls.includes('first-col')) {
    if (text.length > 10) {
      longNumColInSrc++;
    }
  }
});

$tgt('td').each((i, td) => {
  const cls = $tgt(td).attr('class') || '';
  const text = $tgt(td).text().trim();
  if (cls.includes('number-col') || cls.includes('first-col')) {
    if (text.length > 10) {
      longNumColInTgt++;
      if (longNumColInTgt <= 15) {
        console.log(`TARGET TD #${i} (class="${cls}") has LONG text (${text.length} chars):`);
        console.log(`   Text: "${text.substring(0, 120)}..."`);
        console.log(`   SOURCE TD #${i} text: "${$src('td').eq(i).text().trim().substring(0, 120)}..."`);
        console.log('---');
      }
    }
  }
});

console.log(`Total number-col/first-col cells with >10 chars in SOURCE: ${longNumColInSrc}`);
console.log(`Total number-col/first-col cells with >10 chars in TARGET: ${longNumColInTgt}`);

// Check specific section: "DEFINITIONS AND REFERENCE TERMS"
const srcDefIdx = srcHtml.indexOf('DEFINITIONS AND REFERENCE TERMS');
console.log('\n--- SECTION 1 TABLE CHECK ---');

$src('table').each((tIdx, tbl) => {
  const tblText = $src(tbl).text();
  if (tblText.includes('DEFINITIONS AND REFERENCE TERMS') || tblText.includes('Broken Period Interest')) {
    console.log(`Source Table #${tIdx} rows: ${$src(tbl).find('tr').length}`);
    $src(tbl).find('tr').slice(0, 10).each((rIdx, tr) => {
      const tds = $src(tr).find('td, th');
      console.log(`  Src Row ${rIdx}: ${tds.length} cells`);
      tds.each((cIdx, c) => {
        console.log(`    Cell ${cIdx} [${$src(c).attr('class') || 'no-class'}]: "${$src(c).text().trim().substring(0, 50)}"`);
      });
    });

    const tgtTbl = $tgt('table').get(tIdx);
    if (tgtTbl) {
      console.log(`Target Table #${tIdx} rows: ${$tgt(tgtTbl).find('tr').length}`);
      $tgt(tgtTbl).find('tr').slice(0, 10).each((rIdx, tr) => {
        const tds = $tgt(tr).find('td, th');
        console.log(`  Tgt Row ${rIdx}: ${tds.length} cells`);
        tds.each((cIdx, c) => {
          console.log(`    Cell ${cIdx} [${$tgt(c).attr('class') || 'no-class'}]: "${$tgt(c).text().trim().substring(0, 50)}"`);
        });
      });
    }
  }
});
