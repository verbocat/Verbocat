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

    // Test Case 4: Hindi translation false positive (conjunction and/और is present)
    console.log("\n--- Test 4: Conjunction Check (False-Positive Prevention) ---");
    const sourceHindiConjunction = "The Borrower also confirm that Borrower is aware of and have understood the aforesaid charges applicable on the Flexi Loan and the approach for gradations of risk & rationale followed by Lender for charging different rate of interest to different categories of borrowers along with other policies published on its website.";
    const translationHindiConjunction = "उधारकर्ता यह भी पुष्टि करता है कि उधारकर्ता उपरोक्त चार्जों से अवगत है और फ्लेक्सी लोन पर लागू चार्जों को समझता है और जोखिम के ग्रेडेशन और विभिन्न श्रेणियों के उधारकर्ताओं पर विभिन्न ब्याज दरों को चार्ज करने के लिए ऋणदाता द्वारा अपनाई गई तर्कशक्ति को समझता है, साथ ही इसकी वेबसाइट पर प्रकाशित अन्य नीतियों को भी।";
    const resultConjunction = await evaluateTranslationMQM({
      sourceText: sourceHindiConjunction,
      translatedText: translationHindiConjunction,
      targetLang: "hi",
      sourceLang: "en",
      contextJira: "Loan agreement terms",
      contextDescription: "Accurate legal translation",
      contextSettings: {
        tone: "Formal",
        formality: "Formal"
      }
    });
    console.log("Evaluation Results (Expect 100/High Score, NO false omission of 'and'):", JSON.stringify(resultConjunction, null, 2));

    // Test Case 5: List Index Localization (h.) -> झ.))
    console.log("\n--- Test 5: List Index Localization ---");
    const sourceListIndex = "h.) The Borrower shall pay standard charges.";
    const translationListIndex = "झ.) उधारकर्ता मानक शुल्कों का भुगतान करेगा।";
    const resultListIndex = await evaluateTranslationMQM({
      sourceText: sourceListIndex,
      translatedText: translationListIndex,
      targetLang: "hi",
      sourceLang: "en",
      contextJira: "Loan agreement terms",
      contextDescription: "Accurate legal translation",
      contextSettings: {
        tone: "Formal",
        formality: "Formal"
      }
    });
    // Test Case 6: Acronym and Gender Agreement Check
    console.log("\n--- Test 6: Acronym and Gender Agreement Check ---");
    const sourceAcronymGender = "Please note your Consent is mandatory for opening of NRI Account";
    const translationAcronymGender = "कृपया ध्यान दें कि आपका सहमति एनआरआई खाता खोलने के लिए अनिवार्य है";
    const resultAcronymGender = await evaluateTranslationMQM({
      sourceText: sourceAcronymGender,
      translatedText: translationAcronymGender,
      targetLang: "hi",
      sourceLang: "en",
      contextJira: "NRI Account opening flow",
      contextDescription: "Consent must be translated as सहमति पत्र to reflect a formal document. Ensure grammatical gender agreement is correct. Acronyms like NRI must remain in English/Latin script.",
      contextSettings: {
        tone: "Formal",
        formality: "Formal"
      }
    });
    console.log("Evaluation Results (Expect acronym correction to NRI and gender agreement correction to आपकी सहमति / आपका सहमति पत्र):", JSON.stringify(resultAcronymGender, null, 2));

  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

runTest();
