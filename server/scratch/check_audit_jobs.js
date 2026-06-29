require("dotenv").config({ path: "./.env" });
const { supabase } = require("../src/config/supabase");

async function check() {
  console.log("Checking if table audit_jobs exists...");
  const { data, error } = await supabase
    .from("audit_jobs")
    .select("*")
    .limit(1);

  if (error) {
    console.log("Table audit_jobs check error code:", error.code);
    console.log("Error message:", error.message);
  } else {
    console.log("Table audit_jobs exists! Data:", data);
  }
}

check();
