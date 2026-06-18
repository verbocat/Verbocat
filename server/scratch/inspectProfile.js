const { supabase } = require("../src/config/supabase");

async function inspectProfile() {
  try {
    const email = "divyanshusinghchouhan@verbolabs.com";
    console.log("Fetching profile for email:", email);
    
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", email)
      .single();
      
    if (error) {
      console.error("Profile Error:", error);
      return;
    }
    
    console.log("Profile Data:", JSON.stringify(profile, null, 2));
  } catch (err) {
    console.error(err);
  }
}

inspectProfile();
