const fs = require('fs');
const cheerio = require('cheerio');
const { extractPlaceholders, splitByPunctuation } = require('./src/utils/parsers/segmentationUtils');
const { getLeafTextBlocks } = require('./src/utils/parsers/relinkEngine');

const srcHtml = fs.readFileSync('../client/src/testing/source.html', 'utf-8');
const $src = cheerio.load(srcHtml, { decodeEntities: false });

const leafBlocks = getLeafTextBlocks($src);
const block137 = leafBlocks[137];

const tagMapGlobal = new Map();
const tagCounter = { value: 1 };
const placeholderStr = extractPlaceholders(block137, $src, tagMapGlobal, tagCounter);

console.log('=== PLACEHOLDER STR FOR BLOCK 137 ===');
console.log(JSON.stringify(placeholderStr));

const subSegs = splitByPunctuation(placeholderStr);
console.log('\n=== SUBSEGMENTS PRODUCED BY splitByPunctuation ===');
subSegs.forEach((s, idx) => console.log(idx, JSON.stringify(s)));
