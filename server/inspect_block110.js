const fs = require('fs');
const cheerio = require('cheerio');

const filePath = 'C:\\Users\\divya\\Downloads\\SCUBL_LOAN_AGREEMENT_PROD.html';
const html = fs.readFileSync(filePath, 'utf-8');

const $ = cheerio.load(html, {
  _useHtmlParser2: true,
  withStartIndices: true,
  withEndIndices: true,
  decodeEntities: false,
});

const htmlParser = require('./src/utils/parsers/htmlParser');

// Modify test to log block 110
const textBlocks = htmlParser.findAllTextBlocks($, html);
const b110 = textBlocks[110];
console.log("Block 110 type:", b110.type);
console.log("Block 110 innerStart:", b110.innerStart, "innerEnd:", b110.innerEnd);
console.log("Block 110 HTML substring:\n", html.substring(b110.innerStart, Math.min(html.length, b110.innerStart + 500)));
