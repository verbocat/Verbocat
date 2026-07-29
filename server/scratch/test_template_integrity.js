const fs = require('fs');
const { parseFile } = require('../src/utils/parsers/htmlParser');

(async () => {
  const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_LOAN_AGREEMENT_PROD.html';
  const result = await parseFile(srcPath);

  // Check if templateHtml has invalid/corrupted HTML tags
  const zlib = require('zlib');
  const buf = Buffer.from(result.template, 'base64');
  const templateData = JSON.parse(zlib.gunzipSync(buf).toString('utf-8'));
  const tHtml = templateData.html;

  // Look for broken tags in template HTML
  const brokenTags = tHtml.match(/<[^>]*<|>[^<]*>/g);
  console.log('Broken tags in generated template:', brokenTags ? brokenTags.length : 0);
  if (brokenTags) {
    console.log('Examples of broken tags:', brokenTags.slice(0, 10));
  }

  // Count tables in template
  const origHtml = fs.readFileSync(srcPath, 'utf-8');
  const origTableCount = (origHtml.match(/<table/gi) || []).length;
  const tTableCount = (tHtml.match(/<table/gi) || []).length;

  console.log('\nOriginal <table count:', origTableCount);
  console.log('Template <table count:', tTableCount);

  const origTdCount = (origHtml.match(/<td/gi) || []).length;
  const tTdCount = (tHtml.match(/<td/gi) || []).length;
  console.log('Original <td count:', origTdCount);
  console.log('Template <td count:', tTdCount);
})().catch(console.error);
