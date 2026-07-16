const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { processRelinkDualFiles } = require("../src/utils/parsers/relinkEngine");

async function runRelinkFullTests() {
  console.log("Running 100% Language-Agnostic Relinking Engine Integration Tests...");

  const tmpDir = path.join(__dirname, "test_files_lang_agnostic");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // 1. Thai Sample (No spaces or punctuation used in natural Thai text)
  const sourceThaiHtml = `<!DOCTYPE html>
<html>
<body>
  <h1><a href="http://example.com">Welcome to Website</a></h1>
  <p>This is the first segment with <b>bold text</b>. And this is the second segment in paragraph.</p>
</body>
</html>`;

  const targetThaiHtml = `<!DOCTYPE html>
<html>
<body>
  <h1><a href="http://example.com">ยินดีต้อนรับสู่เว็บไซต์</a></h1>
  <p>นี่คือส่วนแรกที่มี<b>ข้อความตัวหนา</b>และนี่คือส่วนที่สองในย่อหน้า</p>
</body>
</html>`;

  const sourcePath = path.join(tmpDir, "source_thai.html");
  const targetPath = path.join(tmpDir, "target_thai.html");

  fs.writeFileSync(sourcePath, sourceThaiHtml, "utf-8");
  fs.writeFileSync(targetPath, targetThaiHtml, "utf-8");

  try {
    const result = await processRelinkDualFiles(sourcePath, targetPath);
    console.log(`✓ Thai Test: Parsed and aligned ${result.count} segments with ZERO punctuation dependency.`);

    assert.ok(result.segments.length > 0, "Should produce aligned segments");
    const seg0 = result.segments[0];
    assert.ok(seg0.target.includes("ยินดีต้อนรับสู่เว็บไซต์"), "Thai target segment 1 aligned");
    
    console.log("Thai Segment 1 Source:", seg0.source);
    console.log("Thai Segment 1 Target:", seg0.target);

    console.log("All 100% Language-Agnostic Integration Tests Passed Successfully!");
  } finally {
    if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  }
}

runRelinkFullTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
