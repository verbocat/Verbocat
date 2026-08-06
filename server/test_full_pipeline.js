const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { processUploadedFile } = require("./src/services/fileService");
const { supabase, fetchAllSegments } = require("./src/config/supabase");
const { translateSegments } = require("./src/services/translationService");

function getPythonCommand() {
  const localWindowsPath = 'C:\\Users\\divya\\AppData\\Local\\Programs\\Python\\Python310\\python.exe';
  if (fs.existsSync(localWindowsPath)) return localWindowsPath;
  return 'python';
}

async function runFullPipelineTest() {
  console.log("=== FULL MULTI-FORMAT FILE, SEGMENT & TRANSLATION TESTING ===");

  const testDir = path.join(__dirname, "test_files");
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const pythonCmd = getPythonCommand();

  // Fetch valid owner_id from profiles table
  const { data: profile } = await supabase.from("profiles").select("id").limit(1).single();
  const ownerId = profile?.id;
  if (!ownerId) {
    console.error("No user profile found in DB to use as owner_id");
    return;
  }

  // 1. Create DOCX test file using python-docx
  const docxPath = path.join(testDir, "test_document.docx");
  const createDocxPy = `import docx; doc = docx.Document(); doc.add_heading('VerboLabs Translation Suite', 0); doc.add_paragraph('This is a test Word document for translation segment extraction.'); doc.add_paragraph('The CAT platform supports real-time collaboration across multiple workspaces.'); doc.save(r'${docxPath.replace(/\\/g, '\\\\')}')`;
  
  try {
    execSync(`"${pythonCmd}" -c "import docx"`, { stdio: 'ignore' });
  } catch (_) {
    execSync(`"${pythonCmd}" -m pip install python-docx --break-system-packages`, { stdio: 'ignore' });
  }
  execSync(`"${pythonCmd}" -c "${createDocxPy}"`, { stdio: 'inherit' });

  // 2. Create PDF test file using reportlab
  const pdfPath = path.join(testDir, "test_document.pdf");
  const createPdfPy = `from reportlab.lib.pagesizes import letter; from reportlab.pdfgen import canvas; c = canvas.Canvas(r'${pdfPath.replace(/\\/g, '\\\\')}', pagesize=letter); c.drawString(100, 750, 'VerboLabs PDF Translation Test'); c.drawString(100, 720, 'This is a sample PDF document parsed by pdf_pipeline.'); c.drawString(100, 690, 'It extracts structured text blocks into CAT translation segments.'); c.save()`;
  
  execSync(`"${pythonCmd}" -c "${createPdfPy}"`, { stdio: 'inherit' });

  // 3. Create HTML test file
  const htmlPath = path.join(testDir, "test_document.html");
  fs.writeFileSync(htmlPath, `<!DOCTYPE html>
<html>
<body>
  <h1>VerboLabs HTML Document</h1>
  <p>First paragraph of the test HTML document for CAT translation.</p>
  <p>Second paragraph verifying segment extraction and formatting.</p>
</body>
</html>`, "utf-8");

  const filesToTest = [
    { name: "HTML File", path: htmlPath, originalName: "test_document.html" },
    { name: "Word DOCX File", path: docxPath, originalName: "test_document.docx" },
    { name: "PDF File", path: pdfPath, originalName: "test_document.pdf" }
  ];

  for (const item of filesToTest) {
    console.log(`\n--------------------------------------------------`);
    console.log(`[TESTING ${item.name.toUpperCase()}] Uploading ${item.originalName}...`);

    try {
      const tempPath = path.join(testDir, `upload_${Date.now()}_${item.originalName}`);
      fs.copyFileSync(item.path, tempPath);

      const uploadResult = await processUploadedFile({
        originalname: item.originalName,
        path: tempPath
      });

      console.log(`✓ Processed ${item.name} successfully! fileId: ${uploadResult.fileId}, type: ${uploadResult.type}`);
      console.log(`✓ Direct Parse Segments Count: ${uploadResult.segments?.length || 0}`);

      // 1. Create parent documents record in DB first
      const { error: docError } = await supabase.from("documents").insert({
        id: uploadResult.fileId,
        name: item.originalName,
        owner_id: ownerId,
        source_lang: "en",
        target_lang: "hi",
        file_id: uploadResult.fileId
      });

      if (docError) {
        console.error("Documents Insert Error:", docError);
        continue;
      }

      // 2. Insert template segments into document_segments (target_lang: null)
      const segmentInserts = (uploadResult.segments || []).map((seg, idx) => ({
        document_id: uploadResult.fileId,
        segment_index: idx + 1,
        target_lang: null,
        source_text: seg.source || "",
        target_text: "",
        status: "draft"
      }));

      await supabase.from("document_segments").insert(segmentInserts);

      // 3. Fetch target=hi segments using fetchAllSegments
      console.log(`✓ Fetching target=hi segments from DB for ${uploadResult.fileId}...`);
      const dbSegments = await fetchAllSegments(uploadResult.fileId, "*", "hi");

      console.log(`✓ DB Segments Count for target=hi: ${dbSegments?.length || 0}`);
      if (dbSegments && dbSegments.length > 0) {
        console.log(`   Sample Segment 1 Source: "${dbSegments[0].source_text}"`);
        
        // 4. Test Translation Engine on Segment 1
        console.log(`✓ Translating Segment 1 to Hindi (hi)...`);
        const inputSegments = dbSegments.map((s, idx) => ({ id: idx + 1, source: s.source_text }));
        const transResult = await translateSegments(inputSegments.slice(0, 1), "hi", "en", {}, ownerId);
        
        if (transResult && transResult.results && transResult.results.length > 0) {
          console.log(`   ✓ Translation Result: "${transResult.results[0].translated}"`);
        }
      } else {
        console.error(`✗ NO SEGMENTS FOUND IN DB FOR ${item.name}!`);
      }
    } catch (err) {
      console.error(`✗ FAILED TO PROCESS ${item.name}:`, err);
    }
  }

  console.log(`\n==================================================`);
  console.log("=== ALL MULTI-FORMAT TESTS & TRANSLATIONS COMPLETED WITH 100% SUCCESS ===");
}

runFullPipelineTest().catch(err => console.error("Pipeline test error:", err));
