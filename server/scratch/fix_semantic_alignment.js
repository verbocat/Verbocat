const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';
const outPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

const $src = cheerio.load(srcHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });

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

// We perform semantic key-matching for leaf blocks where possible (e.g. Table #2 items a. through v.)
srcLeafs.forEach((srcEl, idx) => {
  const $srcEl = $src(srcEl);
  const srcText = $srcEl.text().trim();
  const srcCls = $srcEl.attr('class') || '';

  const isNumCol = srcCls.includes('number-col') || (srcEl.name === 'td' && $srcEl.attr('style') && $srcEl.attr('style').includes('width: 3%'));

  if (isNumCol) {
    // Keep exact number column label ("a.", "b.", "1.", etc.)
    return;
  }

  // Find best matching target leaf
  let tgtEl = tgtLeafs[idx];

  // Check if srcText starts with specific item keys (e.g. "a. “Application Form”", "b. “Broken Period Interest”")
  // In source, Table #2 items are formatted as:
  // srcText: "“Application Form” means..."
  // srcText: "“Broken Period Interest” means..."
  // srcText: "“Borrower” means..."
  if (srcText.includes('Application Form')) {
    // Find target leaf containing "Application Form" or first item
    const match = tgtLeafs.find(el => $tgt(el).text().includes('Application Form') || $tgt(el).text().toLowerCase().includes('application'));
    if (match) tgtEl = match;
  } else if (srcText.includes('Broken Period Interest')) {
    const match = tgtLeafs.find(el => $tgt(el).text().includes('Broken Period Interest') || $tgt(el).text().toLowerCase().includes('broken period'));
    if (match) tgtEl = match;
  } else if (srcText.includes('Borrower” means') || srcText.includes('Borrower means')) {
    const match = tgtLeafs.find(el => $tgt(el).text().includes('Borrower') && $tgt(el).text().includes('means'));
    if (match) tgtEl = match;
  } else if (srcText.includes('DEFINITIONS AND REFERENCE TERMS')) {
    const match = tgtLeafs.find(el => $tgt(el).text().includes('DEFINITIONS AND REFERENCE TERMS'));
    if (match) tgtEl = match;
  }

  if (!tgtEl) return;

  const $tgtEl = $tgt(tgtEl);
  const tgtText = $tgtEl.text().trim();

  // Update text nodes inside srcEl, preserving 100% of HTML tags (b, span, img, br)
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
});

const outputHtml = $src.html();
fs.writeFileSync(outPath, outputHtml, 'utf-8');
console.log(`Successfully generated semantic-aligned HTML at ${outPath}`);
console.log(`Output size: ${outputHtml.length} bytes`);
