const fs = require("fs");
const path = require("path");
const { processUploadedFile } = require("./src/services/fileService");

async function runTests() {
  console.log("=== STARTING FILE PARSING & SEGMENT EXTRACTION TESTS ===");

  const testDir = path.join(__dirname, "test_files");
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // 1. Create HTML file
  const htmlPath = path.join(testDir, "sample.html");
  fs.writeFileSync(htmlPath, `<!DOCTYPE html>
<html>
<head><title>Test Document</title></head>
<body>
  <h1>Welcome to VerboLabs Translation Platform</h1>
  <p>VerboLabs provides high quality professional translation services.</p>
  <p>Our CAT tool supports real time collaboration and multi tenant workspaces.</p>
</body>
</html>`, "utf-8");

  // 2. Create TXT file
  const txtPath = path.join(testDir, "sample.txt");
  fs.writeFileSync(txtPath, "Hello World!\nWelcome to VerboLabs CAT Platform.\nThis is a sample document for translation.", "utf-8");

  console.log("\n[TEST 1] Testing HTML File Processing...");
  try {
    const htmlResult = await processUploadedFile({
      originalname: "sample.html",
      path: htmlPath
    });
    console.log("HTML Parsing SUCCESS! Extracted Segments Count:", htmlResult.segments?.length);
    console.log("Sample Segments:", htmlResult.segments?.slice(0, 3));
  } catch (err) {
    console.error("HTML Parsing ERROR:", err.message);
  }

  console.log("\n[TEST 2] Testing TXT File Processing...");
  try {
    const txtResult = await processUploadedFile({
      originalname: "sample.txt",
      path: txtPath
    });
    console.log("TXT Parsing SUCCESS! Extracted Segments Count:", txtResult.segments?.length);
    console.log("Sample Segments:", txtResult.segments?.slice(0, 3));
  } catch (err) {
    console.error("TXT Parsing ERROR:", err.message);
  }

  console.log("\n=== ALL FILE PARSING TESTS COMPLETED ===");
}

runTests();
