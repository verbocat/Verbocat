const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mqmService = require("../src/services/mqmService");

async function runGlobalScanTest() {
  console.log("Running MQM Global Scan and Chunking Verification Tests...");

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

    console.log("\n--- Phase 2: Running 3-Pass Batch Pipeline on Segments ---");
    
    // Pass 1: Batch detection
    console.log("Calling evaluateBatchPass1...");
    const rawErrors = await mqmService.evaluateBatchPass1({
      segments,
      targetLang,
      sourceLang,
      contextSettings,
      globalReport: report
    });
    console.log("Detected Errors:", JSON.stringify(rawErrors, null, 2));

    if (rawErrors.length > 0) {
      // Pass 2: Batch Post-Editing
      console.log("\nCalling evaluateBatchPass2...");
      const corrections = await mqmService.evaluateBatchPass2({
        batch: segments,
        detectedErrors: rawErrors,
        targetLang,
        sourceLang,
        contextSettings,
        globalReport: report
      });
      console.log("Post-Edited Corrections:", JSON.stringify(corrections, null, 2));

      // Pass 3: Batch Verdict QA Judging
      console.log("\nCalling evaluateBatchPass3...");
      const verdicts = await mqmService.evaluateBatchPass3({
        batch: segments,
        corrections,
        detectedErrors: rawErrors,
        targetLang,
        sourceLang,
        contextSettings,
        globalReport: report
      });
      console.log("Judge Verdicts:", JSON.stringify(verdicts, null, 2));
    } else {
      console.log("No errors detected in Pass 1.");
    }

  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

runGlobalScanTest();
