const { supabase } = require("../src/config/supabase");

async function testForgot() {
  try {
    const email = "divyanshusinghchouhan@verbolabs.com";
    console.log("Attempting to send reset email via SDK for:", email);
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://verbocat.vercel.app/"
    });
    
    if (error) {
      console.error("Forgot Email Error:", error);
    } else {
      console.log("Forgot Email Success!");
    }
  } catch (err) {
    console.error("Exception:", err);
  }
}

testForgot();
