const { supabase } = require("../src/config/supabase");
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

async function testShiftFix() {
  const docId = "6eef2212-4bcd-4383-beab-a505fe8854c5";
  const { data: doc } = await supabase.from("documents").select("*").eq("id", docId).single();
  console.log("Found doc:", doc);

  const { data: sourceSegments } = await supabase
    .from("document_segments")
    .select("*")
    .eq("document_id", doc.id)
    .is("target_lang", null)
    .order("segment_index", { ascending: true });

  console.log(`Fetched ${sourceSegments.length} source segments from DB.`);

  // Client editor state: user entered target "gbgfbgffgbgfbf" into Segment #1 (1st segment, index 0)
  const clientSegments = sourceSegments.map((s, idx) => ({
    id: idx + 1,
    segment_index: s.segment_index,
    source: s.source_text,
    target: idx === 0 ? "gbgfbgffgbgfbf" : ""
  }));

  const { data: htmlData } = await supabase.from("html_files").select("content").eq("id", doc.file_id).single();
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

  // Collect placeholders present in XML
  const placeholderSet = new Set();
  for (const xmlFile of docXmlFiles) {
    const xmlContent = await zip.file(xmlFile).async('string');
    const matches = Array.from(xmlContent.matchAll(/__SEG_(\d+)__/g));
    matches.forEach(m => placeholderSet.add(parseInt(m[1], 10)));
  }

  const sortedPlaceholders = Array.from(placeholderSet).sort((a, b) => a - b);
  const minPlaceholder = sortedPlaceholders.length > 0 ? sortedPlaceholders[0] : 0;
  console.log("Placeholders found:", sortedPlaceholders);
  console.log("Minimum placeholder number:", minPlaceholder);

  // Build clean segment map without key collisions
  const segmentMap = new Map();

  if (sortedPlaceholders.length > 0 && clientSegments.length > sortedPlaceholders.length) {
    const N_placeholders = sortedPlaceholders.length;
    const N_segments = clientSegments.length;

    sortedPlaceholders.forEach((phId, idx) => {
      const startSeg = Math.floor(idx * N_segments / N_placeholders);
      const endSeg = Math.floor((idx + 1) * N_segments / N_placeholders);
      const segSlice = clientSegments.slice(startSeg, endSeg);

      const combinedText = segSlice.map(seg => {
        const rawText = (seg.target !== undefined && seg.target !== null && seg.target !== "")
          ? seg.target : (seg.source || "");
        return stripTagMarkers(rawText);
      }).filter(Boolean).join(" ");

      segmentMap.set(phId, escapeXml(combinedText));
    });
  } else {
    clientSegments.forEach((seg, arrayIdx) => {
      const rawText = (seg.target !== undefined && seg.target !== null && seg.target !== "") 
        ? seg.target 
        : (seg.source || "");
      const cleanText = stripTagMarkers(rawText);

      // Placeholders in template XML match (arrayIdx + minPlaceholder)
      const phKey = arrayIdx + minPlaceholder;
      segmentMap.set(phKey, escapeXml(cleanText));
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
  const verifyZip = await JSZip.loadAsync(exportedBuffer);
  const verifyXml = await verifyZip.file("word/document.xml").async("string");
  const paragraphs = Array.from(verifyXml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi));

  console.log("\n--- VERIFIED PARAGRAPHS IN EXPORTED DOCX ---");
  paragraphs.slice(0, 6).forEach((p, idx) => {
    const textMatches = Array.from(p[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)).map(m => m[1]);
    console.log(`Paragraph ${idx + 1}: "${textMatches.join("")}"`);
  });
}

testShiftFix();
