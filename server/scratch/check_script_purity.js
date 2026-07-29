const fs = require('fs');
const html = fs.readFileSync('C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html', 'utf-8');

const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
const devanagariRegex = /[\u0900-\u097F]/g;
const cyrillicRegex = /[\u0400-\u04FF]/g;

const arabicMatches = html.match(arabicRegex) || [];
const devanagariMatches = html.match(devanagariRegex) || [];
const cyrillicMatches = html.match(cyrillicRegex) || [];

console.log(`Script Leakage Audit:`);
console.log(`  Perso-Arabic matches: ${arabicMatches.length}`);
console.log(`  Devanagari matches: ${devanagariMatches.length}`);
console.log(`  Cyrillic matches: ${cyrillicMatches.length}`);
