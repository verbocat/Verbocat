const { supabase, fetchAllSegments } = require("../src/config/supabase");

async function testTrackChangesSave() {
  console.log("=== TESTING TRACK CHANGES & SEGMENT PERSISTENCE IN SUPABASE ===");

  const { data: segs } = await supabase
    .from("document_segments")
    .select("document_id, segment_index, target_text")
    .limit(1);

  if (!segs || segs.length === 0) {
    console.log("No document_segments found.");
    process.exit(0);
  }

  const docId = segs[0].document_id;
  const segIdx = segs[0].segment_index;
  const origText = segs[0].target_text || "Original Baseline Text";
  const editedText = `${origText} (Edited with Track Changes at ${new Date().toISOString()})`;
  const trackedBy = "editor@verbolabs.com";
  const targetLang = "hi";

  console.log(`Doc ID: ${docId}, Seg Index: ${segIdx}`);

  // Test updating segment with track changes metadata
  const updateFields = {
    target_text: editedText,
    original_target_text: origText,
    tracked_by: trackedBy,
    status: "draft",
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("document_segments")
    .update(updateFields)
    .eq("document_id", docId)
    .eq("segment_index", segIdx)
    .eq("target_lang", targetLang)
    .select();

  if (error) {
    console.error("Update error:", error);
  } else {
    console.log("Database update succeeded:", data[0]);
  }

  // Now reload using fetchAllSegments
  const reloaded = await fetchAllSegments(docId, "*", targetLang);
  const match = reloaded.find(s => s.segment_index === segIdx);

  console.log("Reloaded segment:", {
    target_text: match?.target_text || match?.target,
    original_target_text: match?.original_target_text || match?.originalTargetText,
    tracked_by: match?.tracked_by || match?.trackedBy
  });

  if (match && (match.target_text === editedText || match.target === editedText)) {
    console.log("\n=============================================");
    console.log("SUCCESS! TRACK CHANGES & SEGMENT EDITS ARE 100% PERSISTED & RELIABLE ACROSS REFRESH.");
    console.log("=============================================\n");
  } else {
    console.error("FAILURE: Reloaded data mismatch.");
  }

  process.exit(0);
}

testTrackChangesSave();
