const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { evaluateTranslationMQM } = require("../src/services/mqmService");

async function runTests() {
  try {
    console.log("=================================================");
    console.log("   UPGRADED MQM CONTEXT AUDITOR VERIFICATION    ");
    console.log("=================================================");

    // Test Case 1: Glossary Matching & Terminology Checking
    console.log("\n--- Test 1: Glossary Term Violation Detection ---");
    const resultGlossary = await evaluateTranslationMQM({
      sourceText: "This Agreement shall be governed by law.",
      translatedText: "यह दस्तावेज़ कानून द्वारा शासित होगा।", // Translates Agreement as दस्तावेज़ instead of समझौता
      targetLang: "hi",
      sourceLang: "en",
      contextSettings: {
        glossary: [
          { source: "Agreement", target: "समझौता" },
          { source: "law", target: "कानून" }
        ]
      }
    });
    console.log("Evaluation Results (Expect Terminology issue for 'दस्तावेज़'/'Agreement'):");
    console.log(JSON.stringify(resultGlossary, null, 2));

    // Test Case 2: Language Independence (Spanish Audit)
    console.log("\n--- Test 2: Spanish Translation Style & Tone Check ---");
    const resultSpanish = await evaluateTranslationMQM({
      sourceText: "Please complete your KYC application.",
      translatedText: "Completa tu solicitud de KYC.", // Casual (Completa tu) instead of requested Formal (Por favor complete su)
      targetLang: "es",
      sourceLang: "en",
      contextSettings: {
        tone: "Formal",
        formality: "Formal",
        domain: "Banking"
      }
    });
    console.log("Evaluation Results (Expect Style/Fluency issue for casualness in Spanish):");
    console.log(JSON.stringify(resultSpanish, null, 2));

  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

runTests();
