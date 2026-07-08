const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

async function createDummyPdfBuffer() {
  const doc = new PDFDocument({ margin: 50 });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.text('Hello World!');
    doc.addPage();
    doc.text('Welcome to PDF Translation.');
    doc.end();
  });
}

async function run() {
  try {
    const buf = await createDummyPdfBuffer();
    const pdfPath = path.join(__dirname, 'dummy_pdfjs.pdf');
    fs.writeFileSync(pdfPath, buf);

    console.log('Loading pdfjs-dist...');
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    console.log('Parsing PDF...');
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
    const doc = await loadingTask.promise;
    console.log('✅ Success! Number of pages:', doc.numPages);
    
    // Extract page 1 text
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ');
    console.log('Page 1 text:', text);

    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
  } catch (err) {
    console.error('❌ Failed:', err);
  }
}

run();
