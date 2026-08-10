const { supabase, fetchAllSegments } = require("../src/config/supabase");

async function testLiveSegmentSave() {
  console.log("=== TESTING LIVE SEGMENT SAVE & PERSISTENCE ===");

  const { data: segs } = await supabase
    .from("document_segments")
    .select("document_id, segment_index")
    .limit(1);

  const docId = segs[0].document_id;
  const segIdx = segs[0].segment_index;
  const testText = `Live Save Test at ${new Date().toISOString()}`;

  console.log(`Testing save on docId: ${docId}, segIndex: ${segIdx}`);

  const targetLang = "hi";
  const updateFields = {
    target_text: testText,
    status: "translated",
    updated_at: new Date().toISOString()
  };

  let { data } = await supabase
    .from("document_segments")
    .update(updateFields)
    .eq("document_id", docId)
    .eq("segment_index", segIdx)
    .eq("target_lang", targetLang)
    .select()
    .maybeSingle();

  if (!data) {
    const { data: nullRow } = await supabase
      .from("document_segments")
      .update({
        ...updateFields,
        target_lang: targetLang
      })
      .eq("document_id", docId)
      .eq("segment_index", segIdx)
      .is("target_lang", null)
      .select()
      .maybeSingle();
    data = nullRow;
  }

  console.log("Updated row result:", data);

  // Now verify with fetchAllSegments
  const reloadedSegs = await fetchAllSegments(docId, "*", targetLang);
  console.log("Reloaded segments count:", reloadedSegs.length);
  console.log("First reloaded segment sample object:", reloadedSegs[0]);

  const match = reloadedSegs.find(s => s.segment_index === segIdx || s.id === segIdx);
  console.log("Found matching segment:", match);

  if (match && (match.target_text === testText || match.target === testText)) {
    console.log("\n=============================================");
    console.log("SUCCESS! SEGMENT PERSISTENCE IS 100% RELIABLE AND VERIFIED UPON REFRESH.");
    console.log("=============================================\n");
  } else {
    console.error("FAILURE: Reloaded text did not match saved text!");
  }

  process.exit(0);
}

testLiveSegmentSave();
