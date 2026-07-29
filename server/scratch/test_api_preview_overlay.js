const { supabase, fetchAllSegments } = require("../src/config/supabase");
const docxParser = require("../src/utils/parsers/docxParser");
const JSZip = require("jszip");

async function testApiPreviewOverlay() {
  const { data: doc } = await supabase.from("documents").select("*, file_id, name").ilike("name", "%Feedback Form.docx%").limit(1).single();
  console.log("Found doc:", doc);

  const sourceSegments = await fetchAllSegments(doc.id, "segment_index, source_text, target_text", "source");
  console.log("Source segments count:", sourceSegments.length);

  const segmentsList = sourceSegments.map((s, arrayIdx) => ({
    id: arrayIdx,
    segment_index: arrayIdx,
    source: s.source_text || "",
    target: (s.target_text !== undefined && s.target_text !== null && s.target_text !== "") ? s.target_text : (s.source_text || "")
  }));

  // User entered "1" into Segment #1 (index 0) in client CAT editor
  const customSegments = [
    { id: 1, segment_index: 1, source: "Linguist Review & Quality Evaluation Report", target: "1" }
  ];

  customSegments.forEach((s, arrayIdx) => {
    const targetSeg = segmentsList[arrayIdx];
    if (targetSeg) {
      if (s.target !== undefined && s.target !== null && s.target !== "") {
        targetSeg.target = s.target;
      }
    }
  });

  console.log("Segment 0 target in preview list:", segmentsList[0].target);
  console.log("Segment 1 target in preview list:", segmentsList[1].target);

  const { data: htmlData } = await supabase.from("html_files").select("content").eq("id", doc.file_id).single();
  const exportedBuffer = await docxParser.exportFile(htmlData.content, segmentsList, "hi");

  const verifyZip = await JSZip.loadAsync(exportedBuffer);
  const verifyXml = await verifyZip.file("word/document.xml").async("string");
  const paragraphs = Array.from(verifyXml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi));

  console.log("\n--- EXPORTED DOCX PARAGRAPHS VERIFICATION ---");
  paragraphs.slice(0, 5).forEach((p, idx) => {
    const textMatches = Array.from(p[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)).map(m => m[1]);
    console.log(`Paragraph ${idx + 1}: "${textMatches.join("")}"`);
  });
}

testApiPreviewOverlay();
