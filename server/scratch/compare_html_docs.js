const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_hi (2).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

const $src = cheerio.load(srcHtml);
const $tgt = cheerio.load(tgtHtml);

console.log('Source element counts:');
console.log('  tables:', $src('table').length);
console.log('  tr:', $src('tr').length);
console.log('  td:', $src('td').length);
console.log('  p:', $src('p').length);
console.log('  div:', $src('div').length);
console.log('  style tags:', $src('style').length);
console.log('  img:', $src('img').length);

console.log('\nTarget element counts:');
console.log('  tables:', $tgt('table').length);
console.log('  tr:', $tgt('tr').length);
console.log('  td:', $tgt('td').length);
console.log('  p:', $tgt('p').length);
console.log('  div:', $tgt('div').length);
console.log('  style tags:', $tgt('style').length);
console.log('  img:', $tgt('img').length);

// Compare CSS <style> content
const srcStyles = $src('style').map((_, el) => $src(el).html()).get().join('\n');
const tgtStyles = $tgt('style').map((_, el) => $tgt(el).html()).get().join('\n');
console.log('\nStyles length src:', srcStyles.length, 'tgt:', tgtStyles.length);
if (srcStyles !== tgtStyles) {
  console.log('WARNING: CSS styles differ between source and target!');
}
