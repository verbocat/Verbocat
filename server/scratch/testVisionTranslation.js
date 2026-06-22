const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { translateSegmentWithVision } = require("../src/services/translationProviders");

async function runTest() {
  try {
    console.log("Running context-aware translation test...");
    const sourceText = "PFL may increase, decrease, or change the interest rate based on the applicable <65>RPLR</65> at its sole discretion and will notify you by updating on its website regarding this matter. The applicable revised <66>RPLR</66> will be updated from time to time on the lender's website. Such changed interest rate shall become applicable and payable from a prospective date notified by the lender and shall be binding on you.";
    
    // Test 1: Hindi, Casual, Informal
    console.log("--- Test 1: Target: Hindi, Tone: Casual, Formality: Informal ---");
    const resultHindiInformal = await translateSegmentWithVision({
      sourceText,
      targetLang: "hi",
      sourceLang: "en",
      contextJira: "Legal clause translation for user dashboard. Should be easy for common people to understand.",
      contextDescription: "Translate this legal disclaimer into extremely informal, friendly, day-to-day spoken language. Avoid heavy legal words like 'एकमात्र फैसले', 'विवेक', 'बाइंडਿੰਗ', 'ਲਾਗੂ' where possible. Make it sound like a person explaining it to a friend.",
      screenshotBuffer: null,
      screenshotMimeType: null,
      contextSettings: {
        tone: "Casual",
        formality: "Informal",
        domain: "Banking"
      }
    });
    console.log("Informal Hindi Translation:\n", resultHindiInformal);

    // Test 2: Target: English, Tone: Casual, Formality: Informal (to check targetLang English doesn't return Hindi!)
    console.log("\n--- Test 2: Target: English, Tone: Casual, Formality: Informal ---");
    const resultEnglishInformal = await translateSegmentWithVision({
      sourceText: "PFL ਆਪਣੇ ਅਨੁਸਾਰ ਵਿਆਜ ਦਰ ਨੂੰ ਵਧਾ, ਘਟਾ ਜਾਂ ਬਦਲ ਸਕਦੀ ਹੈ।",
      targetLang: "en",
      sourceLang: "pa",
      contextJira: "Translation for English users",
      contextDescription: "Make it informal day-to-day speech.",
      screenshotBuffer: null,
      screenshotMimeType: null,
      contextSettings: {
        tone: "Casual",
        formality: "Informal"
      }
    });
    console.log("Informal English Translation:\n", resultEnglishInformal);

    // Test 3: Refinement Test (Formal English -> Extremely Informal English)
    console.log("\n--- Test 3: Target: English, Refinement: make it extremely informal ---");
    const resultRefinedInformal = await translateSegmentWithVision({
      sourceText: "ਕਿਰਪਾ ਕਰਕੇ ਨੋਟ ਕਰੋ ਕਿ ਲੋਨ ਅਰਜ਼ੀ ਬਾਰੇ ਤੁਹਾਡੀ ਪੁੱਛਗਿੱਛ ਤੁਹਾਡੇ ਸਿਬਿਲ ਕ੍ਰੈਡਿਟ ਰਿਕਾਰਡਾਂ ਵਿੱਚ ਅਪਡੇਟ ਕੀਤੀ ਗਈ ਹੈ।",
      existingTranslation: "Please note that your inquiry about the loan application has been updated in your CIBIL credit records.",
      targetLang: "en",
      sourceLang: "pa",
      contextJira: "Translate loan update notification",
      contextDescription: "is too formal make it extreemly informal like day to day talk",
      screenshotBuffer: null,
      screenshotMimeType: null,
      contextSettings: {
        tone: "General",
        formality: "Neutral"
      }
    });
    console.log("Extremely Informal English Refinement:\n", resultRefinedInformal);

    // Test 4: Refinement Test (Informal English -> Formal English again)
    console.log("\n--- Test 4: Target: English, Refinement: make it formal again ---");
    const resultRefinedFormal = await translateSegmentWithVision({
      sourceText: "ਕਿਰਪਾ ਕਰਕੇ ਨੋਟ ਕਰੋ ਕਿ ਲੋਨ ਅਰਜ਼ੀ ਬਾਰੇ ਤੁਹਾਡੀ ਪੁੱਛਗਿੱਛ ਤੁਹਾਡੇ ਸਿਬਿਲ ਕ੍ਰੈਡਿਟ ਰਿਕਾਰਡਾਂ ਵਿੱਚ ਅਪਡੇਟ ਕੀਤੀ ਗਈ ਹੈ।",
      existingTranslation: resultRefinedInformal,
      targetLang: "en",
      sourceLang: "pa",
      contextJira: "Translate loan update notification",
      contextDescription: "make it formal again",
      screenshotBuffer: null,
      screenshotMimeType: null,
      contextSettings: {
        tone: "General",
        formality: "Neutral"
      }
    });
    console.log("Formalized English Refinement:\n", resultRefinedFormal);

  } catch (err) {
    console.error("Test failed:", err);
  }
}

runTest();
