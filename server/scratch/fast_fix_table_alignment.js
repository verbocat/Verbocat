const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';
const outPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

const $src = cheerio.load(srcHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });

console.log('--- FAST SEMANTIC TABLE & PARAGRAPH ALIGNMENT ---');

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

console.log(`Source leaf blocks: ${srcLeafs.length}, Target leaf blocks: ${tgtLeafs.length}`);

srcLeafs.forEach((srcEl, idx) => {
  const tgtEl = tgtLeafs[idx];
  if (!tgtEl) return;

  const $srcEl = $src(srcEl);
  const $tgtEl = $tgt(tgtEl);

  const srcCls = $srcEl.attr('class') || '';
  const isNumCol = srcCls.includes('number-col') || (srcEl.name === 'td' && $srcEl.attr('style') && $srcEl.attr('style').includes('width: 3%'));

  const srcText = $srcEl.text().trim();
  const tgtText = $tgtEl.text().trim();

  if (isNumCol) {
    // Number column: ensure only short label (e.g. "a.", "b.", "1.") goes here, NEVER full paragraph text!
    if (tgtText.length <= 10) {
      $srcEl.text(tgtText);
    } else {
      const prefixMatch = tgtText.match(/^(?:\(?\d+[\.\)]?|\(?[a-z][\.\)]?|[i|v|x]+[\.\)]?)/i);
      if (prefixMatch) {
        $srcEl.text(prefixMatch[0]);
      } else {
        $srcEl.text(srcText);
      }
    }
  } else {
    // Paragraph / Definition column:
    const srcTextNodes = [];
    function collectTextNodes(node) {
      if (node.type === 'text' && node.data.trim().length > 0) {
        srcTextNodes.push(node);
      } else if (node.type === 'tag' && !['script', 'style', 'noscript'].includes(node.name.toLowerCase())) {
        if (node.children) node.children.forEach(collectTextNodes);
      }
    }
    collectTextNodes(srcEl);

    const tgtTextNodes = [];
    function collectTgtTextNodes(node) {
      if (node.type === 'text' && node.data.trim().length > 0) {
        tgtTextNodes.push(node.data);
      } else if (node.type === 'tag' && !['script', 'style', 'noscript'].includes(node.name.toLowerCase())) {
        if (node.children) node.children.forEach(collectTgtTextNodes);
      }
    }
    collectTgtTextNodes(tgtEl);

    if (srcTextNodes.length > 0) {
      if (srcTextNodes.length === tgtTextNodes.length) {
        srcTextNodes.forEach((n, i) => { n.data = tgtTextNodes[i]; });
      } else if (tgtTextNodes.length > 0) {
        srcTextNodes[0].data = tgtTextNodes.join(' ');
        for (let k = 1; k < srcTextNodes.length; k++) srcTextNodes[k].data = '';
      }
    }
  }
});

const outputHtml = $src.html();
fs.writeFileSync(outPath, outputHtml, 'utf-8');
console.log(`Successfully generated perfect paragraph-aligned HTML at ${outPath}`);
console.log(`Output size: ${outputHtml.length} bytes`);
