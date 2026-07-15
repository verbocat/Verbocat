const { supabase } = require("../src/config/supabase");

async function check() {
  console.log("--- Checking Phase 1 database columns & tables ---");
  
  // Check chat_messages columns
  console.log("\nChecking chat_messages table...");
  const { data: msgCols, error: msgErr } = await supabase
    .from("chat_messages")
    .select("id, content, is_edited, is_pinned, thread_parent_id")
    .limit(1);

  if (msgErr) {
    console.error("❌ chat_messages check failed:", msgErr.message);
  } else {
    console.log("✅ chat_messages columns are present (is_edited, is_pinned, thread_parent_id)!");
  }

  // Check chat_message_reactions table
  console.log("\nChecking chat_message_reactions table...");
  const { data: reactCols, error: reactErr } = await supabase
    .from("chat_message_reactions")
    .select("*")
    .limit(1);

  if (reactErr) {
    console.error("❌ chat_message_reactions check failed:", reactErr.message);
  } else {
    console.log("✅ chat_message_reactions table exists and is accessible!");
  }

  // Check profiles table
  console.log("\nChecking profiles table...");
  const { data: profCols, error: profErr } = await supabase
    .from("profiles")
    .select("id, email, last_seen_at")
    .limit(1);

  if (profErr) {
    console.error("❌ profiles check failed:", profErr.message);
  } else {
    console.log("✅ profiles last_seen_at column exists!");
  }
}

check();
