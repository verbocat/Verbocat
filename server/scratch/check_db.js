const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { supabase } = require("../src/config/supabase");

async function checkDb() {
  const { data: docs } = await supabase.from("documents").select("*");
  console.log("Documents count in Supabase:", docs ? docs.length : 0);
  if (docs) {
    docs.forEach(d => console.log("DOC:", d.id, "file_id:", d.file_id, "name:", d.name));
  }

  const { data: htmls } = await supabase.from("html_files").select("id, content").limit(10);
  console.log("HTML files count in Supabase:", htmls ? htmls.length : 0);
  if (htmls) {
    htmls.forEach(h => console.log("HTML_FILE id:", h.id, "content length:", h.content ? h.content.length : 0));
  }
}

checkDb();
