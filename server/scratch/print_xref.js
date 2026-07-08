const PDFDocument = require('pdfkit');

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
  const buf = await createDummyPdfBuffer();
  const fileStr = buf.toString('binary');
  const xrefIndex = fileStr.indexOf('xref');
  console.log('XRef table content around index:', xrefIndex);
  console.log(fileStr.substring(xrefIndex - 20, xrefIndex + 800));
}

run();
