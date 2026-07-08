const PDFDocument = require('pdfkit');

const doc = new PDFDocument();
const chunks = [];
doc.on('data', chunk => {
  console.log('Received chunk of size:', chunk.length);
  chunks.push(chunk);
});
doc.on('end', () => {
  const buf = Buffer.concat(chunks);
  console.log('Total PDF size:', buf.length);
});
doc.text('Hello');
doc.end();
