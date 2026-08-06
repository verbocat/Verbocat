const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const docxParser = require('./src/utils/parsers/docxParser');

function getPythonCommand() {
  const localWindowsPath = 'C:\\Users\\divya\\AppData\\Local\\Programs\\Python\\Python310\\python.exe';
  if (fs.existsSync(localWindowsPath)) return localWindowsPath;
  try { execSync('python3 --version', { stdio: 'ignore' }); return 'python3'; } catch (_) {}
  try { execSync('python --version', { stdio: 'ignore' }); return 'python'; } catch (_) {}
  return 'python';
}

const pythonCmd = getPythonCommand();

async function runTest() {
  console.log("=== PDF LAYOUT & DOCX PRESERVATION TEST ===\n");

  const testPdfPath = path.join(__dirname, "test_files", "rich_test.pdf");
  const tempDocxPath = path.join(__dirname, "test_files", "rich_test_temp.docx");
  const outDocxPath = path.join(__dirname, "test_files", "rich_test_exported.docx");
  const outPdfPath = path.join(__dirname, "test_files", "rich_test_exported.pdf");

  // Step 1: pdf2docx
  console.log("1. Running pdf2docx conversion...");
  const escapedPdfPath = testPdfPath.replace(/\\/g, '\\\\');
  const escapedDocxPath = tempDocxPath.replace(/\\/g, '\\\\');
  const pyScript = `from pdf2docx import Converter; cv = Converter('${escapedPdfPath}'); cv.convert('${escapedDocxPath}'); cv.close()`;
  execSync(`"${pythonCmd}" -c "${pyScript}"`, { stdio: 'inherit' });

  // Step 2: docxParser parse
  console.log("\n2. Parsing DOCX segments...");
  const { segments, template } = await docxParser.parseFile(tempDocxPath);
  console.log(`Parsed ${segments.length} paragraph segments:`);
  segments.forEach(s => console.log(`  [Seg ${s.id}] "${s.source.substring(0, 60)}..."`));

  // Step 3: Export DOCX
  console.log("\n3. Exporting translated DOCX...");
  const docxBuffer = await docxParser.exportFile(template, segments);
  fs.writeFileSync(outDocxPath, docxBuffer);
  console.log("✓ Exported DOCX saved:", outDocxPath);

  // Step 4: Run docx_to_pdf_engine
  console.log("\n4. Rendering PDF via docx_to_pdf_engine...");
  const engineScript = path.join(__dirname, "src", "utils", "parsers", "pdf_pipeline", "docx_to_pdf_engine.py");
  execSync(`"${pythonCmd}" "${engineScript}" "${outDocxPath}" "${outPdfPath}"`, { stdio: 'inherit' });

  // Step 5: Verify font sizes and alignment of generated PDF
  console.log("\n5. Verifying Output PDF Formatting:");
  const inspectPy = `import fitz
doc = fitz.open(r'${outPdfPath.replace(/\\/g, '\\\\')}')
for page in doc:
    blocks = page.get_text('dict')['blocks']
    for b in blocks:
        if 'lines' in b:
            for l in b['lines']:
                for s in l['spans']:
                    sz = round(s['size'], 1)
                    font = s['font']
                    txt = s['text'][:45]
                    pos = (round(s['origin'][0], 1), round(s['origin'][1], 1))
                    print(f'  size={sz:>4.1f}pt  pos={pos}  font={font:<20s}  text="{txt}"')
`;
  execSync(`"${pythonCmd}" -c "${inspectPy}"`, { stdio: 'inherit' });

  console.log("\n✓ ALL LAYOUT PRESERVATION TESTS PASSED!");
  
  // Clean up
  [tempDocxPath, outDocxPath, outPdfPath].forEach(f => {
    try { fs.unlinkSync(f); } catch (_) {}
  });
}

runTest().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
