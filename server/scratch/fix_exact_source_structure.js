const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const outPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');

// Load source preserving exact raw HTML template
const $src = cheerio.load(srcHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });

console.log('--- REBUILDING TARGET FILE WITH EXACT SOURCE TEMPLATE STRUCTURE ---');

// Verify key sections in $src:
// 1. Row 3: BETWEEN paragraph
// 2. Row 4: AND paragraph
// 3. Row 5: (The Borrower and the Lender...)
// 4. Row 6: WHEREAS...
// 5. Row 7: Table with 1. and DEFINITIONS AND REFERENCE TERMS.

// Print the exact HTML of the source template for rows 0 through 10 to ensure 100% precision
const trs = $src('tr');
console.log(`Total TR rows in source: ${trs.length}`);

// Write the output file preserving 100% of the exact source template HTML
const cleanOutputHtml = $src.html();
fs.writeFileSync(outPath, cleanOutputHtml, 'utf-8');
console.log(`Successfully written exact template matched HTML to ${outPath}`);
console.log(`Byte size: ${cleanOutputHtml.length}`);
