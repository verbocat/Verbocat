const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
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

console.log(`Source leaf nodes count: ${srcLeafs.length}`);
console.log(`Target leaf nodes count: ${tgtLeafs.length}`);

// Test aligning leaf nodes
let aligned = 0;
let total = Math.min(srcLeafs.length, tgtLeafs.length);

for (let i = 0; i < total; i++) {
  const srcEl = srcLeafs[i];
  const tgtEl = tgtLeafs[i];

  const $srcEl = $src(srcEl);
  const $tgtEl = $tgt(tgtEl);

  const srcText = $srcEl.text().trim();
  const tgtText = $tgtEl.text().trim();

  if (srcText && tgtText) {
    aligned++;
  }
}

console.log(`Aligned non-empty leaf nodes: ${aligned} / ${total}`);
