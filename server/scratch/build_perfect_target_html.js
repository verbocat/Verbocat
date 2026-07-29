const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';
const outPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html'; // Overwrite target file with perfect version!

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
// Backup original target before running if needed or read from backup
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

console.log(`Processing ${srcLeafs.length} leaf nodes...`);

srcLeafs.forEach((srcEl, i) => {
  const tgtEl = tgtLeafs[i];
  if (!tgtEl) return;

  const $srcEl = $src(srcEl);
  const $tgtEl = $tgt(tgtEl);

  // We want to replace text in $srcEl with translated text from $tgtEl,
  // while preserving ALL tags in $srcEl (b, span, img, br, etc.) exactly as they are.

  const srcFormattingTags = $srcEl.find('b, span, i, u, strong, em, a');
  const tgtFormattingTags = $tgtEl.find('b, span, i, u, strong, em, a');

  if (srcFormattingTags.length > 0) {
    // 1. Update text inside formatting tags (e.g. <b>, <span>)
    srcFormattingTags.each((tagIdx, sTag) => {
      const $sTag = $src(sTag);
      const sTagName = sTag.name.toLowerCase();

      // Find corresponding tag in target
      let $tTag = $tgtEl.find(sTagName).eq(tagIdx);
      if (!$tTag.length) {
        $tTag = $tgtEl.find(sTagName).first();
      }

      if ($tTag.length) {
        const txt = $tTag.text().trim();
        if (txt) {
          $sTag.text(txt);
        }
      }
    });
  }

  // 2. Update direct text nodes in $srcEl
  const tgtDirectTexts = [];
  $tgtEl.contents().each((_, child) => {
    if (child.type === 'text' && child.data.trim()) {
      tgtDirectTexts.push(child.data);
    }
  });

  let textNodeIdx = 0;
  $srcEl.contents().each((_, child) => {
    if (child.type === 'text' && child.data.trim()) {
      if (textNodeIdx < tgtDirectTexts.length) {
        child.data = tgtDirectTexts[textNodeIdx];
        textNodeIdx++;
      } else if (tgtDirectTexts.length > 0) {
        // Use full text if single text node
        if ($srcEl.contents().length === 1 && $tgtEl.text().trim()) {
          child.data = $tgtEl.text().trim();
        }
      }
    }
  });

  // If $srcEl had only 1 text node or simple structure and wasn't updated by direct text nodes:
  if ($srcEl.find('b, span, i, u, strong, em, a').length === 0) {
    // Replace text nodes, keeping any img/br tags untouched
    const srcTextNodes = [];
    $srcEl.contents().each((_, child) => {
      if (child.type === 'text') srcTextNodes.push(child);
    });

    if (srcTextNodes.length > 0) {
      const fullTgtText = $tgtEl.text().trim();
      if (fullTgtText) {
        // Set first text node to fullTgtText and empty remaining text nodes
        srcTextNodes[0].data = fullTgtText;
        for (let k = 1; k < srcTextNodes.length; k++) {
          srcTextNodes[k].data = '';
        }
      }
    }
  }
});

// Write output HTML
const perfectHtml = $src.html();
fs.writeFileSync(outPath, perfectHtml, 'utf-8');
console.log(`Successfully generated perfect HTML at ${outPath}`);
console.log(`Output byte size: ${perfectHtml.length}`);
