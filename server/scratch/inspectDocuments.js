const { supabase } = require("../src/config/supabase");

async function inspectDocuments() {
  try {
    console.log("Fetching documents...");
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("Error fetching documents:", error);
      return;
    }

    console.log("Documents found:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

inspectDocuments();
