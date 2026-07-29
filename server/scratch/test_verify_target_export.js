const fs = require('fs');
const cheerio = require('cheerio');
const { parseFile, exportFile } = require('../src/utils/parsers/htmlParser');

(async () => {
  const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_LOAN_AGREEMENT_PROD.html';
  const origHtml = fs.readFileSync(srcPath, 'utf-8');

  const result = await parseFile(srcPath);

  // Identity export: source text as target
  const identitySegs = result.segments.map(s => ({
    ...s,
    target: s.source
  }));

  const exportedBuf = await exportFile(result.template, identitySegs);
  const exportedHtml = exportedBuf.toString('utf-8');

  // Compare structural elements
  const $src = cheerio.load(origHtml, { decodeEntities: false });
  const $exp = cheerio.load(exportedHtml, { decodeEntities: false });

  console.log('=== STRUCTURAL ELEMENT COUNT COMPARISON ===');
  console.log('Tables: original =', $src('table').length, 'exported =', $exp('table').length);
  console.log('TRs:    original =', $src('tr').length, 'exported =', $exp('tr').length);
  console.log('TDs:    original =', $src('td').length, 'exported =', $exp('td').length);
  console.log('Ps:     original =', $src('p').length, 'exported =', $exp('p').length);
  console.log('Divs:   original =', $src('div').length, 'exported =', $exp('div').length);
  console.log('Imgs:   original =', $src('img').length, 'exported =', $exp('img').length);
  console.log('Styles: original =', $src('style').length, 'exported =', $exp('style').length);

  // Verify PFL/Loan Agreement text in exported HTML
  const pflFound = exportedHtml.includes('PFL/Loan Agreement - UBL/ Jan_26/v.2');
  console.log('\n"PFL/Loan Agreement - UBL/ Jan_26/v.2" in exported HTML:', pflFound ? 'EXACT MATCH FOUND' : 'FAILED');

})().catch(console.error);
