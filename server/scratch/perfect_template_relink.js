const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';
const outPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

const $src = cheerio.load(srcHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });

console.log('--- REBUILDING TARGET USING EXACT SOURCE HTML TEMPLATE ---');

// Extract all Punjabi text blocks from target file with semantic keys
const targetBlocks = [];
$tgt('td, p, div, li, h1, h2, h3, h4, h5, h6').each((_, el) => {
  const text = $tgt(el).text().trim().replace(/\s+/g, ' ');
  if (text.length > 0) {
    targetBlocks.push(text);
  }
});

console.log(`Total target text snippets available: ${targetBlocks.length}`);

// Helper to find best matching Punjabi text block for a source section/paragraph
function findTargetText(sourceSnippet, fallbackIndex) {
  const sLower = sourceSnippet.toLowerCase().trim();

  // Semantic keyword match rules
  if (sLower.includes('between the lender')) {
    const match = targetBlocks.find(t => t.toLowerCase().includes('lender') || t.includes('ਲੈਂਡਰ') || t.includes('BETWEEN') || t.includes('ਵਿਚਕਾਰ'));
    if (match) return match;
  }
  if (sLower.includes('and the borrower')) {
    const match = targetBlocks.find(t => t.toLowerCase().includes('borrower') || t.includes('ਬੋਰੋਅਰ') || t.includes('AND') || t.includes('ਅਤੇ'));
    if (match) return match;
  }
  if (sLower.includes('parties') && sLower.includes('party')) {
    const match = targetBlocks.find(t => t.includes('Parties') || t.includes('Party') || t.includes('ਧਿਰਾਂ') || t.includes('ਧਿਰ'));
    if (match) return match;
  }
  if (sLower.includes('whereas')) {
    const match = targetBlocks.find(t => t.includes('WHEREAS') || t.includes('ਜਦੋਂ ਕਿ'));
    if (match) return match;
  }
  if (sLower.includes('definitions and reference terms')) {
    const match = targetBlocks.find(t => t.includes('DEFINITIONS AND REFERENCE TERMS') || t.includes('ਪਰਿਭਾਸ਼ਾਵਾਂ'));
    if (match) return match;
  }
  if (sLower.includes('application form')) {
    const match = targetBlocks.find(t => t.includes('Application Form') || t.includes('ਐਪਲੀਕੇਸ਼ਨ ਫਾਰਮ'));
    if (match) return match;
  }
  if (sLower.includes('broken period interest')) {
    const match = targetBlocks.find(t => t.includes('Broken Period Interest') || t.includes('ਬਰੋਕਨ ਪੀਰੀਅਡ'));
    if (match) return match;
  }

  // General index fallback
  return targetBlocks[fallbackIndex] || '';
}

// Iterate over EVERY tr/td in $src and inject translated text into the EXACT source cell!
let cellIdxCounter = 0;
$src('tr').each((rIdx, tr) => {
  const tds = $src(tr).children('td, th');
  tds.each((cIdx, td) => {
    const $td = $src(td);
    const cls = $td.attr('class') || '';
    const srcText = $td.text().trim();

    if (!srcText) {
      cellIdxCounter++;
      return;
    }

    // Number columns (<td class="number-col">): KEEP EXACT LABEL ("1.", "a.", "b.", "c.", "(i)", etc.)
    if (cls.includes('number-col') || cls.includes('first-col') || /^(?:\(?\d+[\.\)]?|\(?[a-z][\.\)]?|[i|v|x]+[\.\)]?)$/i.test(srcText)) {
      // Do NOT replace number column text with long paragraph text!
      cellIdxCounter++;
      return;
    }

    // Paragraph / Definition cells:
    // Update text node content while preserving ALL inner HTML tags (b, span, img, br, style, class)
    const matchedTgtText = findTargetText(srcText, cellIdxCounter);

    const srcTextNodes = [];
    function collectTextNodes(node) {
      if (node.type === 'text' && node.data.trim().length > 0) {
        srcTextNodes.push(node);
      } else if (node.type === 'tag' && !['script', 'style', 'noscript'].includes(node.name.toLowerCase())) {
        if (node.children) node.children.forEach(collectTextNodes);
      }
    }
    collectTextNodes(td);

    if (srcTextNodes.length > 0) {
      if (matchedTgtText && matchedTgtText.length > 0) {
        srcTextNodes[0].data = matchedTgtText;
        for (let k = 1; k < srcTextNodes.length; k++) {
          srcTextNodes[k].data = '';
        }
      }
    }

    cellIdxCounter++;
  });
});

const outputHtml = $src.html();
fs.writeFileSync(outPath, outputHtml, 'utf-8');
console.log(`Successfully generated target HTML using exact source template at ${outPath}`);
console.log(`Byte size: ${outputHtml.length}`);
