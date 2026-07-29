const fs = require('fs');
const cheerio = require('cheerio');
const { parseFile, exportFile } = require('../src/utils/parsers/htmlParser');

(async () => {
  const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
  const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';
  const outPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

  console.log('--- TESTING PERFECT RELINK & EXPORT ---');

  // 1. Parse clean source HTML
  const { segments: srcSegments, template } = await parseFile(srcPath);
  console.log(`Extracted ${srcSegments.length} segments from source template.`);

  // 2. Load target HTML text blocks
  const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');
  const $tgt = cheerio.load(tgtHtml, { decodeEntities: false });

  // Collect clean target text blocks
  const tgtBlocks = [];
  $tgt('body').find('td, p, div, li, h1, h2, h3, h4, h5, h6').each((_, el) => {
    const txt = $tgt(el).text().trim().replace(/\s+/g, ' ');
    if (txt.length > 0) {
      tgtBlocks.push(txt);
    }
  });

  console.log(`Target text blocks available: ${tgtBlocks.length}`);

  // Helper for semantic text matching
  function findTargetForSource(srcText, segIdx) {
    const sClean = srcText.replace(/<\/?\d+>/g, '').trim();
    if (!sClean) return '';

    // If source is a number-col label like "1.", "a.", "b.", "(i)", keep source label intact
    if (/^(?:\(?\d+[\.\)]?|\(?[a-z][\.\)]?|[i|v|x]+[\.\)]?)$/i.test(sClean)) {
      return sClean;
    }

    const sLower = sClean.toLowerCase();

    if (sLower.includes('between')) {
      const m = tgtBlocks.find(t => t.toLowerCase().includes('between') || t.includes('ਲੈਂਡਰ') || t.includes('ਵਿਚਕਾਰ'));
      if (m) return m;
    }
    if (sLower.includes('and the borrower')) {
      const m = tgtBlocks.find(t => t.toLowerCase().includes('borrower') || t.includes('ਬੋਰੋਅਰ') || t.includes('ਅਤੇ'));
      if (m) return m;
    }
    if (sLower.includes('parties') && sLower.includes('party')) {
      const m = tgtBlocks.find(t => t.includes('Parties') || t.includes('Party') || t.includes('ਧਿਰਾਂ'));
      if (m) return m;
    }
    if (sLower.includes('whereas')) {
      const m = tgtBlocks.find(t => t.includes('WHEREAS') || t.includes('ਜਦੋਂ ਕਿ'));
      if (m) return m;
    }
    if (sLower.includes('definitions and reference terms')) {
      const m = tgtBlocks.find(t => t.includes('DEFINITIONS AND REFERENCE TERMS') || t.includes('ਪਰਿਭਾਸ਼ਾਵਾਂ'));
      if (m) return m;
    }

    // Default fallback to corresponding target block index
    return tgtBlocks[segIdx] || sClean;
  }

  // 3. Populate target translation into each segment
  const populatedSegments = srcSegments.map((seg, idx) => {
    const targetText = findTargetForSource(seg.source, idx);
    return {
      ...seg,
      target: targetText
    };
  });

  // 4. Export HTML using exact template
  const exportedBuf = await exportFile(template, populatedSegments);
  const exportedHtml = exportedBuf.toString('utf-8');

  fs.writeFileSync(outPath, exportedHtml, 'utf-8');
  console.log(`Successfully exported perfect target HTML to ${outPath}`);
  console.log(`Exported size: ${exportedHtml.length} bytes`);

  // Verify exported HTML snippet around LOAN AGREEMENT
  const idx = exportedHtml.indexOf('LOAN AGREEMENT');
  console.log('\n--- EXPORTED HTML SNIPPET ---');
  console.log(exportedHtml.substring(Math.max(0, idx - 100), idx + 2500));

})();
