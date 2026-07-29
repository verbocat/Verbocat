const fs = require('fs');
const { processRelinkDualFiles } = require('../src/utils/parsers/relinkEngine');
const { exportFile } = require('../src/utils/parsers/htmlParser');

(async () => {
  const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
  const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

  console.log('Running processRelinkDualFiles...');
  const relinkResult = await processRelinkDualFiles(srcPath, tgtPath);
  console.log('Relinked segments count:', relinkResult.segments.length);

  const exportedBuf = await exportFile(relinkResult.template, relinkResult.segments);
  const exportedHtml = exportedBuf.toString('utf-8');

  const outputPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa_RELINKED_TEST.html';
  fs.writeFileSync(outputPath, exportedHtml);
  console.log(`Wrote relinked output to ${outputPath}`);
  console.log(`Output length: ${exportedHtml.length} bytes`);
})();
