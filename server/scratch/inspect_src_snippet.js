const fs = require('fs');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const srcHtml = fs.readFileSync(srcPath, 'utf-8');

const idx = srcHtml.indexOf('One Part');
console.log('--- SOURCE RAW SNIPPET around "One Part" ---');
console.log(srcHtml.substring(Math.max(0, idx - 100), idx + 300));
