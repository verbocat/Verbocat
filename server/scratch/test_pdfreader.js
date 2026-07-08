const { PdfReader } = require('pdfreader');
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
  console.log('PDF generated, parsing with PdfReader...');

  const pages = [];
  let currentPageText = "";

  new PdfReader().parseBuffer(buf, (err, item) => {
    if (err) {
      console.error('PdfReader error:', err);
    } else if (!item) {
      if (currentPageText) {
        pages.push(currentPageText);
      }
      console.log('Parsing finished.');
      console.log('Extracted pages:', pages);
    } else if (item.page) {
      if (currentPageText) {
        pages.push(currentPageText);
      }
      currentPageText = "";
    } else if (item.text) {
      currentPageText += (currentPageText ? " " : "") + item.text;
    }
  });
}

run();
