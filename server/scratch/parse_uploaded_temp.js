const fs = require("fs");
const { parseFile } = require("../src/utils/parsers/htmlParser");

async function run() {
  try {
    const originalPath = "C:\\Users\\divya\\Downloads\\MFSA_SANCTION_LETTER_PROD (1).html";
    const hiPath = "C:\\Users\\divya\\Downloads\\MFSA_SANCTION_LETTER_PROD (1)_hi.html";

    console.log("Parsing Original English file...");
    const originalResult = await parseFile(originalPath);
    console.log(`Original segment count: ${originalResult.segments.length}`);

    console.log("Parsing Exported Hindi file...");
    const hiResult = await parseFile(hiPath);
    console.log(`Exported Hindi segment count: ${hiResult.segments.length}`);

    // If there's a difference, print out the segments that are in original but not in hi (or compare the texts)
    console.log("\nFirst 10 segments of Original:");
    originalResult.segments.slice(0, 10).forEach(s => console.log(`[${s.id}] "${s.source}"`));

    console.log("\nFirst 10 segments of Hindi:");
    hiResult.segments.slice(0, 10).forEach(s => console.log(`[${s.id}] "${s.source}"`));

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
