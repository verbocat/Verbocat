const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { evaluateTranslationMQM } = require("../src/services/mqmService");
const { translateSegmentWithContext } = require("../src/services/translationService");

async function runTests() {
  try {
    console.log("=================================================");
    console.log("   UPGRADED MQM & TRANSLATION CONTEXT TESTS     ");
    console.log("=================================================");

    // Test 1: Continuation Clause Audit
    console.log("\n--- Test 1: Continuation Clause MQM Audit ---");
    const resultContinuation = await evaluateTranslationMQM({
      sourceText: "there occurs any material change in the opinion of PCHFL on the basis of which the loan was originally sanctioned.",
      translatedText: "PCHFL के विचार में कोई महत्वपूर्ण परिवर्तन होता है जिसके आधार पर ऋण को मूल रूप से स्वीकृत किया गया था।",
      targetLang: "hi",
      sourceLang: "en",
      prevSource: "This approval shall stand cancelled and revoked if:",
      prevTarget: "यह स्वीकृति रद्द और निरस्त हो जाएगी यदि:",
      isFullAudit: true
    });
    console.log("Evaluation Results (Expect High/100 Score, NO false error on 'होता है'):");
    console.log(JSON.stringify(resultContinuation, null, 2));

    // Test 2: Ambiguous 'Term of Loan' Translation with Next Segment Context
    console.log("\n--- Test 2: 'Term of Loan' Translation Context ---");
    const translationResult = await translateSegmentWithContext({
      sourceText: "Term of Loan",
      existingTranslation: "",
      targetLang: "hi",
      sourceLang: "en",
      nextSource: "36 months",
      nextTarget: "36 महीने",
      contextSettings: { tone: "Formal", formality: "Formal" }
    });
    console.log("Translation Results (Expect 'अवधि' in translation, NOT 'शर्त'):");
    console.log("Translated Text:", translationResult.translated);

    // Test 3: Ambiguous 'Term of Loan' MQM Audit with Next Segment Context
    console.log("\n--- Test 3: 'Term of Loan' MQM Audit Context ---");
    const resultMqmAmbiguity = await evaluateTranslationMQM({
      sourceText: "Term of Loan",
      translatedText: "ऋण की अवधि",
      targetLang: "hi",
      sourceLang: "en",
      nextSource: "36 months",
      nextTarget: "36 महीने",
      isFullAudit: true
    });
    console.log("Evaluation Results (Expect High/100 Score, NO suggestion to replace with 'शर्त'):");
    console.log(JSON.stringify(resultMqmAmbiguity, null, 2));

  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

runTests();
