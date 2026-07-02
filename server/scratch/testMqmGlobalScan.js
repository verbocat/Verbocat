const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mqmService = require("../src/services/mqmService");

async function runGlobalScanTest() {
  console.log("Running MQM Global Scan and Chunking Verification Tests...");

  // Mock segments with intentional errors
  // - Segment 3 has a gender agreement typo ("अपना सहमति") and transliterated acronym ("एनआरआई")
  // - Segment 4 has a critical legal mistranslation: "Borrower" translated as "ऋणदाता" (Lender)
  const segments = [
    {
      segment_index: 0,
      source_text: "Borrower represents that all details are accurate.",
      target_text: "उधारकर्ता दर्शाता है कि सभी विवरण सही हैं।"
    },
    {
      segment_index: 1,
      source_text: "Lender will charge an annual fee of 500 Rupees.",
      target_text: "ऋणदाता 500 रुपये का वार्षिक शुल्क वसूल करेगा।"
    },
    {
      segment_index: 2,
      source_text: "The Borrower shall pay all charges on time.",
      target_text: "उधारकर्ता समय पर सभी प्रभार का भुगतान करेगा।"
    },
    {
      segment_index: 3,
      source_text: "Borrower must give Consent for NRI account.",
      target_text: "उधारकर्ता को एनआरआई खाते के लिए अपना सहमति देना होगा।"
    },
    {
      segment_index: 4,
      source_text: "Borrower must pay the fee.",
      target_text: "ऋणदाता को शुल्क का भुगतान करना होगा।"
    }
  ];

  const targetLang = "hi";
  const sourceLang = "en";
  const contextSettings = {
    tone: "Formal",
    formality: "Formal",
    glossary: []
  };

  try {
    console.log("\n--- Phase 1: Running Global Scan on Segments ---");
    const report = await mqmService.scanDocumentGlobally(segments, targetLang, sourceLang, contextSettings);
    console.log("Global Scan Report:", JSON.stringify(report, null, 2));

    console.log("\n--- Phase 2: Running Segment Audit with Global Context ---");
    // Audit Segment 4 (Borrower -> Lender mistranslation)
    const seg4 = segments[4];
    const seg4Mqm = await mqmService.evaluateTranslationMQM({
      sourceText: seg4.source_text,
      translatedText: seg4.target_text,
      targetLang,
      sourceLang,
      contextJira: "Global Scan Test Case",
      contextDescription: "Consent must be translated as सहमति पत्र. Acronym NRI must be Latin.",
      contextSettings,
      isFullAudit: true,
      globalReport: report,
      segmentIndex: 4
    });

    console.log("Segment 4 Audit Result:", JSON.stringify(seg4Mqm, null, 2));

    // Audit Segment 3 (Consent & NRI issues)
    const seg3 = segments[3];
    const seg3Mqm = await mqmService.evaluateTranslationMQM({
      sourceText: seg3.source_text,
      translatedText: seg3.target_text,
      targetLang,
      sourceLang,
      contextJira: "Global Scan Test Case",
      contextDescription: "Consent must be translated as सहमति पत्र. Acronym NRI must be Latin.",
      contextSettings,
      isFullAudit: true,
      globalReport: report,
      segmentIndex: 3
    });

    console.log("Segment 3 Audit Result:", JSON.stringify(seg3Mqm, null, 2));

  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

runGlobalScanTest();
