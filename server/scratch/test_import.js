const { supabase } = require('../src/config/supabase');

async function run() {
  const email = "getgodeepak@gmail.com";
  console.log(`Updating profile for ${email}...`);
  
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: "verbolabs_staff", has_translate_access: true })
    .eq("email", email)
    .select();

  if (error) {
    console.error("Failed to update profile:", error);
  } else {
    console.log("✅ Success! Profile updated:", data);
  }
}

run().catch(console.error);
