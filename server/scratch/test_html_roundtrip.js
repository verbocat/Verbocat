const { parseFile, exportFile } = require('../src/utils/parsers/htmlParser');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const testHtml = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head><meta charset="UTF-8"><title>Test</title></head>',
  '<body>',
  '  <div class="header">',
  '    <h1>Company Report 2024</h1>',
  '    <p>Quarterly <strong>Financial</strong> Summary</p>',
  '  </div>',
  '  <table>',
  '    <tr>',
  '      <td class="bold">Revenue</td>',
  '      <td>Rs. 12,500 Crores</td>',
  '    </tr>',
  '    <tr>',
  '      <td class="bold">Net Profit</td>',
  '      <td>Rs. 1,200 Crores</td>',
  '    </tr>',
  '  </table>',
  '  <p>This report contains <em>confidential</em> information. Do not distribute.</p>',
  '  <ul>',
  '    <li>First point with <a href="#">a link</a> inside.</li>',
  '    <li>Second point.</li>',
  '    <li>Third point with <strong>bold text</strong>.</li>',
  '  </ul>',
  '</body>',
  '</html>'
].join('\n');

const tmpFile = path.join(os.tmpdir(), 'test_html_1based.html');
fs.writeFileSync(tmpFile, testHtml, 'utf-8');

(async () => {
  const result = await parseFile(tmpFile);
  
  console.log('Segments (should be 1-based IDs now):');
  result.segments.forEach((s, i) => {
    console.log(`  Seg ${i} | id:${s.id} source: ${JSON.stringify(s.source)}`);
  });

  // Simulate client behavior: id = idx + 1
  const clientMappedSegs = result.segments.map((s, idx) => ({
    ...s,
    id: idx + 1,   // ← what client does
    target: s.source  // identity
  }));

  console.log('\nClient-mapped IDs:', clientMappedSegs.map(s => s.id));

  const exported = await exportFile(result.template, clientMappedSegs);
  const htmlOut = exported.toString('utf-8');

  console.log('\n=== ORIGINAL ===');
  console.log(testHtml);
  console.log('\n=== EXPORTED (with client id mapping) ===');
  console.log(htmlOut);

  // Verify no leftover placeholders
  const leftover = htmlOut.match(/__SEG_\d+__/g);
  console.log('\nLeftover __SEG__ placeholders:', leftover ? leftover.length : 0);
  if (leftover) console.log('Examples:', leftover.slice(0, 5));

  fs.unlinkSync(tmpFile);
})().catch(e => { console.error(e); process.exit(1); });
