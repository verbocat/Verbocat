const fs = require('fs');
const cheerio = require('cheerio');
const { parseFile, exportFile } = require('../src/utils/parsers/htmlParser');

(async () => {
  const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
  const srcHtml = fs.readFileSync(srcPath, 'utf-8');

  console.log('--- TESTING HTML PARSE & EXPORT ROUNDTRIP ---');
  const parsed = await parseFile(srcPath);
  console.log(`Total segments extracted by htmlParser: ${parsed.segments.length}`);

  // Test export with identity segments (target = source)
  const exportedBuf = await exportFile(parsed.template, parsed.segments);
  const exportedHtml = exportedBuf.toString('utf-8');

  console.log(`Source size: ${srcHtml.length} bytes`);
  console.log(`Exported size: ${exportedHtml.length} bytes`);

  // Compare element counts between source and exported
  const $src = cheerio.load(srcHtml);
  const $exp = cheerio.load(exportedHtml);

  const tagsToCompare = ['html', 'head', 'body', 'style', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'div', 'p', 'span', 'b', 'i', 'strong', 'em', 'img', 'br', 'hr', 'ul', 'ol', 'li'];

  console.log('\n--- TAG COUNT COMPARISON: SOURCE vs EXPORTED ---');
  let mismatches = 0;
  tagsToCompare.forEach(tag => {
    const srcCount = $src(tag).length;
    const expCount = $exp(tag).length;
    if (srcCount !== expCount) {
      console.log(`  MISMATCH: <${tag}> Source=${srcCount}, Exported=${expCount}`);
      mismatches++;
    } else {
      console.log(`  MATCH: <${tag}> count=${srcCount}`);
    }
  });
  console.log(`Total mismatches: ${mismatches}`);

  // Check section around "BETWEEN", "AND", "Parties", "WHEREAS", "DEFINITIONS AND REFERENCE TERMS" in exported HTML
  const idx = exportedHtml.indexOf('LOAN AGREEMENT');
  console.log('\n--- EXPORTED HTML SNIPPET AROUND LOAN AGREEMENT ---');
  console.log(exportedHtml.substring(Math.max(0, idx - 100), idx + 2500));

})();
