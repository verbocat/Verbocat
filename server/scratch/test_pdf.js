const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pdfParser = require('../src/utils/parsers/pdfParser');

async function createDummyPdfBuffer() {
  const doc = new PDFDocument({ margin: 50, compress: false });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', err => reject(err));

    // Page 1
    doc.text('Hello World!');
    
    // Page 2
    doc.addPage();
    doc.text('Welcome to PDF Translation.');

    doc.end();
  });
}

async function verify() {
  const dummyPdfPath = path.join(__dirname, 'dummy_test.pdf');
  const exportedPdfPath = path.join(__dirname, 'exported_test.pdf');

  try {
    console.log('1. Creating dummy PDF buffer...');
    const dummyBuffer = await createDummyPdfBuffer();
    fs.writeFileSync(dummyPdfPath, dummyBuffer);
    console.log('Dummy PDF buffer created and written to disk.');

    console.log('2. Parsing dummy PDF using our pdfParser...');
    const parseResult = await pdfParser.parseFile(dummyPdfPath);
    console.log('Parsed segments:', parseResult.segments);

    if (parseResult.segments.length !== 2) {
      throw new Error(`Expected 2 segments, but got ${parseResult.segments.length}`);
    }

    if (parseResult.segments[0].source !== 'Hello World!' || 
        parseResult.segments[1].source !== 'Welcome to PDF Translation.') {
      throw new Error('Parsed segment text mismatch!');
    }
    console.log('✅ PDF Parsing works correctly.');

    console.log('3. Translating segments (Hindi/Unicode)...');
    const translatedSegments = [
      {
        id: 0,
        source: 'Hello World!',
        target: 'नमस्ते दुनिया' // Devanagari Unicode
      },
      {
        id: 1,
        source: 'Welcome to PDF Translation.',
        target: 'पीडीएफ अनुवाद में आपका स्वागत है।'
      }
    ];

    console.log('4. Exporting translated PDF...');
    const exportedBuffer = await pdfParser.exportFile(parseResult.template, translatedSegments);
    fs.writeFileSync(exportedPdfPath, exportedBuffer);
    console.log('Exported PDF written.');

    console.log('5. Verifying exported PDF is valid and non-empty...');
    const stat = fs.statSync(exportedPdfPath);
    if (stat.size < 1000) {
      throw new Error(`Exported PDF is too small (${stat.size} bytes), likely empty or invalid!`);
    }
    console.log(`Exported PDF size: ${stat.size} bytes — looks good.`);

    console.log('🎉 PDF translation and export verification PASSED!');

  } catch (err) {
    console.error('❌ Verification FAILED:', err);
    process.exit(1);
  } finally {
    // Clean up files
    if (fs.existsSync(dummyPdfPath)) fs.unlinkSync(dummyPdfPath);
    if (fs.existsSync(exportedPdfPath)) fs.unlinkSync(exportedPdfPath);
  }
}

verify();
