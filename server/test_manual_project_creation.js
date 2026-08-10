const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { supabase } = require("./src/config/supabase");

async function testManualProjectCreation() {
  console.log("=== TESTING MANUAL PROJECT CREATION PAYLOAD ===");

  const { data: sampleProj } = await supabase.from("projects").select("owner_id").not("owner_id", "is", null).limit(1);
  const { data: sampleProfile } = await supabase.from("profiles").select("id").limit(1);

  let testUserId = null;
  if (sampleProj && sampleProj[0]) testUserId = sampleProj[0].owner_id;
  else if (sampleProfile && sampleProfile[0]) testUserId = sampleProfile[0].id;

  if (!testUserId) {
    console.error("No existing user profiles found to run test.");
    process.exit(1);
  }

  const payload = {
    name: `Manual Test Project ${Date.now()}`,
    owner_id: testUserId,
    source_lang: "en",
    target_languages: ["hi", "es"],
    description: "Manual test creation description",
    settings: { due_date: "2026-10-15" }
  };

  console.log("Inserting payload:", payload);

  const { data: project, error } = await supabase
    .from("projects")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("FAIL: Manual project creation failed with error:", error);
    process.exit(1);
  }

  console.log("SUCCESS: Manual project created cleanly:", project);

  // Clean up
  await supabase.from("projects").delete().eq("id", project.id);
  console.log("Cleaned up test record.");
  process.exit(0);
}

testManualProjectCreation();
