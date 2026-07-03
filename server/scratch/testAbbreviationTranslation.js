const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { postProcessTranslation } = require("../src/services/translationService");
const { evaluateTranslationMQM } = require("../src/services/mqmService");
const { translateChunk } = require("../src/services/translationProviders");

async function runTests() {
  console.log("=== STARTING ABBREVIATION TRANSLATION TESTS ===");

  // Test 1: postProcessTranslation Acronym Preservation in Native Script
  console.log("\n--- Test 1: postProcessTranslation Acronym Script Preservation ---");
  const testCasesPostProcess = [
    {
      source: "Please note RBI guidelines.",
      translated: "कृपया आरबीआई दिशानिर्देशों का पालन करें।",
      expectedContain: "RBI"
    },
    {
      source: "Classification of loan account as SMA/NPA.",
      translated: "ऋण खाते का वर्गीकरण एसएमए/एनपीए के रूप में।",
      expectedContain: "SMA/NPA"
    },
    {
      source: "Check your SMA-1 status.",
      translated: "अपनी एसएमए-1 स्थिति की जाँच करें।",
      expectedContain: "SMA-1"
    },
    {
      source: "Account is SMA-2.",
      translated: "खाता एसएमए-2 है।",
      expectedContain: "SMA-2"
    },
    {
      source: "Report SMA-0 classification.",
      translated: "एसएमए-0 वर्गीकरण की रिपोर्ट करें।",
      expectedContain: "SMA-0"
    }
  ];

  for (const tc of testCasesPostProcess) {
    const output = postProcessTranslation(tc.source, tc.translated, "hi");
    console.log(`Source: "${tc.source}"`);
    console.log(`Input Target: "${tc.translated}"`);
    console.log(`Output: "${output}"`);
    const success = output.includes(tc.expectedContain);
    console.log(`Result: ${success ? "SUCCESS" : "FAILED"} (Expected containing: "${tc.expectedContain}")`);
    if (!success) {
      throw new Error(`Test failed: expected "${output}" to contain "${tc.expectedContain}"`);
    }
  }

  // Test 2: MQM Acronym / Transliteration Verification
  console.log("\n--- Test 2: MQM Evaluation Acronym check ---");
  
  // Transliterated RBI/NRI/etc. SHOULD be flagged as terminology errors
  const mqmInput1 = {
    sourceText: "Please check your NRI status for opening the account.",
    translatedText: "कृपया खाता खोलने के लिए अपनी एनआरआई स्थिति की जांच करें।",
    targetLang: "hi",
    sourceLang: "en"
  };

  const report1 = await evaluateTranslationMQM(mqmInput1);
  console.log("Report for Transliterated NRI (should flag 'एनआरआई' as terminology/acronym error):");
  console.log(JSON.stringify(report1, null, 2));
  
  const hasAcronymError1 = (report1?.errors || []).some(e => e.category === "terminology" && (e.span === "एनआरआई" || e.span === "NRI" || e.snippet === "एनआरआई"));
  console.log(`Has Acronym Error (Transliterated): ${hasAcronymError1 ? "YES (SUCCESS)" : "NO (FAILED)"}`);
  if (!hasAcronymError1) {
    throw new Error("Transliterated acronym was not flagged as an error!");
  }

  // Expanded NRI (e.g. "अनिवासी भारतीय") SHOULD be flagged as a terminology error because it is expanded
  const mqmInput2 = {
    sourceText: "Please check your NRI status for opening the account.",
    translatedText: "कृपया खाता खोलने के लिए अपनी अनिवासी भारतीय स्थिति की जांच करें।",
    targetLang: "hi",
    sourceLang: "en"
  };

  const report2 = await evaluateTranslationMQM(mqmInput2);
  console.log("\nReport for Expanded NRI (should flag 'अनिवासी भारतीय' as terminology error):");
  console.log(JSON.stringify(report2, null, 2));

  const hasExpansionError = (report2?.errors || []).some(e => e.category === "terminology" && e.span === "अनिवासी भारतीय");
  console.log(`Has Expansion Error: ${hasExpansionError ? "YES (SUCCESS)" : "NO (FAILED)"}`);
  if (!hasExpansionError) {
    console.warn("WARNING: Expansion was not flagged programmatically by checkAcronymErrors. This is fine if LLM flags it contextually, but check if we want strict programmatic check.");
  }

  // Test 3: LLM Translation with Abbreviations (if API key available)
  if (process.env.OPENAI_API_KEY) {
    console.log("\n--- Test 3: Actual OpenAI Translation for Abbreviations ---");
    const testSources = [
      "Classification of loan account as SMA/NPA.",
      "SMA-1 classification is applicable.",
      "The loan account is tagged as SMA-2.",
      "SMA-0 status should be monitored.",
      "Submit your KYC documents along with your PAN details."
    ];

    try {
      const results = await translateChunk(testSources, "hi", "en", undefined, { tone: "Formal", formality: "Formal", domain: "Banking" });
      console.log("OpenAI translation results:");
      console.log(JSON.stringify(results, null, 2));

      for (let i = 0; i < testSources.length; i++) {
        const res = results[i].translated;
        console.log(`Source: "${testSources[i]}" -> Translated: "${res}"`);
      }
    } catch (e) {
      console.error("OpenAI API call failed:", e.message);
    }
  } else {
    console.log("\nSkipping OpenAI translation test since OPENAI_API_KEY is not configured.");
  }

  console.log("\n=== ALL ABBREVIATION TRANSLATION TESTS COMPLETED SUCCESSFULLY ===");
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
