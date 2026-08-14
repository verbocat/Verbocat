const fs = require('fs');
const path = require('path');
const srtParser = require('./src/utils/parsers/srtParser');
const { processUploadedFile, exportHtml } = require('./src/services/fileService');

async function testSrtPipeline() {
  console.log("========================================");
  console.log("Starting SRT Subtitle Pipeline Test...");
  console.log("========================================");

  // 1. Create a dummy SRT test file
  const sampleSrtContent = `1
00:00:01,000 --> 00:00:04,500
Hello, welcome to this video presentation.
This is the second line of the first subtitle cue.

2
00:00:05,000 --> 00:00:08,200
In this tutorial, we will learn about subtitle localization.
<i>Enjoy the video!</i>

3
00:00:09,000 --> 00:00:12,000
Thank you for watching!
`;

  const testFilePath = path.join(__dirname, 'test_sample.srt');
  fs.writeFileSync(testFilePath, sampleSrtContent, 'utf-8');
  console.log(`[TEST] Wrote test SRT file to: ${testFilePath}`);

  try {
    // 2. Test srtParser directly
    console.log("\n--- Testing srtParser.parseFile ---");
    const { segments, template } = await srtParser.parseFile(testFilePath);
    console.log(`[TEST] Extracted ${segments.length} segments.`);
    console.log(`[TEST] Segment 1 Source: "${segments[0]?.source}"`);
    console.log(`[TEST] Segment 2 Source: "${segments[1]?.source}"`);
    console.log(`[TEST] Segment 3 Source: "${segments[2]?.source}"`);

    // Verify 1-based indexing standard
    if (segments[0].id !== 1 || segments[1].id !== 2 || segments[2].id !== 3) {
      throw new Error("STRICT 1-BASED INDEXING FAILED: Segment IDs are not 1-indexed!");
    }
    console.log("[PASS] 1-Based Indexing standard verified!");

    // 3. Test srtParser export with Hindi target translations
    console.log("\n--- Testing srtParser.exportFile ---");
    const testTranslatedSegments = [
      { id: 1, source: segments[0].source, target: "नमस्ते, इस वीडियो प्रस्तुति में आपका स्वागत है।\nयह पहले उपशीर्षक की दूसरी पंक्ति है।" },
      { id: 2, source: segments[1].source, target: "इस ट्यूटोरियल में, हम उपशीर्षक स्थानीयकरण के बारे में सीखेंगे।\n<i>वीडियो का आनंद लें!</i>" },
      { id: 3, source: segments[2].source, target: "देखने के लिए धन्यवाद!" }
    ];

    const exportedBuffer = await srtParser.exportFile(template, testTranslatedSegments);
    const exportedText = exportedBuffer.toString('utf-8');

    console.log("[TEST] Exported SRT Content:\n----------------------------------------");
    console.log(exportedText);
    console.log("----------------------------------------");

    // Assertions
    if (!exportedText.includes("नमस्ते, इस वीडियो प्रस्तुति में आपका स्वागत है।")) {
      throw new Error("Export verification failed: Target translation not found in exported output!");
    }
    if (!exportedText.includes("00:00:01,000 --> 00:00:04,500")) {
      throw new Error("Export verification failed: Timestamps missing or corrupted!");
    }
    if (!exportedText.includes("<i>वीडियो का आनंद लें!</i>")) {
      throw new Error("Export verification failed: Inline HTML tags not preserved!");
    }

    console.log("\n✅ ALL SRT PIPELINE TESTS PASSED SUCCESSFULLY!");
  } finally {
    // Clean up temporary test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
}

testSrtPipeline().catch((err) => {
  console.error("\n❌ SRT Pipeline Test Failed:", err);
  process.exit(1);
});
