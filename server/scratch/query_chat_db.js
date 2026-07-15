const { supabase } = require("../src/config/supabase");

async function run() {
  try {
    console.log("--- Querying chat_conversations ---");
    const { data: convs, error: convErr } = await supabase
      .from("chat_conversations")
      .select("*");
    
    if (convErr) console.error(convErr);
    else console.log(convs);

    console.log("\n--- Querying chat_participants ---");
    const { data: parts, error: partErr } = await supabase
      .from("chat_participants")
      .select("*");
    
    if (partErr) console.error(partErr);
    else console.log(parts);

    console.log("\n--- Querying chat_messages ---");
    const { data: msgs, error: msgErr } = await supabase
      .from("chat_messages")
      .select("*");
    
    if (msgErr) console.error(msgErr);
    else console.log(msgs);
  } catch (err) {
    console.error(err);
  }
}

run();
