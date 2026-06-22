const { supabase } = require("../src/config/supabase");

async function inspectTable() {
  try {
    console.log("Fetching one row from document_segments...");
    const { data, error } = await supabase
      .from("document_segments")
      .select("*")
      .limit(1);

    if (error) {
      console.error("Error fetching segment:", error);
      return;
    }

    console.log("Segment table structure sample:", data);
  } catch (err) {
    console.error(err);
  }
}

inspectTable();
