const fs = require('fs');
const cheerio = require('cheerio');

const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false });

console.log('--- TABLE #2 EXACT ROWS & CONTENT ---');
const tbl2 = $tgt('table').eq(2);
console.log(`Table #2 total rows: ${tbl2.find('tr').length}`);

tbl2.find('tr').each((rIdx, tr) => {
  const tds = $tgt(tr).find('td, th');
  console.log(`Row ${rIdx}: ${tds.length} cells`);
  tds.each((cIdx, c) => {
    console.log(`   Cell ${cIdx} [class="${$tgt(c).attr('class') || ''}"]: "${$tgt(c).text().trim()}"`);
  });
});
