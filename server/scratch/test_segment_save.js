const { supabase } = require("../src/config/supabase");

async function testSegmentSave() {
  console.log("=== INSPECTING DOCUMENT_SEGMENTS TABLE ===");

  const { data: segs, error: segErr } = await supabase
    .from("document_segments")
    .select("document_id, segment_index, source_text, target_text, target_lang")
    .limit(10);

  if (segErr) {
    console.error("Fetch document_segments error:", segErr);
  } else {
    console.log(`Fetched ${segs.length} sample document_segments:`);
    segs.forEach((s, idx) => {
      console.log(`Row #${idx}: doc_id=${s.document_id}, index=${s.segment_index}, target_lang='${s.target_lang}', target='${s.target_text}'`);
    });
  }

  process.exit(0);
}

testSegmentSave();
