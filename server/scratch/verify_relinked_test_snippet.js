const fs = require('fs');

const relinkedPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa_RELINKED_TEST.html';
const relinkedHtml = fs.readFileSync(relinkedPath, 'utf-8');

const idx = relinkedHtml.indexOf('LOAN AGREEMENT');
console.log('--- RELINKED TEST OUTPUT HTML SNIPPET AROUND LOAN AGREEMENT ---');
console.log(relinkedHtml.substring(Math.max(0, idx - 100), idx + 2500));
