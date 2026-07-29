const fs = require('fs');
const cheerio = require('cheerio');
const { parseFile } = require('../src/utils/parsers/htmlParser');

(async () => {
  const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
  const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

  const { segments: srcSegments, template } = await parseFile(srcPath);

  // Parse target file to see how text in target maps to source segments
  console.log(`Source segments count: ${srcSegments.length}`);

  // Let's inspect source segment 5 details:
  console.log('\n--- SOURCE SEGMENT 5 ---');
  console.log('source:', JSON.stringify(srcSegments[4].source));
  console.log('leading:', JSON.stringify(srcSegments[4].leading));
  console.log('trailing:', JSON.stringify(srcSegments[4].trailing));

})();
