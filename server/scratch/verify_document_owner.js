const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function main() {
  const documentId = "89fecef2-b66b-486e-b40a-0c28def814e4";
  console.log("Checking database columns for profiles...");

  // Fetch document owner_id
  const { data: doc } = await supabase
    .from("documents")
    .select("owner_id")
    .eq("id", documentId)
    .single();

  if (!doc) {
    console.error("Document not found");
    return;
  }

  // Fetch full owner profile
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", doc.owner_id)
    .single();

  if (error) {
    console.error("Profile query error:", error);
    return;
  }

  console.log("Profile columns found:");
  console.log(Object.keys(profile));
}

main();
