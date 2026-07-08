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
  const xrefIndex = fileStr.indexOf('\nxref\r');
  const xrefIndexAlt = fileStr.indexOf('xref');
  const startxrefIndex = fileStr.indexOf('startxref');
  
  console.log('Total length:', buf.length);
  console.log('Index of "xref":', xrefIndex, 'or', xrefIndexAlt);
  console.log('Index of "startxref":', startxrefIndex);
  
  // Extract number after startxref
  const afterStartxref = fileStr.substring(startxrefIndex + 9).trim();
  const valueList = afterStartxref.split(/\s+/);
  console.log('Offset listed in startxref:', valueList[0]);
}

run();
