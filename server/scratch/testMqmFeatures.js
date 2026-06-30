require("dotenv").config({ path: "./.env" });
const { translateSegmentWithContext } = require("../src/services/translationService");
const { evaluateTranslationMQM } = require("../src/services/mqmService");

async function runMqmFeatureTests() {
  console.log("=====================================================================");
  console.log("             MQM & RETRANSLATE PIPELINE SIMULATOR");
  console.log("=====================================================================");

  const testCases = [
    {
      id: 1,
      sourceText: "Dishonour of any payment instructions provided under the Agreement.",
      contextJira: "STORY-402: Add legal penalty clauses for payment instruction failure.",
      contextDescription: "",
      targetLang: "hi",
      sourceLang: "en"
    },
    {
      id: 2,
      sourceText: "In case Co-Borrower is a partnership firm, duly represented by authorised partner, including the legal heirs, executors and administrators of the last such surviving partner.",
      contextJira: "STORY-509: Legal definition of partner successorship rights.",
      contextDescription: "",
      targetLang: "hi",
      sourceLang: "en"
    }
  ];

  for (const tc of testCases) {
    console.log(`\n---------------------------------------------------------------------`);
    console.log(`[TEST CASE #${tc.id}] Source: "${tc.sourceText}"`);
    console.log(`---------------------------------------------------------------------`);

    // 1. Initial Translation (Without corrections in context description)
    console.log("\n[Step 1] Running translation with basic context...");
    const res1 = await translateSegmentWithContext({
      sourceText: tc.sourceText,
      existingTranslation: "",
      targetLang: tc.targetLang,
      sourceLang: tc.sourceLang,
      contextJira: tc.contextJira,
      contextDescription: tc.contextDescription,
      screenshotBuffer: null,
      screenshotMimeType: null,
      contextSettings: { tone: "Formal", formality: "Formal" }
    });

    console.log(`-> Initial Translation: "${res1.translated}"`);
    console.log(`-> Initial MQM Score: ${res1.mqmAccuracyScore}`);
    console.log(`-> Initial MQM Errors:`, JSON.stringify(res1.mqmReport?.errors || [], null, 2));

    const errors = res1.mqmReport?.errors || [];
    const suggestion = res1.mqmReport?.improvementSuggestion || "";
    console.log(`-> Improvement Suggestion: "${suggestion}"`);

    if (errors.length > 0 && suggestion) {
      // 2. Auto Apply Prompt & Retranslate (Append suggestion to context description)
      console.log("\n[Step 2] Auto-applying suggestion to prompt and retranslating...");
      const updatedDescription = tc.contextDescription
        ? `${tc.contextDescription}\n${suggestion}`
        : suggestion;

      console.log(`-> Updated Prompt (Context Description): "${updatedDescription.replace(/\n/g, ' | ')}"`);

      const res2 = await translateSegmentWithContext({
        sourceText: tc.sourceText,
        existingTranslation: res1.translated,
        targetLang: tc.targetLang,
        sourceLang: tc.sourceLang,
        contextJira: tc.contextJira,
        contextDescription: updatedDescription,
        screenshotBuffer: null,
        screenshotMimeType: null,
        contextSettings: { tone: "Formal", formality: "Formal" }
      });

      console.log(`-> Retranslated Output: "${res2.translated}"`);
      console.log(`-> Retranslated MQM Score: ${res2.mqmAccuracyScore}`);
      console.log(`-> Retranslated MQM Errors:`, JSON.stringify(res2.mqmReport?.errors || [], null, 2));

      if (res2.mqmAccuracyScore > res1.mqmAccuracyScore) {
        console.log(`\n🎉 SUCCESS: MQM Score improved from ${res1.mqmAccuracyScore} to ${res2.mqmAccuracyScore}!`);
      } else {
        console.log(`\n⚠️ WARNING: MQM Score did not improve (Stayed at ${res2.mqmAccuracyScore}).`);
      }
    } else {
      console.log("\n✅ No initial errors detected or no suggestion generated. Translation is perfect!");
    }
  }
  console.log("\n=====================================================================");
}

runMqmFeatureTests().catch(console.error);
