const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_LOAN_AGREEMENT_PROD.html';
const origHtml = fs.readFileSync(srcPath, 'utf-8');

const $ = cheerio.load(origHtml, { decodeEntities: false });

console.log('Original tables:', (origHtml.match(/<table/gi) || []).length, 'Cheerio tables:', $('table').length);
console.log('Original imgs:', (origHtml.match(/<img/gi) || []).length, 'Cheerio imgs:', $('img').length);
console.log('Original styles:', (origHtml.match(/<style/gi) || []).length, 'Cheerio styles:', $('style').length);
