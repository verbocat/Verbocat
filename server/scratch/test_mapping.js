const fs = require("fs");
const path = require("path");
const { parseXliff } = require("../src/utils/exporters");
const { parseFile: parseHtmlFile } = require("../src/utils/parsers/htmlParser");

const xlfPath = "C:\\Users\\divya\\Downloads\\ML_SANCTION_LETTER.html_en-US_pa-IN.sdlxliff";
const htmlPath = "C:\\Users\\divya\\Downloads\\KFS and sanction letter_All batches (1)\\KFS and sanction letter_All batches\\KFS and sanction letter_All batches\\Batch 06\\ML_SANCTION_LETTER.html";

async function testMapping() {
  const xml = fs.readFileSync(xlfPath, "utf-8");
  const xlfSegmentsRaw = parseXliff(xml);
  
  const xlfSegments = xlfSegmentsRaw.map((seg, idx) => ({
    id: seg.id || idx + 1,
    source: seg.source,
    target: seg.target || ""
  }));

  const { segments: htmlSegments } = await parseHtmlFile(htmlPath);

  const extractTagsOnly = (str) => {
    return (str.match(/<\/?\d+>/g) || []).join(" ");
  };
  
  const cleanText = (text) => {
    let decoded = (text || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ");

    return decoded
      .replace(/<[^>]+>/g, "")
      .replace(/__TAG_\d+__/g, "") 
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  };

  const sourceMap = new Map();
  xlfSegments.forEach(seg => {
    const key = cleanText(seg.source);
    if (key && seg.target && seg.target.trim() !== "") {
      if (!sourceMap.has(key)) {
        sourceMap.set(key, seg.target);
      }
    }
  });

  const mappedTargets = new Array(htmlSegments.length).fill(null);
  const isVerifiedArr = new Array(htmlSegments.length).fill(false);
  
  let issues = [];

  for (let i = 0; i < htmlSegments.length; i++) {
    if (mappedTargets[i] !== null) continue;
    
    let currentKey = cleanText(htmlSegments[i].source);
    let foundMatch = false;
    
    if (sourceMap.has(currentKey)) {
      mappedTargets[i] = sourceMap.get(currentKey);
      foundMatch = true;
      continue;
    }
    
    let combinedKey = currentKey;
    for (let j = 1; j <= 5 && i + j < htmlSegments.length; j++) {
      combinedKey += " " + cleanText(htmlSegments[i + j].source);
      if (sourceMap.has(combinedKey)) {
        mappedTargets[i] = sourceMap.get(combinedKey);
        for (let k = 1; k <= j; k++) {
          mappedTargets[i + k] = "";
        }
        foundMatch = true;
        break;
      }
    }
    
    if (!foundMatch) {
      mappedTargets[i] = htmlSegments[i].target || extractTagsOnly(htmlSegments[i].source);
      if (currentKey !== "") {
        issues.push(`MISMATCH - HTML Source: "${htmlSegments[i].source}" | Cleaned Key: "${currentKey}"`);
      }
    }
  }

  console.log(`Total HTML Segments: ${htmlSegments.length}`);
  console.log(`Total Issues (unmapped text): ${issues.length}`);
  issues.forEach(i => console.log(i));
  
  // Let's also check if any mapped target is EMPTY when the source had actual text
  let emptyTargets = [];
  for (let i = 0; i < htmlSegments.length; i++) {
    let currentKey = cleanText(htmlSegments[i].source);
    if (currentKey !== "" && (!mappedTargets[i] || mappedTargets[i].trim() === "")) {
       // It could be an adjacent segment merged into the previous one, let's check
       if (mappedTargets[i] === "") {
          // merged, ignore
       } else {
         emptyTargets.push(`EMPTY TARGET - Source: "${htmlSegments[i].source}"`);
       }
    }
  }
  
  console.log(`Total Empty Targets with text source: ${emptyTargets.length}`);
  emptyTargets.forEach(e => console.log(e));
}

testMapping().catch(console.error);
