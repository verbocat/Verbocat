const { supabase } = require("../src/config/supabase");

async function testReset() {
  try {
    const userId = "d02d37ba-90d1-4147-bf8f-1687d66500d5"; // divyanshusinghchouhan@verbolabs.com
    console.log("Attempting to update password via admin client for user ID:", userId);
    
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      password: "TestNewPassword123!"
    });
    
    if (error) {
      console.error("Update Error:", error);
    } else {
      console.log("Update Success! User metadata:", data.user.email);
    }
  } catch (err) {
    console.error("Exception:", err);
  }
}

testReset();
