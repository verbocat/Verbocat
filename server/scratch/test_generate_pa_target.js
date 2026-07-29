const fs = require('fs');
const cheerio = require('cheerio');
const { parseFile, exportFile } = require('../src/utils/parsers/htmlParser');

(async () => {
  const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_LOAN_AGREEMENT_PROD.html';
  const paPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa.html';

  // 1. Parse source HTML with current new code
  const result = await parseFile(srcPath);
  console.log('Total segments parsed with NEW code:', result.segments.length);

  // 2. Load target HTML from Punjabi file to see what segments were in it
  const paHtml = fs.readFileSync(paPath, 'utf-8');

  // Let's test export with IDENTITY segments (source text as target)
  const identitySegs = result.segments.map(s => ({
    ...s,
    target: s.source
  }));

  const exportedBuf = await exportFile(result.template, identitySegs);
  const exportedHtml = exportedBuf.toString('utf-8');

  // Check item i. and j. in exported HTML generated with NEW code
  const idx = exportedHtml.indexOf('facing any difficulty');
  console.log('\n--- NEW CODE Export HTML snippet around item i ---');
  console.log(exportedHtml.substring(Math.max(0, idx - 400), idx + 400));

  // Check if any <td class="number-col"> contains long text (> 10 chars)
  const $exp = cheerio.load(exportedHtml, { decodeEntities: false });
  const longNumCols = [];
  $exp('td.number-col').each((i, el) => {
    const text = $exp(el).text().trim();
    if (text.length > 10) {
      longNumCols.push({ index: i, text: text.substring(0, 80) });
    }
  });

  console.log('\nNumber of <td class="number-col"> elements with text length > 10:', longNumCols.length);
  if (longNumCols.length > 0) {
    console.log('Examples:', longNumCols.slice(0, 5));
  } else {
    console.log('SUCCESS: ZERO <td class="number-col"> cells contain paragraph text!');
  }
})().catch(console.error);
