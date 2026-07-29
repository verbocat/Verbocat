const { supabase } = require("../src/config/supabase");

async function checkDocs() {
  const { data: docs } = await supabase.from("documents").select("id, file_id, name");
  console.log("Found docs count:", docs ? docs.length : 0);
  docs.forEach(d => {
    if (d.name.includes("Feedback Form")) {
      console.log("MATCH:", d);
    }
  });
}

checkDocs();
