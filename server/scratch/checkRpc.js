const { supabase } = require("../src/config/supabase");

async function checkRpc() {
  try {
    console.log("Checking if RPC functions for SQL exist...");
    const { data, error } = await supabase.rpc("exec_sql", { query: "SELECT 1;" });
    if (error) {
      console.log("exec_sql check error:", error.message);
    } else {
      console.log("exec_sql exists! Result:", data);
    }
  } catch (err) {
    console.error(err);
  }
}

checkRpc();
