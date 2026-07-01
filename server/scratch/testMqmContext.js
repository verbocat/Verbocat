const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { evaluateTranslationMQM } = require("../src/services/mqmService");

async function runTests() {
  try {
    console.log("=================================================");
    console.log("   UPGRADED MQM DOMAIN AWARENESS VERIFICATION   ");
    console.log("=================================================");

    // Test Case 1: Drawing Power
    console.log("\n--- Test 1: Drawing Power (Expect no suggestion to change to 'उपयोग की शक्ति') ---");
    const result1 = await evaluateTranslationMQM({
      sourceText: "Basis for classification – Outstanding balance remains continuously in excess of the sanctioned limit or drawing power, whichever is lower, for a period of",
      translatedText: "वर्गीकरण का आधार – बकाया राशि स्वीकृत सीमा या ड्राइंग पावर, जो भी कम हो, के लगातार अधिक रहने की स्थिति में, एक अवधि के लिए",
      targetLang: "hi",
      sourceLang: "en",
      contextSettings: {
        domain: "Banking",
        formality: "Formal"
      },
      isFullAudit: true
    });
    console.log(JSON.stringify(result1, null, 2));

    // Test Case 2: Invocation
    console.log("\n--- Test 2: Invocation (Expect no suggestion to change 'प्रवर्तन' to 'आवेदन') ---");
    const result2 = await evaluateTranslationMQM({
      sourceText: "(iii) Lien creation/ invocation / revocation charges",
      translatedText: "(iii) लियन निर्माण/प्रवर्तन/रद्दीकरण शुल्क",
      targetLang: "hi",
      sourceLang: "en",
      contextSettings: {
        domain: "Legal",
        formality: "Formal"
      },
      isFullAudit: true
    });
    console.log(JSON.stringify(result2, null, 2));

    // Test Case 3: To the Extent of Conflict
    console.log("\n--- Test 3: To the Extent of Conflict (Expect no suggestion to change 'संघर्ष की सीमा तक' to 'संघर्ष के मामले में') ---");
    const result3 = await evaluateTranslationMQM({
      sourceText: "In the event of a conflict between the Sanction Letter and the Loan Agreement, the Loan Agreement shall prevail to the extent of conflict.",
      translatedText: "यदि स्वीकृति पत्र और ऋण समझौते के बीच कोई संघर्ष होता है, तो संघर्ष की सीमा तक ऋण समझौता प्रबल होगा।",
      targetLang: "hi",
      sourceLang: "en",
      contextSettings: {
        domain: "Legal",
        formality: "Formal"
      },
      isFullAudit: true
    });
    console.log(JSON.stringify(result3, null, 2));

    // Test Case 4: At Actuals
    console.log("\n--- Test 4: At Actuals (Expect no suggestion to change 'वास्तविक लागत' to 'वास्तविक मूल्य') ---");
    const result4 = await evaluateTranslationMQM({
      sourceText: "At actuals + applicable taxes (Brokerage charges shall be deducted by the Depository participant on event of sale of the Securities)",
      translatedText: "वास्तविक लागत + लागू कर (ब्रोकर शुल्क प्रतिभूतियों की बिक्री की स्थिति में डिपॉजिटरी प्रतिभागी द्वारा काटा जाएगा)",
      targetLang: "hi",
      sourceLang: "en",
      contextSettings: {
        domain: "Financial",
        formality: "Formal"
      },
      isFullAudit: true
    });
    console.log(JSON.stringify(result4, null, 2));

  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

runTests();
