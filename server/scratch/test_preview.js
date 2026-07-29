const { supabase, fetchAllSegments } = require("../src/config/supabase");
const JSZip = require("jszip");

const escapeXml = (text) => {
  if (!text) return "";
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const stripTagMarkers = (text) => {
  if (!text) return "";
  return String(text)
    .replace(/<\/?\d+>/g, "")
    .replace(/__TAG_\d+__/gi, "")
    .replace(/__SEG_\d+__/gi, "")
    .trim();
};

async function testSmartExport() {
  const targetFileId = "67bf89ae-d485-48f4-8372-2fb059f7c43c";
  console.log("Testing smart placeholder mapping export for file_id:", targetFileId);

  const { data: doc } = await supabase.from("documents").select("*").eq("file_id", targetFileId).single();
  const sourceSegments = await fetchAllSegments(doc.id, "segment_index, source_text, target_text", "source");
  console.log(`Fetched ${sourceSegments.length} source segments from DB.`);

  const segments = sourceSegments.map((s, idx) => ({
    id: s.segment_index !== undefined ? s.segment_index : idx,
    source: s.source_text,
    target: s.source_text
  }));

  const { data: htmlData } = await supabase.from("html_files").select("content").eq("id", targetFileId).single();
  const rawBuffer = Buffer.from(htmlData.content, "base64");

  let zip;
  if (rawBuffer[0] === 0x50 && rawBuffer[1] === 0x4b) {
    const packageZip = await JSZip.loadAsync(rawBuffer);
    if (packageZip.files["template.zip"]) {
      const templateBuffer = await packageZip.file("template.zip").async("nodebuffer");
      zip = await JSZip.loadAsync(templateBuffer);
    } else {
      zip = packageZip;
    }
  }

  const docXmlFiles = Object.keys(zip.files).filter(name => 
    name === 'word/document.xml' || 
    name.match(/^word\/(header|footer)\d+\.xml$/)
  );

  // Collect all unique placeholder IDs across XML files
  const placeholderSet = new Set();
  for (const xmlFile of docXmlFiles) {
    const xmlContent = await zip.file(xmlFile).async('string');
    const matches = Array.from(xmlContent.matchAll(/__SEG_(\d+)__/g));
    matches.forEach(m => placeholderSet.add(parseInt(m[1], 10)));
  }

  const sortedPlaceholders = Array.from(placeholderSet).sort((a, b) => a - b);
  console.log("Sorted placeholders present in template XML:", sortedPlaceholders);

  const segmentMap = new Map();

  if (sortedPlaceholders.length > 0 && segments.length > sortedPlaceholders.length) {
    // Smart distribution: map segments proportionally across placeholders
    const N_placeholders = sortedPlaceholders.length;
    const N_segments = segments.length;

    sortedPlaceholders.forEach((phId, idx) => {
      const startSeg = Math.floor(idx * N_segments / N_placeholders);
      const endSeg = Math.floor((idx + 1) * N_segments / N_placeholders);
      const segSlice = segments.slice(startSeg, endSeg);

      const combinedText = segSlice.map(seg => {
        const rawText = (seg.target !== undefined && seg.target !== null && seg.target !== "")
          ? seg.target : (seg.source || "");
        return stripTagMarkers(rawText);
      }).filter(Boolean).join(" ");

      segmentMap.set(phId, escapeXml(combinedText));
      console.log(`Placeholder __SEG_${phId}__ assigned segments ${startSeg}..${endSeg - 1} (${segSlice.length} sentences, text len ${combinedText.length})`);
    });
  } else {
    segments.forEach((seg, arrayIdx) => {
      const rawText = seg.target !== undefined && seg.target !== null && seg.target !== "" 
        ? seg.target 
        : (seg.source || "");
      const cleanText = stripTagMarkers(rawText);
      const numericId = Number(seg.id);
      segmentMap.set(numericId, escapeXml(cleanText));
      segmentMap.set(arrayIdx, escapeXml(cleanText));
    });
  }

  for (const xmlFile of docXmlFiles) {
    let xmlContent = await zip.file(xmlFile).async('string');
    
    xmlContent = xmlContent.replace(/__SEG_(\d+)__/g, (match, idStr) => {
      const id = parseInt(idStr, 10);
      if (segmentMap.has(id)) {
        return segmentMap.get(id);
      }
      return "";
    });

    zip.file(xmlFile, xmlContent);
  }

  const exportedBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  console.log(`Exported DOCX buffer length: ${exportedBuffer.length} bytes`);

  // Let's count words in exported buffer
  const verifyZip = await JSZip.loadAsync(exportedBuffer);
  const verifyXml = await verifyZip.file("word/document.xml").async("string");
  const paragraphs = Array.from(verifyXml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi));
  console.log(`Exported document contains ${paragraphs.length} paragraphs`);

  let totalText = "";
  paragraphs.forEach(p => {
    const textMatches = Array.from(p[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)).map(m => m[1]);
    totalText += " " + textMatches.join("");
  });

  const wordCount = totalText.trim().split(/\s+/).filter(Boolean).length;
  console.log(`TOTAL EXPORTED WORD COUNT: ${wordCount} words (Expected: ~398 words)!`);
}

testSmartExport();
