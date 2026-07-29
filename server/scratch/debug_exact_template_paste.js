const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

const $src = cheerio.load(srcHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });

console.log('--- INSPECTING SOURCE TD STRUCTURE (FIRST 20 TRs) ---');

let tdCounter = 0;
$src('tr').slice(0, 20).each((rIdx, tr) => {
  const tds = $src(tr).children('td, th');
  console.log(`Row #${rIdx} (${tds.length} cells):`);
  tds.each((cIdx, td) => {
    const cls = $src(td).attr('class') || '';
    const txt = $src(td).text().trim().replace(/\s+/g, ' ').substring(0, 100);
    console.log(`  Cell #${cIdx} [class="${cls}"]: "${txt}"`);
    tdCounter++;
  });
});
