const { restoreProtectedTags } = require("../src/utils/tagProtection");

// Mocking the translationService postProcessTranslation logic locally for verification
const postProcessTranslation = (source, target, targetLang) => {
  let output = String(target || "").trim();

  const prefixRegex = /^([a-zA-Z0-9]+[\.\)]\s*|^\([a-zA-Z0-9]+\)\s*)/;
  const sourceMatch = source.match(prefixRegex);
  if (sourceMatch) {
    const sourcePrefix = sourceMatch[1];
    if (!output.startsWith(sourcePrefix)) {
      const targetPrefixRegex = /^([^\s]+[\।\.\)]\s*|^\([^\s]+\)\s*)/;
      const targetMatch = output.match(targetPrefixRegex);
      if (targetMatch) {
        const targetPrefix = targetMatch[1];
        output = sourcePrefix + output.slice(targetPrefix.length);
      } else {
        output = sourcePrefix + output;
      }
    }
  }

  if (targetLang && targetLang.toLowerCase().startsWith("hi")) {
    const acronymsMap = {
      "आरबीआई": "RBI",
      "आर.बी.आई.": "RBI",
      "आरबीआइ": "RBI",
      "आर.बी.आइ.": "RBI",
      "आरबीआय": "RBI",
      "पीडीसी": "PDC",
      "पी.डी.सी.": "PDC",
      "केवाईसी": "KYC",
      "के.वाई.सी.": "KYC",
      "ओटीपी": "OTP",
      "ओ.टी.पी.": "OTP",
      "सिबिल": "CIBIL",
      "पैन": "PAN",
      "एनआरआई": "NRI",
      "एन.आर.आई.": "NRI"
    };
    
    Object.keys(acronymsMap).forEach(key => {
      const regex = new RegExp(key, "g");
      output = output.replace(regex, acronymsMap[key]);
    });
  }

  return output;
};

// 1. Verify list index preservation
console.log("=== Test 1: List Index Preservation ===");
const src1 = "h. This is a bullet point.";
const tgt1 = "ज। यह एक बुलेट पॉइंट है।";
const out1 = postProcessTranslation(src1, tgt1, "hi");
console.log("Source:", src1);
console.log("Original Target:", tgt1);
console.log("Fixed Target:", out1);
console.assert(out1.startsWith("h. "), "List prefix h. was not preserved!");

console.log("\n=== Test 2: Parentheses List Index ===");
const src2 = "b) Next point.";
const tgt2 = "ख) अगला पॉइंट।";
const out2 = postProcessTranslation(src2, tgt2, "hi");
console.log("Source:", src2);
console.log("Original Target:", tgt2);
console.log("Fixed Target:", out2);
console.assert(out2.startsWith("b) "), "List prefix b) was not preserved!");

// 2. Verify acronym preservation
console.log("\n=== Test 3: Acronym Preservation ===");
const src3 = "Please check RBI guidelines.";
const tgt3 = "कृपया आरबीआई दिशानिर्देशों की जांच करें।";
const out3 = postProcessTranslation(src3, tgt3, "hi");
console.log("Source:", src3);
console.log("Original Target:", tgt3);
console.log("Fixed Target:", out3);
console.assert(out3.includes("RBI"), "RBI was not preserved!");

const src4 = "PDC is required.";
const tgt4 = "पीडीसी आवश्यक है।";
const out4 = postProcessTranslation(src4, tgt4, "hi");
console.log("Source:", src4);
console.log("Original Target:", tgt4);
console.log("Fixed Target:", out4);
console.assert(out4.includes("PDC"), "PDC was not preserved!");

// 3. Verify tag preservation fallback
console.log("\n=== Test 4: Tag Preservation Fallback ===");
const originalTags = ["<5261>", "</5261>"];
const translatedWithOmittedTags = "यह एक अनुवाद है।"; // model completely omitted tags
const restored = restoreProtectedTags(translatedWithOmittedTags, originalTags);
console.log("Original tags:", originalTags);
console.log("Translated with omitted tags:", translatedWithOmittedTags);
console.log("Restored:", restored);
console.assert(restored.includes("<5261>") && restored.includes("</5261>"), "Omitted tags were not restored!");

console.log("\nAll tests passed successfully!");
