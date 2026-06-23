require("dotenv").config({ path: "../.env" });
const { supabase } = require("../src/config/supabase");

async function run() {
  try {
    console.log("Querying documents...");
    const { data: docs, error } = await supabase
      .from("documents")
      .select("*")
      .ilike("name", "%Leadership%");
      
    if (error) {
      console.error("Error querying documents:", error.message);
      return;
    }
    
    console.log(`Found ${docs.length} documents matching 'Leadership':`);
    for (const doc of docs) {
      console.log(`\nDocument ID: ${doc.id}`);
      console.log(`Name: ${doc.name}`);
      console.log(`Source: ${doc.source_lang}, Target: ${doc.target_lang}`);
      console.log(`Created At: ${doc.created_at}`);
      
      // Count segments
      const { count, error: countError } = await supabase
        .from("document_segments")
        .select("*", { count: "exact", head: true })
        .eq("document_id", doc.id);
        
      if (countError) {
        console.error("Error counting segments:", countError.message);
      } else {
        console.log(`Segments count: ${count}`);
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

run();
