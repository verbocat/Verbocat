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

// Clean leaf block extractor: Treat each td, th, p, li, h1-h6 as an atomic block without virtual div wrapping!
function getAtomicLeafBlocks($) {
  const leafBlocks = [];
  function traverse(node) {
    if (!node) return false;
    if (node.type === 'tag') {
      const tagName = node.name.toLowerCase();
      if (['script', 'style', 'noscript', 'svg', 'canvas'].includes(tagName)) return false;
    }
    if (node.type === 'text') {
      return node.data.trim().length > 0;
    }

    let hasText = false;
    let hasDescendantBlock = false;

    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const isChildBlock = child.type === 'tag' && BLOCK_TAGS.includes(child.name.toLowerCase());
        const childHasText = traverse(child);
        if (childHasText) hasText = true;
        if (isChildBlock && childHasText) hasDescendantBlock = true;
      }
    }

    const isThisBlock = node.type === 'tag' && BLOCK_TAGS.includes(node.name.toLowerCase());
    if (isThisBlock && hasText && !hasDescendantBlock) {
      leafBlocks.push(node);
    }

    return hasText;
  }

  const root = $('body').length > 0 ? $('body')[0] : $.root()[0];
  traverse(root);
  return leafBlocks;
}

const srcLeafs = getAtomicLeafBlocks($src);
const tgtLeafs = getAtomicLeafBlocks($tgt);

console.log(`Source atomic leaf blocks: ${srcLeafs.length}`);
console.log(`Target atomic leaf blocks: ${tgtLeafs.length}`);

// Compare first 20 atomic leaf blocks
console.log('\n--- ATOMIC LEAF BLOCK COMPARISON ---');
const total = Math.min(srcLeafs.length, tgtLeafs.length);
for (let i = 0; i < 20; i++) {
  const sText = $src(srcLeafs[i]).text().trim().replace(/\s+/g, ' ').substring(0, 70);
  const tText = $tgt(tgtLeafs[i]).text().trim().replace(/\s+/g, ' ').substring(0, 70);
  console.log(`[Block #${i}]`);
  console.log(`  SRC (${srcLeafs[i].name}): "${sText}"`);
  console.log(`  TGT (${tgtLeafs[i].name}): "${tText}"`);
  console.log('---');
}
