const PDFDocument = require('pdfkit');

async function createDummyPdfBuffer() {
  const doc = new PDFDocument({ margin: 50, compress: false });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    // Page 1
    doc.text('Hello World!');
    // Page 2
    doc.addPage();
    doc.text('Welcome to PDF Translation.');
    doc.end();
  });
}

async function run() {
  const buf = await createDummyPdfBuffer();
  console.log('Total length:', buf.length);
  console.log('Start (first 50 bytes):');
  console.log(buf.slice(0, 50).toString('utf-8'));
  console.log('Start (hex):', buf.slice(0, 10).toString('hex'));
  
  console.log('End (last 150 bytes):');
  console.log(buf.slice(buf.length - 150).toString('utf-8'));
}

run();
