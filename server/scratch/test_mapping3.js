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
  
  let merges = [];

  for (let i = 0; i < htmlSegments.length; i++) {
    if (mappedTargets[i] !== null) continue;
    
    let currentKey = cleanText(htmlSegments[i].source);
    
    if (sourceMap.has(currentKey)) {
      mappedTargets[i] = sourceMap.get(currentKey);
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
        merges.push(`MERGED ${j+1} segments starting at index ${i}: ` + 
          `\n  Seg 1 Source: "${htmlSegments[i].source}"` + 
          `\n  Seg 2 Source: "${htmlSegments[i+1].source}"` + 
          `\n  Combined XLF Target: "${sourceMap.get(combinedKey)}"`);
        break;
      }
    }
  }

  console.log(`Total Merges: ${merges.length}`);
  merges.forEach(m => console.log(m));
}

testMapping().catch(console.error);
