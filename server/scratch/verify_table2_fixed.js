const fs = require('fs');
const cheerio = require('cheerio');

const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false });

console.log('=== VERIFYING TABLE #2 IN UPDATED TARGET FILE ===');

$tgt('table').each((tIdx, tbl) => {
  const txt = $tgt(tbl).text();
  if (txt.includes('Broken Period Interest') || txt.includes('Application Form') || txt.includes('DEFINITIONS AND REFERENCE TERMS')) {
    console.log(`Table #${tIdx} rows count: ${$tgt(tbl).find('tr').length}`);
    $tgt(tbl).find('tr').slice(0, 10).each((rIdx, tr) => {
      const tds = $tgt(tr).find('td, th');
      console.log(`  Row ${rIdx}: ${tds.length} cells`);
      tds.each((cIdx, c) => {
        console.log(`    Cell ${cIdx} [${$tgt(c).attr('class') || 'no-class'}]: "${$tgt(c).text().trim().substring(0, 60)}"`);
      });
    });
  }
});
