/**
 * Standalone PDF Pipeline Test
 * Tests parse → export cycle without requiring Supabase or the full server.
 * Verifies that the pipeline can:
 * 1. Parse a PDF into segments and template
 * 2. Export a translated PDF from the template and segments
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function getPythonCommand() {
  const localWindowsPath = 'C:\\Users\\divya\\AppData\\Local\\Programs\\Python\\Python310\\python.exe';
  if (fs.existsSync(localWindowsPath)) return localWindowsPath;
  try { execSync('python3 --version', { stdio: 'ignore' }); return 'python3'; } catch (_) {}
  try { execSync('python --version', { stdio: 'ignore' }); return 'python'; } catch (_) {}
  return 'python';
}

const pythonCmd = getPythonCommand();
const srcPath = path.join(__dirname, "src", "utils", "parsers");

const env = { ...process.env, PYTHONPATH: srcPath };

// Step 1: Ensure test PDF exists
const testPdfPath = path.join(__dirname, "test_files", "test_document.pdf");
if (!fs.existsSync(testPdfPath)) {
  console.log("Creating test PDF...");
  const createPdfPy = `from reportlab.lib.pagesizes import letter; from reportlab.pdfgen import canvas; c = canvas.Canvas(r'${testPdfPath.replace(/\\/g, '\\\\')}', pagesize=letter); c.setFont('Helvetica-Bold', 24); c.drawString(100, 750, 'Sample PDF'); c.setFont('Helvetica', 12); c.drawString(100, 720, 'Created for testing PDFObject'); c.drawString(100, 690, 'This PDF is three pages long. Three long pages. Or three short pages if'); c.drawString(100, 670, 'you are optimistic. Is it the same as saying three long minutes, knowing'); c.drawString(100, 650, 'that all minutes are the same duration, and one cannot possibly be longer'); c.drawString(100, 630, 'than the other? If these pages are all the same size, can one possibly be'); c.drawString(100, 610, 'longer than the other?'); c.save()`;
  execSync(`"${pythonCmd}" -c "${createPdfPy}"`, { stdio: "inherit" });
}

console.log("=== PDF PIPELINE STANDALONE TEST ===\n");

// Step 2: Parse PDF
const tmpDir = require("os").tmpdir();
const parseOutputPath = path.join(tmpDir, `matecat_test_parse_${Date.now()}.json`);

console.log("Step 1: Parsing PDF...");
try {
  execSync(
    `"${pythonCmd}" -m pdf_pipeline.pipeline parse --input "${testPdfPath}" --output "${parseOutputPath}"`,
    { env, stdio: "inherit" }
  );
  console.log("✓ Parse succeeded!\n");
} catch (e) {
  console.error("✗ Parse FAILED:", e.message);
  process.exit(1);
}

// Step 3: Read parse output
const parseResult = JSON.parse(fs.readFileSync(parseOutputPath, "utf-8"));
console.log(`Step 2: Parsed ${parseResult.segments.length} segments`);
for (const seg of parseResult.segments.slice(0, 5)) {
  console.log(`  [${seg.id}] "${seg.source.substring(0, 80)}..."`);
}

// Step 4: Simulate "translation" by using source text as target (identity translation)
// This tests that the export pipeline preserves formatting when text doesn't change
const exportSegments = parseResult.segments.map(seg => ({
  id: seg.id,
  source: seg.source,
  target: seg.source  // Identity translation
}));

// Step 5: Export translated PDF
const segmentsPath = path.join(tmpDir, `matecat_test_segs_${Date.now()}.json`);
const templatePath = path.join(tmpDir, `matecat_test_tpl_${Date.now()}.txt`);
const outputPdfPath = path.join(__dirname, "test_pipeline_output.pdf");

fs.writeFileSync(segmentsPath, JSON.stringify(exportSegments), "utf-8");
fs.writeFileSync(templatePath, parseResult.template, "utf-8");

console.log("\nStep 3: Exporting translated PDF (identity translation)...");
try {
  execSync(
    `"${pythonCmd}" -m pdf_pipeline.pipeline export --template "${templatePath}" --segments "${segmentsPath}" --lang "en" --output "${outputPdfPath}"`,
    { env, stdio: "inherit" }
  );
  console.log("✓ Export succeeded!\n");
} catch (e) {
  console.error("✗ Export FAILED:", e.message);
  process.exit(1);
}

// Step 6: Verify output
if (fs.existsSync(outputPdfPath)) {
  const originalSize = fs.statSync(testPdfPath).size;
  const outputSize = fs.statSync(outputPdfPath).size;
  console.log(`Step 4: Verification`);
  console.log(`  Original PDF size: ${originalSize} bytes`);
  console.log(`  Output PDF size:   ${outputSize} bytes`);
  console.log(`  Output file: ${outputPdfPath}`);
  console.log("\n✓ ALL TESTS PASSED");
} else {
  console.error("✗ Output PDF was not created!");
  process.exit(1);
}

// Cleanup temp files
try {
  fs.unlinkSync(parseOutputPath);
  fs.unlinkSync(segmentsPath);
  fs.unlinkSync(templatePath);
} catch (_) {}
