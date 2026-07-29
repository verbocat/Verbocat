const fs = require('fs');
const cheerio = require('cheerio');

// Let's check original backup or original uploaded target file
const paPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';
const paHtml = fs.readFileSync(paPath, 'utf-8');
const $pa = cheerio.load(paHtml, { decodeEntities: false });

console.log('--- PUNJABI TEXT SNIPPETS AUDIT ---');

const gurmukhiRegex = /[\u0A00-\u0A7F]/g;

let gurmukhiCount = 0;
let totalBlocks = 0;

$pa('td, p, div, li, span').each((i, el) => {
  const txt = $pa(el).text().trim();
  totalBlocks++;
  if (gurmukhiRegex.test(txt)) {
    gurmukhiCount++;
    if (gurmukhiCount <= 15) {
      console.log(`[Punjabi Block #${gurmukhiCount}] "${txt.substring(0, 120)}..."`);
    }
  }
});

console.log(`Total blocks: ${totalBlocks}, Blocks containing Gurmukhi (Punjabi): ${gurmukhiCount}`);
