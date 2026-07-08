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
  
  // XRef says object 1 is at 1159
  console.log('Object 1 at offset 1159:');
  console.log(JSON.stringify(fileStr.substring(1159, 1209)));

  // XRef says object 2 is at 1223
  console.log('Object 2 at offset 1223:');
  console.log(JSON.stringify(fileStr.substring(1223, 1273)));

  // Let's search for "1 0 obj" and "2 0 obj" in the file to see their real offsets!
  console.log('Real offset of "1 0 obj":', fileStr.indexOf('1 0 obj'));
  console.log('Real offset of "2 0 obj":', fileStr.indexOf('2 0 obj'));
  console.log('Real offset of "3 0 obj":', fileStr.indexOf('3 0 obj'));
}

run();
