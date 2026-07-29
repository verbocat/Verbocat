const fs = require('fs');

const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

const idx = tgtHtml.indexOf('LOAN AGREEMENT');
console.log('--- OUTPUT TARGET HTML SNIPPET AROUND LOAN AGREEMENT ---');
console.log(tgtHtml.substring(idx - 100, idx + 2500));
