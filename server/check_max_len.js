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

const textBlocks = htmlParser.findAllTextBlocks($, html);
console.log("Found text blocks:", textBlocks.length);

let maxLen = 0;
let maxIdx = -1;
textBlocks.forEach((block, idx) => {
  const len = block.innerEnd - block.innerStart;
  if (len > maxLen) {
    maxLen = len;
    maxIdx = idx;
  }
});

console.log(`Max block index: ${maxIdx}, inner length: ${maxLen} characters`);
if (maxIdx !== -1) {
  const b = textBlocks[maxIdx];
  console.log("Max block type:", b.type);
  console.log("Snippet:", html.substring(b.innerStart, Math.min(html.length, b.innerStart + 300)));
}
