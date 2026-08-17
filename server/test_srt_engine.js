const { buildSlidingWindowPayload } = require('./src/srtEngine/srtSlidingWindow');
const { buildSrtSystemPrompt } = require('./src/srtEngine/srtPrompts');
const { runTwoPassSrtPolish } = require('./src/srtEngine/srtPolishPipeline');
const { translateSrtSegments } = require('./src/srtEngine/srtTranslationService');

async function testSrtEngine() {
  console.log("========================================");
  console.log("Starting Dedicated SRT Engine Test Suite");
  console.log("========================================");

  // 1. Test Sliding Window
  console.log("\n--- 1. Testing srtSlidingWindow ---");
  const dummySegments = [
    { id: 1, source: "Are you sure you want to go in there?" },
    { id: 2, source: "I told you, I'm not afraid." },
    { id: 3, source: "Get out of my way." },
    { id: 4, source: "Or I will make you." },
    { id: 5, source: "Wait, stop right there!" }
  ];

  const payload = buildSlidingWindowPayload(dummySegments, 2, 2, 2);
  console.log("[TEST] Sliding Window Payload for Cue #3:\n", payload.fullPromptText);

  if (!payload.fullPromptText.includes("Cue #1:") || !payload.fullPromptText.includes("Cue #3: Get out of my way.") || !payload.fullPromptText.includes("Cue #5:")) {
    throw new Error("Sliding window payload generation failed!");
  }
  console.log("✅ Sliding Window test passed!");

  // 2. Test Subtitle Localizer Prompt Generation
  console.log("\n--- 2. Testing srtPrompts ---");
  const srtPrompt = buildSrtSystemPrompt("hi", "en", {
    genre: "Action & Thriller",
    formality: "Casual & Conversational"
  });
  console.log("[TEST] System Prompt:\n", srtPrompt);

  if (!srtPrompt.includes("UNIVERSAL SCREENPLAY LOCALIZATION DIRECTIVES") || !srtPrompt.includes("Action & Thriller")) {
    throw new Error("SRT prompt generation failed!");
  }
  console.log("✅ SRT System Prompt test passed!");

  // 3. Test Two-Pass Polish Pipeline Mock
  console.log("\n--- 3. Testing srtPolishPipeline ---");
  const mockAiCaller = async (sysPrompt, userText) => {
    return JSON.stringify([
      "नमस्ते, क्या तुम वहाँ जाना चाहते हो?",
      "मैंने कहा ना, मुझे डर नहीं लगता।",
      "मेरे रास्ते से हट जाओ।",
      "वरना मैं तुम्हें हटा दूंगा।"
    ]);
  };

  const draftBlock = [
    { id: 1, source: "Are you sure?", target: "क्या तुम पक्के हो?" },
    { id: 2, source: "I am not afraid.", target: "मुझे डर नहीं है।" },
    { id: 3, source: "Get out.", target: "बाहर निकल।" },
    { id: 4, source: "Or else.", target: "वरना।" }
  ];

  const polished = await runTwoPassSrtPolish(draftBlock, { genre: "Cinema & Drama" }, "hi", mockAiCaller);
  console.log("[TEST] Polished Targets:", polished.map(p => p.target));
  
  if (polished[0].target !== "नमस्ते, क्या तुम वहाँ जाना चाहते हो?") {
    throw new Error("Two-pass polish pipeline failed!");
  }
  console.log("✅ Two-Pass Polish test passed!");

  // 4. Test SRT Export Line Break Preservation
  console.log("\n--- 4. Testing SRT Export Line Break Preservation ---");
  const { parseFile, exportFile } = require('./src/utils/parsers/srtParser');
  const path = require('path');
  const fs = require('fs');

  const testSrtPath = path.join(__dirname, 'scratch_linebreak_test.srt');
  fs.writeFileSync(testSrtPath, "1\n00:00:01,000 --> 00:00:04,000\nFirst line of text\nSecond line of text\n\n2\n00:00:05,000 --> 00:00:08,000\nSingle line text cue\n", 'utf-8');

  const parsedData = await parseFile(testSrtPath);
  console.log("[TEST] Parsed segment 1 source:", JSON.stringify(parsedData.segments[0].source));

  if (!parsedData.segments[0].source.includes("\n")) {
    fs.unlinkSync(testSrtPath);
    throw new Error("Multi-line source text failed to preserve newline!");
  }

  // Simulate translated segments with line breaks
  const translatedSegs = [
    { id: 1, source: parsedData.segments[0].source, target: "पहली पंक्ति\nदूसरी पंक्ति" },
    { id: 2, source: parsedData.segments[1].source, target: "एकल पंक्ति वाला संवाद पाठ" }
  ];

  const exportedBuffer = await exportFile(parsedData.template, translatedSegs);
  const exportedText = exportedBuffer.toString('utf-8');
  console.log("[TEST] Exported SRT content:\n" + exportedText);

  fs.unlinkSync(testSrtPath);

  if (!exportedText.includes("पहली पंक्ति\nदूसरी पंक्ति")) {
    throw new Error("Exported SRT failed to preserve internal line breaks!");
  }
  console.log("✅ SRT Export Line Break test passed!");

  console.log("\n✅ ALL DEDICATED SRT ENGINE TESTS PASSED SUCCESSFULLY!");
}

testSrtEngine().catch(err => {
  console.error("\n❌ SRT Engine Test Failed:", err);
  process.exit(1);
});
