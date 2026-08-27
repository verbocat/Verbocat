const { supabase } = require("../src/config/supabase");

async function checkSchemas() {
  console.log("=== DETAILED SCHEMA INSPECTION ===");

  // 1. documents select
  const { data: doc, error: docErr } = await supabase.from("documents").select("*").limit(1);
  if (docErr) {
    console.log("documents error:", docErr);
  } else {
    console.log("documents keys:", doc.length > 0 ? Object.keys(doc[0]) : "No docs");
  }

  // 2. translation_jobs
  const { data: tj, error: tjErr } = await supabase.from("translation_jobs").select("*").limit(1);
  if (tjErr) {
    console.log("translation_jobs Error:", tjErr);
  } else {
    console.log("translation_jobs sample keys:", tj.length > 0 ? Object.keys(tj[0]) : "Empty table");
  }

  // 3. Try inserting dummy to document_access_requests to see column error
  const { error: insErr } = await supabase.from("document_access_requests").insert({
    document_id: "00000000-0000-0000-0000-000000000000",
    user_id: "00000000-0000-0000-0000-000000000000"
  });
  console.log("Insert test to document_access_requests result:", insErr);

  process.exit(0);
}

checkSchemas();
