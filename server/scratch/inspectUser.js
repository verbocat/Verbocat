const { supabase } = require("../src/config/supabase");

async function inspect() {
  try {
    const email = "divyanshusinghchouhan@verbolabs.com";
    console.log("Searching user by email:", email);
    
    // Call Supabase admin api to list users
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      console.error("Failed to list users:", error);
      return;
    }
    
    const targetUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!targetUser) {
      console.log("User not found in Supabase Auth (auth.users)!");
      return;
    }
    
    console.log("User found in Supabase Auth:", JSON.stringify(targetUser, null, 2));
  } catch (err) {
    console.error("Exception:", err);
  }
}

inspect();
