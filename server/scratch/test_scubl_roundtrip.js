const fs = require('fs');
const cheerio = require('cheerio');
const zlib = require('zlib');

// Import segmentationUtils and htmlParser
const { splitByPunctuation } = require('../src/utils/parsers/segmentationUtils');
const { parseFile, exportFile } = require('../src/utils/parsers/htmlParser');

(async () => {
  const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_LOAN_AGREEMENT_PROD.html';
  const origHtml = fs.readFileSync(srcPath, 'utf-8');

  const result = await parseFile(srcPath);

  // Identity export
  const identitySegs = result.segments.map(s => ({
    ...s,
    target: s.source
  }));

  const exportedBuf = await exportFile(result.template, identitySegs);
  const exportedHtml = exportedBuf.toString('utf-8');

  // Find 11 broken tags
  const brokenMatches = [...exportedHtml.matchAll(/<[^>]*<|>[^<]*>/g)];
  console.log('Broken matches count:', brokenMatches.length);
  brokenMatches.forEach((m, idx) => {
    const pos = m.index;
    console.log(`\nBroken #${idx+1} at index ${pos}:`);
    console.log(JSON.stringify(exportedHtml.substring(Math.max(0, pos - 50), Math.min(exportedHtml.length, pos + 100))));
  });
})().catch(console.error);
