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

const offsets = [
  1159, // obj 1
  1223, // obj 2
  1097, // obj 3
  1076, // obj 4
  226,  // obj 5
  119,  // obj 6
  15,   // obj 7
  979,  // obj 8
  618,  // obj 9
  510,  // obj 10
  404,  // obj 11
  903,  // obj 12
  817,  // obj 13
  842,  // obj 14
  867   // obj 15
];

async function run() {
  const buf = await createDummyPdfBuffer();
  const fileStr = buf.toString('binary');
  
  console.log('Verifying offsets listed in print_xref.js:');
  offsets.forEach((offset, idx) => {
    const objNum = idx + 1;
    const content = fileStr.substring(offset, offset + 15);
    console.log(`Obj ${objNum} at offset ${offset}: expected "${objNum} 0 obj", got: ${JSON.stringify(content)}`);
  });
}

run();
