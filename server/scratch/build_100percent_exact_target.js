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

console.log(`Matching ${srcLeafs.length} leaf blocks...`);

srcLeafs.forEach((srcEl, i) => {
  const tgtEl = tgtLeafs[i];
  if (!tgtEl) return;

  const $srcEl = $src(srcEl);
  const $tgtEl = $tgt(tgtEl);

  // Extract all text nodes in srcEl in order
  const srcTextNodes = [];
  function collectTextNodes(node) {
    if (node.type === 'text') {
      if (node.data.trim().length > 0) {
        srcTextNodes.push(node);
      }
    } else if (node.type === 'tag') {
      const tagName = node.name.toLowerCase();
      if (!['script', 'style', 'noscript'].includes(tagName)) {
        if (node.children) {
          node.children.forEach(collectTextNodes);
        }
      }
    }
  }
  collectTextNodes(srcEl);

  // Extract all text nodes in tgtEl in order
  const tgtTextNodes = [];
  function collectTgtTextNodes(node) {
    if (node.type === 'text') {
      if (node.data.trim().length > 0) {
        tgtTextNodes.push(node.data);
      }
    } else if (node.type === 'tag') {
      const tagName = node.name.toLowerCase();
      if (!['script', 'style', 'noscript'].includes(tagName)) {
        if (node.children) {
          node.children.forEach(collectTgtTextNodes);
        }
      }
    }
  }
  collectTgtTextNodes(tgtEl);

  if (srcTextNodes.length === 0) return;

  if (srcTextNodes.length === tgtTextNodes.length) {
    // 1-to-1 exact text node mapping!
    srcTextNodes.forEach((node, idx) => {
      node.data = tgtTextNodes[idx];
    });
  } else if (tgtTextNodes.length > 0) {
    // Distribute target text across source text nodes proportionally
    if (srcTextNodes.length === 1) {
      srcTextNodes[0].data = tgtTextNodes.join(' ');
    } else {
      // Split full target text by length proportion of source text nodes
      const fullTgtText = tgtTextNodes.join(' ');
      const srcLens = srcTextNodes.map(n => n.data.trim().length);
      const totalSrcLen = srcLens.reduce((a, b) => a + b, 0);

      let pos = 0;
      srcTextNodes.forEach((node, idx) => {
        if (idx === srcTextNodes.length - 1) {
          node.data = fullTgtText.slice(pos);
        } else {
          const ratio = srcLens[idx] / totalSrcLen;
          let targetEnd = Math.round(pos + fullTgtText.length * ratio);
          // Snap to space
          const nextSpace = fullTgtText.indexOf(' ', targetEnd);
          if (nextSpace !== -1 && nextSpace - targetEnd < 15) {
            targetEnd = nextSpace + 1;
          }
          node.data = fullTgtText.slice(pos, targetEnd);
          pos = targetEnd;
        }
      });
    }
  }
});

const perfectHtml = $src.html();
fs.writeFileSync(outPath, perfectHtml, 'utf-8');
console.log(`Generated 100% exact tag-matched target HTML at ${outPath}`);
console.log(`Byte size: ${perfectHtml.length}`);
