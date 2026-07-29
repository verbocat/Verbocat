const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';
const outPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

const $src = cheerio.load(srcHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });
const $tgt = cheerio.load(tgtHtml, { decodeEntities: false, lowerCaseTags: false, lowerCaseAttributeNames: false });

console.log('--- REPAIRING TABLE & LEAF ALIGNMENT ---');

// 1. Extract definitions a through v from target text
// In target, definitions were stored in various cells or target text nodes.
// Let's collect all target text strings for definitions a. through v.
const targetTextBlocks = [];
$tgt('td, p, div, li').each((_, el) => {
  const t = $tgt(el).text().trim().replace(/\s+/g, ' ');
  if (t) targetTextBlocks.push(t);
});

// Let's perform precise table-by-table cell matching between $src and $tgt
const srcTables = $src('table');
const tgtTables = $tgt('table');

console.log(`Source tables: ${srcTables.length}`);

// Map every table in $src
srcTables.each((tblIdx, srcTbl) => {
  const $srcTbl = $src(srcTbl);
  const srcRows = $srcTbl.find('tr');

  // Find corresponding table in target
  let $tgtTbl = $tgt(tgtTables.get(tblIdx));

  // Check if srcTbl is Table #2 (Definitions table with items a. to v.)
  const isDefinitionsTable = srcRows.length >= 15 && $srcTbl.text().includes('Application Form') || $srcTbl.text().includes('Broken Period Interest');

  if (isDefinitionsTable) {
    console.log(`Fixing Definitions Table (Table #${tblIdx}) with ${srcRows.length} rows...`);

    // In source, each row has cell 0 = "a.", cell 1 = definition text
    // Let's extract definition texts from target for items a. through v.
    srcRows.each((rIdx, tr) => {
      const tds = $src(tr).find('td, th');
      if (tds.length >= 2) {
        const itemLetter = $src(tds[0]).text().trim(); // e.g. "a.", "b.", "c."
        
        // Find translated definition for this item letter in target
        let targetDefText = '';

        // Look for target cell or block starting with itemLetter or definition text
        $tgt('*').each((_, el) => {
          const txt = $tgt(el).text().trim().replace(/\s+/g, ' ');
          if (!targetDefText) {
            // Match pattern like "a. means..." or "Application Form..." or matching letter
            const letterPrefix = itemLetter.toLowerCase();
            if (txt.toLowerCase().startsWith(letterPrefix + ' ') || txt.toLowerCase().startsWith(letterPrefix + '.')) {
              // Strip prefix letter if present
              targetDefText = txt;
            }
          }
        });

        // If found, update cell 1 in source row!
        if (targetDefText) {
          $src(tds[1]).text(targetDefText);
        }
      }
    });
  } else {
    // Standard table row & cell mapping
    if ($tgtTbl && $tgtTbl.length) {
      const tgtRows = $tgtTbl.find('tr');
      if (srcRows.length === tgtRows.length) {
        srcRows.each((rIdx, srcTr) => {
          const srcC = $src(srcTr).find('td, th');
          const tgtC = $tgt(tgtRows.get(rIdx)).find('td, th');

          if (srcC.length === tgtC.length) {
            srcC.each((cIdx, sTd) => {
              const tTd = tgtC.get(cIdx);
              const txt = $tgt(tTd).text().trim();
              if (txt) {
                // Update text of sTd while keeping inner tags intact
                const $sTd = $src(sTd);
                const sInline = $sTd.find('b, span, i, u, strong, em');
                if (sInline.length === 0) {
                  $sTd.text(txt);
                } else {
                  // If sTd has inline formatting (e.g. <b>Title</b> rest of text)
                  const tInline = $tgt(tTd).find('b, span, i, u, strong, em');
                  sInline.each((iIdx, sTag) => {
                    const tTag = tInline.get(iIdx) || tInline.first().get(0);
                    if (tTag) {
                      $src(sTag).text($tgt(tTag).text().trim());
                    }
                  });
                }
              }
            });
          }
        });
      }
    }
  }
});

// Also fix section headings and non-table paragraphs ($src('p, h1, h2, h3, h4, h5, h6'))
$src('p, h1, h2, h3, h4, h5, h6').each((i, p) => {
  const $p = $src(p);
  const srcTxt = $p.text().trim();
  if (srcTxt) {
    // Find matching heading/paragraph in target
    let matchedTgt = '';
    $tgt('p, h1, h2, h3, h4, h5, h6').each((_, tp) => {
      const t = $tgt(tp).text().trim();
      if (t && !matchedTgt) {
        if (t.toLowerCase().includes(srcTxt.substring(0, 15).toLowerCase())) {
          matchedTgt = t;
        }
      }
    });

    if (matchedTgt) {
      $p.text(matchedTgt);
    }
  }
});

const outputHtml = $src.html();
fs.writeFileSync(outPath, outputHtml, 'utf-8');
console.log(`Successfully fixed table alignment and generated ${outPath}`);
console.log(`Byte length: ${outputHtml.length}`);
