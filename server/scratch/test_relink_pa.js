const fs = require('fs');
const { relinkTargetDocument } = require('../src/utils/parsers/relinkEngine');

(async () => {
  const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
  const paPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa.html';

  if (fs.existsSync(paPath)) {
    console.log('Running relinkTargetDocument on SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html and SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa.html...');
    const resultBuf = await relinkTargetDocument(srcPath, paPath);
    const resultHtml = resultBuf.toString('utf-8');
    fs.writeFileSync('C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa_FIXED_TEST.html', resultHtml);
    console.log('Wrote output to SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa_FIXED_TEST.html');
  } else {
    console.log('paPath does not exist:', paPath);
  }
})();
