const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';
const outPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

const $src = cheerio.load(srcHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });

console.log('--- REBUILDING TARGET USING EXACT SOURCE DOM TEMPLATE ---');

const BLOCK_TAGS = [
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "blockquote", 
  "section", "article", "nav", "header", "footer", "figcaption", "address", "main",
  "caption", "dt", "dd"
];

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

console.log(`Source leaf count: ${srcLeafs.length}, Target leaf count: ${tgtLeafs.length}`);

// Map target text to source leaf blocks
srcLeafs.forEach((srcEl, idx) => {
  const $srcEl = $src(srcEl);
  const srcCls = $srcEl.attr('class') || '';
  const isNumCol = srcCls.includes('number-col') || (srcEl.name === 'td' && $srcEl.attr('style') && $srcEl.attr('style').includes('width: 3%'));

  if (isNumCol) {
    // Number columns (<td class="number-col">): ALWAYS KEEP EXACT SOURCE LABEL ("1.", "a.", "b.", "c.", "(i)", etc.)
    // NEVER overwrite number-col with paragraph text!
    return;
  }

  // Find matching target leaf
  const tgtEl = tgtLeafs[idx];
  if (!tgtEl) return;

  const $tgtEl = $tgt(tgtEl);
  const tgtText = $tgtEl.text().trim();

  if (!tgtText) return;

  // Replace text nodes inside srcEl while keeping ALL tags (b, span, img, br, style, class) 100% untouched
  const srcTextNodes = [];
  function collectTextNodes(node) {
    if (node.type === 'text' && node.data.trim().length > 0) {
      srcTextNodes.push(node);
    } else if (node.type === 'tag' && !['script', 'style', 'noscript'].includes(node.name.toLowerCase())) {
      if (node.children) node.children.forEach(collectTextNodes);
    }
  }
  collectTextNodes(srcEl);

  if (srcTextNodes.length > 0) {
    srcTextNodes[0].data = tgtText;
    for (let k = 1; k < srcTextNodes.length; k++) {
      srcTextNodes[k].data = '';
    }
  }
});

const outputHtml = $src.html();
fs.writeFileSync(outPath, outputHtml, 'utf-8');
console.log(`Successfully generated target HTML with exact source template at ${outPath}`);
console.log(`Byte size: ${outputHtml.length}`);
