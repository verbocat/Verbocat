const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { getLeafTextBlocks } = require("../src/utils/parsers/relinkEngine");
const { extractPlaceholders } = require("../src/utils/parsers/segmentationUtils");
const htmlParser = require("../src/utils/parsers/htmlParser");

async function findScreenshotSegments() {
  const srcPath = "C:\\Users\\Mohit\\Verbocat\\client\\src\\testing\\PL_DIGITAL_LOAN_AGREEMENT_PROD.html";
  const tgtPath = "C:\\Users\\Mohit\\Verbocat\\client\\src\\testing\\PL_DIGITAL_LOAN_AGREEMENT_PROD_Hindi_Revised 01.html";

  const srcResult = await htmlParser.parseFile(srcPath);
  const srcSegs = srcResult.segments;

  const targetHtmlContent = fs.readFileSync(tgtPath, "utf-8");
  const $target = cheerio.load(targetHtmlContent, { decodeEntities: false });
  const targetTagMap = new Map();
  const tagCounter = { value: 1 };
  const targetLeafBlocks = getLeafTextBlocks($target);
  const targetBlockPlaceholders = targetLeafBlocks.map(blockNode => {
    return extractPlaceholders(blockNode, $target, targetTagMap, tagCounter);
  });

  console.log("Searching for screenshot source text in sourceSegments...");
  srcSegs.forEach(s => {
    const clean = s.source.replace(/<[^>]+>/g, "").trim();
    if (clean.includes("the recovery of any and all amounts owed") ||
        clean.includes("the process of reviewing and approving credit") ||
        clean.includes("preventing, detecting and investigating fraud")) {
      console.log(`\nFound Source Seg #${s.id} (blockIndex: ${s.blockIndex}):`);
      console.log(`  SRC: "${s.source}"`);
      console.log(`  TGT Leaf Block #${s.blockIndex}: "${targetBlockPlaceholders[s.blockIndex] || "MISSING"}"`);
    }
  });

  console.log("\nSearching for screenshot target text in targetLeafBlocks...");
  targetBlockPlaceholders.forEach((text, bIdx) => {
    const clean = text.replace(/<[^>]+>/g, "").trim();
    if (clean.includes("750/-") || clean.includes("तीगत चार्जेस") || clean.includes("वास्तविक पर") || clean.includes("EMI/PEMI")) {
      console.log(`Found Target Leaf Block #${bIdx}: "${text}"`);
    }
  });
}

findScreenshotSegments().catch(e => console.error(e));
