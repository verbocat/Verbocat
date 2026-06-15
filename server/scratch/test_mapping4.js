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
  const isMergedArr = new Array(htmlSegments.length).fill(false);

  for (let i = 0; i < htmlSegments.length; i++) {
    if (mappedTargets[i] !== null) continue;
    
    let currentKey = cleanText(htmlSegments[i].source);
    
    if (sourceMap.has(currentKey)) {
      mappedTargets[i] = sourceMap.get(currentKey);
      continue;
    }
    
    let combinedKey = currentKey;
    let foundMatch = false;
    for (let j = 1; j <= 5 && i + j < htmlSegments.length; j++) {
      combinedKey += " " + cleanText(htmlSegments[i + j].source);
      if (sourceMap.has(combinedKey)) {
        mappedTargets[i] = sourceMap.get(combinedKey);
        for (let k = 1; k <= j; k++) {
          let tags = extractTagsOnly(htmlSegments[i + k].source);
          if (tags === "") tags = "\u200B"; 
          mappedTargets[i + k] = tags;
          isMergedArr[i + k] = true;
        }
        foundMatch = true;
        break;
      }
    }
    
    if (!foundMatch) {
      mappedTargets[i] = htmlSegments[i].target || extractTagsOnly(htmlSegments[i].source);
    }
  }

  const newSegments = htmlSegments.map((seg, i) => ({
    ...seg,
    target: mappedTargets[i],
    isMerged: isMergedArr[i]
  }));

  const isJunkSegment = (text) => {
    if (!text) return true;
    const clean = text.replace(/__TAG_\d+__/g, "").replace(/<[^>]+>/g, "").trim();
    if (/^[^a-zA-Z]*$/.test(clean)) return true;
    if (/^\s*@(?:page|media|import|font-face)\s*\{/i.test(clean)) return true;
    if (/(?:margin|padding|position|text-align)\s*:\s*[^;]+;/i.test(clean) && clean.includes("{") && clean.includes("}")) return true;
    const lower = clean.toLowerCase();
    if (lower === "waiting for translation") return true;
    return false;
  };

  const filteredSegments = newSegments.filter(seg => !seg.isMerged && !isJunkSegment(seg.source));

  console.log(`Filtered Segments: ${filteredSegments.length}`);
  let emptyCount = 0;
  filteredSegments.forEach(seg => {
    // If target is empty or only whitespace/zero-width space, it looks empty in UI
    const textTarget = seg.target.replace(/<[^>]+>/g, "").replace(/__TAG_\d+__/g, "").trim();
    if (textTarget === "" || textTarget === "\u200B") {
      emptyCount++;
      console.log(`EMPTY IN UI -> Source: "${seg.source}"`);
    }
  });
  console.log(`Total empty in UI: ${emptyCount}`);
}

testMapping().catch(console.error);
