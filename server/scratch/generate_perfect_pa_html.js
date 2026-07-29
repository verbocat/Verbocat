const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';
const outPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html'; // Write directly to requested output file location!

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

// Load source preserving full raw HTML template
const $src = cheerio.load(srcHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });

// Extract all text content from source and target leaf blocks / text nodes
// To align accurately, let's map text content block-by-block or cell-by-cell in tables and paragraphs.

console.log('Analyzing tables in source vs target...');
const srcTables = $src('table');
const tgtTables = $tgt('table');
console.log(`Source tables: ${srcTables.length}, Target tables: ${tgtTables.length}`);

// Map cells by table index, row index, cell index
let replacedCells = 0;
let emptyCells = 0;

$src('td, th').each((idx, srcTd) => {
  const $srcTd = $src(srcTd);
  const tgtTd = $tgt('td, th').get(idx);

  if (!tgtTd) return;

  const $tgtTd = $tgt(tgtTd);

  const srcText = $srcTd.text().trim();
  const tgtText = $tgtTd.text().trim();

  if (!srcText && !tgtText) return;

  // If target cell has translated text, replace text nodes inside srcTd while preserving exact src inner tag structure!
  // Let's check how srcTd and tgtTd are structured:
  const srcChildTags = $srcTd.find('*').length;
  const tgtChildTags = $tgtTd.find('*').length;

  if (srcChildTags === 0 && tgtChildTags === 0) {
    // Simple text node replacement!
    if (tgtText) {
      $srcTd.text($tgtTd.text());
      replacedCells++;
    }
  } else {
    // Cell contains child tags (like <b>, <span>, <br>, <img>, etc.)
    // We map text nodes or inner html while preserving images and exact tags!
    // If child tags match (e.g. <b>Text</b>), update inner text of matching tags!
    const srcChildren = $srcTd.contents();
    const tgtChildren = $tgtTd.contents();

    // Map each child node in srcTd to corresponding child node in tgtTd
    srcChildren.each((cIdx, srcChild) => {
      if (srcChild.type === 'text') {
        const sTxt = $src(srcChild).text();
        if (sTxt.trim()) {
          // Find matching text node in tgtTd
          const matchingTgtText = findMatchingTextNode($tgtTd, cIdx, sTxt);
          if (matchingTgtText) {
            srcChild.data = matchingTgtText;
            replacedCells++;
          }
        }
      } else if (srcChild.type === 'tag') {
        const tagName = srcChild.name.toLowerCase();
        if (tagName !== 'img' && tagName !== 'br' && tagName !== 'input') {
          // For tags like <b>, <span>, <p>, <div>, update text from target matching tag or position
          const tgtChild = $tgtTd.find(tagName).get(cIdx) || $tgtTd.find(tagName).first().get(0);
          if (tgtChild) {
            const tgtChildText = $tgt(tgtChild).text();
            if (tgtChildText.trim()) {
              $src(srcChild).text(tgtChildText);
              replacedCells++;
            }
          }
        }
      }
    });
  }
});

function findMatchingTextNode($parent, index, origText) {
  const textNodes = [];
  $parent.contents().each((_, el) => {
    if (el.type === 'text' && el.data.trim()) {
      textNodes.push(el.data);
    }
  });
  if (textNodes[index]) return textNodes[index];
  if (textNodes.length > 0) return textNodes[0];
  return null;
}

console.log(`Replaced cell content count: ${replacedCells}`);
