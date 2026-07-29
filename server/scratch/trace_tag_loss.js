const fs = require('fs');
const cheerio = require('cheerio');
const { parseFile } = require('../src/utils/parsers/htmlParser');

(async () => {
  const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
  const { segments, template } = await parseFile(srcPath);

  // Find segments containing "AND" or "One Part" or "Borrower"
  const andSegs = segments.filter(s => s.source.includes('AND') || s.source.includes('One Part'));
  console.log('--- SEGMENTS FOUND FOR "One Part" / "AND" ---');
  console.dir(andSegs, { depth: null });

})();
