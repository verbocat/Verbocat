const PDFDocument = require('pdfkit');
const pdf = require('pdf-parse');

async function createOnePagePdf() {
  const doc = new PDFDocument({ margin: 50 });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.text('Hello World!');
    doc.end();
  });
}

async function run() {
  try {
    const buf = await createOnePagePdf();
    console.log('1-page PDF generated. Size:', buf.length);
    const parsed = await pdf(buf);
    console.log('✅ Success! Parsed text:', JSON.stringify(parsed.text));
  } catch (err) {
    console.error('❌ Failed:', err);
  }
}

run();
