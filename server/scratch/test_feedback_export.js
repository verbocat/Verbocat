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

async function testFeedbackFormExport() {
  const docId = "189bde3b-53a3-4764-8617-6a029bc19592";
  const { data: doc } = await supabase.from("documents").select("*").eq("id", docId).single();

  const { data: sourceSegments } = await supabase
    .from("document_segments")
    .select("*")
    .eq("document_id", docId)
    .is("target_lang", null)
    .order("segment_index", { ascending: true });

  console.log(`Fetched ${sourceSegments.length} source segments from DB.`);
  sourceSegments.forEach(s => {
    console.log(`Seg index ${s.segment_index} (id: ${s.id}): "${s.source_text.substring(0, 40)}"`);
  });

  const clientSegments = sourceSegments.map((s, idx) => ({
    id: idx + 1, // App.jsx sends 1-indexed id!
    segment_index: s.segment_index,
    source: s.source_text,
    target: idx === 0 ? "gbgfbgffgbgfbf" : "" // User entered target for seg 0 (1-indexed id: 1)
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

  const docXml = await zip.file("word/document.xml").async("string");

  // Trace segment mapping
  const segmentMap = new Map();
  clientSegments.forEach((seg, arrayIdx) => {
    const rawText = (seg.target !== undefined && seg.target !== null && seg.target !== "")
      ? seg.target : (seg.source || "");
    const cleanText = stripTagMarkers(rawText);

    // FIX: Normalize index resolution cleanly
    const segIndex = seg.segment_index !== undefined && seg.segment_index !== null
      ? Number(seg.segment_index)
      : (seg.id !== undefined && seg.id !== null ? Number(seg.id) - 1 : arrayIdx);

    segmentMap.set(segIndex, escapeXml(cleanText));
  });

  console.log("\n--- Segment Map Entries ---");
  for (let [k, v] of segmentMap.entries()) {
    console.log(`Map key ${k}: "${v.substring(0, 50)}"`);
  }

  const replacedXml = docXml.replace(/__SEG_(\d+)__/g, (match, idStr) => {
    const id = parseInt(idStr, 10);
    if (segmentMap.has(id)) {
      return segmentMap.get(id);
    }
    return "";
  });

  const paragraphs = Array.from(replacedXml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi));
  console.log("\n--- Replaced Paragraphs Output ---");
  paragraphs.slice(0, 6).forEach((p, idx) => {
    const textMatches = Array.from(p[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)).map(m => m[1]);
    console.log(`P${idx + 1}: "${textMatches.join("")}"`);
  });
}

testFeedbackFormExport();
