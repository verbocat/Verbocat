const { supabase } = require("../src/config/supabase");

async function main() {
  const { data: docs } = await supabase.from("documents").select("id, name, created_at").order("created_at", { ascending: false }).limit(10);
  console.log("Recent Documents in Database:", docs);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
