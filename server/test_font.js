require('regenerator-runtime/runtime');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

(async () => {
  const BUNDLED = path.join(__dirname, 'src/assets/fonts/NotoSansDevanagari-Regular.ttf');
  console.log('Font path:', BUNDLED);
  console.log('Font exists:', fs.existsSync(BUNDLED));

  const fontBytes = fs.readFileSync(BUNDLED);
  const magic = fontBytes.slice(0,4).toString('hex');
  console.log('TTF magic:', magic, magic === '00010000' ? '✅ valid' : '❌ invalid');

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes);
  console.log('✅ Font embedded OK');

  const page = pdfDoc.addPage([595, 842]);
  const devanagariLines = [
    'पुनरावलोकन',
    'व्यक्तिगत माहिती',
    'माहिती -> मािहती (reordered)',
    'दिव्यांशी -> िदव्यांशी (reordered)',
    'शिक्षण -> िशक्षण (reordered)',
    'राजस्थान शिक्षक पात्रता',
  ];
  devanagariLines.forEach((t, i) => {
    page.drawText(t, { x: 50, y: 780 - i * 50, size: 18, font, color: rgb(0, 0, 0) });
  });
  console.log('✅ All Devanagari text drawn without errors');

  const bytes = await pdfDoc.save();
  fs.writeFileSync('test_devanagari_output.pdf', bytes);
  console.log('✅ PDF written:', bytes.length, 'bytes — open test_devanagari_output.pdf to verify');
})().catch(e => {
  console.error('❌ FAILED:', e.message);
  process.exit(1);
});
