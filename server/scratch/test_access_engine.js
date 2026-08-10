const { supabase } = require("../src/config/supabase");

async function testAccessEngine() {
  console.log("=== TESTING DOCUMENT ACCESS REQUEST ENGINE COLUMNS ===");

  const { data: docs } = await supabase.from("documents").select("id, owner_id").limit(1);
  const testDocId = docs[0].id;
  const testUserId = docs[0].owner_id;

  // Insert basic request
  const { data: reqData, error: reqErr } = await supabase
    .from("document_access_requests")
    .upsert({
      document_id: testDocId,
      user_id: testUserId,
      status: "pending"
    }, { onConflict: "document_id,user_id" })
    .select();

  if (reqErr) {
    console.error("document_access_requests insert error:", reqErr);
  } else {
    console.log("document_access_requests columns:", Object.keys(reqData[0]));
    console.log("document_access_requests row:", reqData[0]);
  }

  // Clean up dummy test request
  await supabase.from("document_access_requests").delete().eq("document_id", testDocId).eq("user_id", testUserId);

  process.exit(0);
}

testAccessEngine();
