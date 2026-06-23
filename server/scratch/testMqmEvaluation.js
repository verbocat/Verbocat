const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { evaluateTranslationMQM } = require("../src/services/mqmService");

async function runTest() {
  try {
    console.log("Running MQM Quality Auditor Verification Tests...");

    const sourceText = "Please note that your inquiry about the loan application has been updated in your CIBIL credit records.";

    // Test Case 1: Perfect Translation (Informal)
    console.log("\n--- Test 1: Perfect Informal Translation ---");
    const perfectTranslation = "Hey, just a heads-up: your loan application query has been updated on your CIBIL report.";
    const resultPerfect = await evaluateTranslationMQM({
      sourceText,
      translatedText: perfectTranslation,
      targetLang: "en",
      sourceLang: "en",
      contextJira: "Client dashboard notification",
      contextDescription: "make it extremely informal like day to day talk",
      contextSettings: {
        tone: "Casual",
        formality: "Informal"
      }
    });
    console.log("Evaluation Results (Expect High/100 Score):", JSON.stringify(resultPerfect, null, 2));

    // Test Case 2: Formal Translation when Informal was requested (Evaluating actual penalty)
    console.log("\n--- Test 2: Formal Translation with Casual constraints (Style Mismatch) ---");
    const formalTranslation = "Please note that your inquiry about the loan application has been updated in your CIBIL credit records.";
    const resultFormalMismatch = await evaluateTranslationMQM({
      sourceText,
      translatedText: formalTranslation,
      targetLang: "en",
      sourceLang: "en",
      contextJira: "Client dashboard notification",
      contextDescription: "make it extremely informal like day to day talk",
      contextSettings: {
        tone: "Casual",
        formality: "Informal"
      }
    });
    console.log("Evaluation Results (Expect style deductions & improvement suggestions):", JSON.stringify(resultFormalMismatch, null, 2));

    // Test Case 3: Terminology error (e.g. wrong banking terms)
    console.log("\n--- Test 3: Terminology Error (Mistranslation) ---");
    const badTranslation = "Hey, just a heads-up: your house shopping list has been updated in CIBIL credit records.";
    const resultBadTerm = await evaluateTranslationMQM({
      sourceText,
      translatedText: badTranslation,
      targetLang: "en",
      sourceLang: "en",
      contextJira: "Client dashboard notification",
      contextDescription: "make it extremely informal like day to day talk",
      contextSettings: {
        tone: "Casual",
        formality: "Informal"
      }
    });
    console.log("Evaluation Results (Expect severe accuracy/terminology deductions):", JSON.stringify(resultBadTerm, null, 2));

  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

runTest();
