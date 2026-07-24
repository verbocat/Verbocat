const { fetchAllSegments } = require("../src/config/supabase");

async function main() {
  const docId = "67bf89ae-d485-48f4-8372-2fb059f7c43c";
  console.log(`Fetching and auto-resegmenting document ${docId}...`);
  const segments = await fetchAllSegments(docId, "*", "pa");
  console.log(`\nDocument now has ${segments.length} sentence-level segments!`);
  segments.forEach((seg, i) => {
    console.log(`Seg ${i + 1} (${seg.source_text.split(/\s+/).length} words): ${seg.source_text}`);
  });
  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
