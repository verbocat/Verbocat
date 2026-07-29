const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
// Read the ORIGINAL uploaded target file to see how text was ordered in target!
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

const $src = cheerio.load(srcHtml, { decodeEntities: false });
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false });

const BLOCK_TAGS = [
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "blockquote", 
  "section", "article", "nav", "header", "footer", "figcaption", "address", "main",
  "caption", "dt", "dd"
];

function getLeafNodes($) {
  const leafNodes = [];
  function traverse(el) {
    const $el = $(el);
    const tagName = el.name ? el.name.toLowerCase() : '';
    if (['script', 'style', 'noscript', 'svg', 'canvas'].includes(tagName)) return;

    let hasBlockChild = false;
    $el.children().each((_, child) => {
      const childTag = child.name ? child.name.toLowerCase() : '';
      if (BLOCK_TAGS.includes(childTag)) {
        hasBlockChild = true;
      }
    });

    const isBlock = BLOCK_TAGS.includes(tagName);
    const hasText = $el.text().trim().length > 0;

    if (isBlock && hasText && !hasBlockChild) {
      leafNodes.push(el);
    } else {
      $el.children().each((_, child) => {
        if (child.type === 'tag') {
          traverse(child);
        }
      });
    }
  }

  $('body').children().each((_, child) => {
    if (child.type === 'tag') traverse(child);
  });

  return leafNodes;
}

const srcLeafs = getLeafNodes($src);
const tgtLeafs = getLeafNodes($tgt);

console.log(`Source leaf count: ${srcLeafs.length}, Target leaf count: ${tgtLeafs.length}`);

for (let i = 0; i < 40; i++) {
  const srcText = $src(srcLeafs[i]).text().trim().replace(/\s+/g, ' ').substring(0, 60);
  const tgtText = $tgt(tgtLeafs[i]).text().trim().replace(/\s+/g, ' ').substring(0, 60);
  console.log(`[Leaf #${i}]`);
  console.log(`  SRC: (${srcLeafs[i].name}) "${srcText}"`);
  console.log(`  TGT: (${tgtLeafs[i] ? tgtLeafs[i].name : 'none'}) "${tgtText}"`);
  console.log('---');
}
