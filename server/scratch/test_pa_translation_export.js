const fs = require('fs');
const cheerio = require('cheerio');
const { parseFile, exportFile } = require('../src/utils/parsers/htmlParser');

(async () => {
  const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_LOAN_AGREEMENT_PROD.html';

  // 1. Parse with NEW code
  const result = await parseFile(srcPath);

  // 2. Simulate translations (append translated tag/text)
  const translatedSegs = result.segments.map(s => {
    // If it's a short label like "i." or "j." or numbers, keep it as is
    if (/^[a-z0-9]\.$/i.test(s.source.trim())) {
      return { ...s, target: s.source };
    }
    // Simulate translation text
    return {
      ...s,
      target: '[ਅਨੁਵਾਦ] ' + s.source
    };
  });

  // 3. Export HTML with NEW code
  const exportedBuf = await exportFile(result.template, translatedSegs);
  const exportedHtml = exportedBuf.toString('utf-8');

  // 4. Inspect layout & table structure
  const $exp = cheerio.load(exportedHtml, { decodeEntities: false });

  console.log('=== TRANSLATED TARGET HTML VERIFICATION ===');
  console.log('Tables:', $exp('table').length);
  console.log('TRs:   ', $exp('tr').length);
  console.log('TDs:   ', $exp('td').length);

  // Verify number-col cells
  const misplacedParagraphs = [];
  $exp('td.number-col').each((i, el) => {
    const text = $exp(el).text().trim();
    if (text.length > 25) {
      misplacedParagraphs.push({ index: i, text: text.substring(0, 80) });
    }
  });

  console.log('\nMisplaced paragraph text in number-col cells:', misplacedParagraphs.length);
  if (misplacedParagraphs.length > 0) {
    console.log('ERRORS found:', misplacedParagraphs);
  } else {
    console.log('PASSED: All paragraph text is in correct wide <td> body cells!');
  }

  // Check item i. snippet
  const idx = exportedHtml.indexOf('facing any difficulty');
  console.log('\nSnippet around item i in translated HTML:');
  console.log(exportedHtml.substring(Math.max(0, idx - 250), idx + 350));
})().catch(console.error);
