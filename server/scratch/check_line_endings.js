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
  
  // Get the first entry line: starts after "xref\n0 16\n"
  // Let's find "0 16" and locate the index of the first digit "0" of "0000000000"
  const startOfEntries = fileStr.indexOf('0000000000', xrefIndex);
  
  // The first entry should be 20 bytes
  const firstEntry = fileStr.substring(startOfEntries, startOfEntries + 21);
  console.log('First entry content:', JSON.stringify(firstEntry));
  console.log('First entry length:', firstEntry.length);
  for (let i = 0; i < firstEntry.length; i++) {
    console.log(`Byte ${i}: code=${firstEntry.charCodeAt(i)} char=${JSON.stringify(firstEntry[i])}`);
  }
}

run();
