const { supabase } = require("../src/config/supabase");

async function testNonWhitelisted() {
  try {
    const email = "divyanshusinghchouhan@verbolabs.com";
    const invalidRedirect = "https://some-random-non-existent-site-123.com/";
    console.log("Testing with redirect:", invalidRedirect);
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: invalidRedirect
    });
    
    if (error) {
      console.log("Error received:", error.message, "(Status code:", error.status, ")");
    } else {
      console.log("Success! (which means this redirect URL is allowed or Supabase is not checking it)");
    }
  } catch (err) {
    console.error(err);
  }
}

testNonWhitelisted();
