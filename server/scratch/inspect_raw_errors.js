const fs = require('fs');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

console.log('--- TARGET RAW SNIPPET at index 5800..6100 ---');
console.log(tgtHtml.substring(5800, 6100));

console.log('\n--- TARGET RAW SNIPPET at index 6350..6600 ---');
console.log(tgtHtml.substring(6350, 6600));

console.log('\n--- TARGET RAW SNIPPET at index 7000..7200 ---');
console.log(tgtHtml.substring(7000, 7200));

// Find where "SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html" differs from source in structure
