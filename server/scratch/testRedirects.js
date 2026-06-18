const { supabase } = require("../src/config/supabase");

async function testRedirects() {
  try {
    const email = "divyanshusinghchouhan@verbolabs.com";
    
    // Test 1: Root redirect URL
    console.log("Testing with root redirect...");
    const res1 = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://verbocat.vercel.app/"
    });
    console.log("Root redirect response error:", res1.error ? res1.error.message : "None (Success!)");
    
    // Sleep for 35 seconds to avoid rate limiting
    console.log("Sleeping for 35 seconds to reset rate limits...");
    await new Promise(resolve => setTimeout(resolve, 35000));
    
    // Test 2: Subpath redirect URL
    console.log("Testing with subpath redirect...");
    const res2 = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://verbocat.vercel.app/client/"
    });
    console.log("Subpath redirect response error:", res2.error ? res2.error.message : "None (Success!)");
  } catch (err) {
    console.error(err);
  }
}

testRedirects();
