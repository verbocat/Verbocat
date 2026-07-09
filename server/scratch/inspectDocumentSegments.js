const { supabase } = require("../src/config/supabase");

async function inspectTable() {
  try {
    const documentId = "55618ec9-cd85-46c5-830b-cc1945221374";
    console.log(`Fetching segments for document ${documentId}...`);
    const { data, error } = await supabase
      .from("document_segments")
      .select("*")
      .eq("document_id", documentId)
      .order("segment_index", { ascending: true });

    if (error) {
      console.error("Error fetching segments:", error);
      return;
    }

    console.log(`Found ${data.length} segments:`);
    for (const seg of data) {
      console.log(`[${seg.segment_index}] Source: "${seg.source_text}" | Target: "${seg.target_text}" | Status: ${seg.status}`);
    }
  } catch (err) {
    console.error(err);
  }
}

inspectTable();
