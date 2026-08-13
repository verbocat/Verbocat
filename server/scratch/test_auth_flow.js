const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { supabase, supabaseAdmin } = require("../src/config/supabase");

async function testAuth() {
  console.log("=== TESTING AUTH SETUP & SUPABASE CONNECTION ===");
  console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
  console.log("Service role key present?", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

  const testEmail = `test_auth_${Date.now()}@example.com`;
  const testPassword = "TestPassword123!";
  const testName = "Test User";

  console.log(`\n--- 1. Testing Registration for new user: ${testEmail} ---`);
  try {
    const { data: adminData, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: false,
      user_metadata: { name: testName, full_name: testName }
    });

    if (adminErr) {
      console.error("createUser Error:", adminErr.message);
    } else {
      console.log("createUser Success! ID:", adminData.user.id);

      console.log("\n--- 2. Testing generateLink for signup ---");
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email: testEmail,
        password: testPassword,
        options: { redirectTo: "http://localhost:5173/" }
      });
      if (linkErr) console.error("generateLink Error:", linkErr.message);
      else console.log("generateLink Success! Action Link:", linkData?.properties?.action_link);
    }
  } catch (err) {
    console.error("Registration Exception:", err);
  }

  console.log("\n--- 3. Testing Sign In with unverified user ---");
  try {
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    if (signInErr) console.error("signInWithPassword expected failure or error:", signInErr.message);
    else console.log("signInWithPassword success! User ID:", signInData.user.id, "Confirmed?", signInData.user.email_confirmed_at);
  } catch (err) {
    console.error("Sign In Exception:", err);
  }

  console.log("\n--- 4. Testing Manual Verification ---");
  try {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const targetUser = users?.users?.find(u => u.email?.toLowerCase() === testEmail.toLowerCase());
    if (targetUser) {
      const { error: confirmErr } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, { email_confirm: true });
      if (confirmErr) console.error("updateUserById confirm error:", confirmErr.message);
      else console.log("updateUserById confirm success for user:", targetUser.id);
    } else {
      console.error("User not found in listUsers!");
    }
  } catch (err) {
    console.error("Manual Verify Exception:", err);
  }

  console.log("\n--- 5. Testing Sign In after manual verification ---");
  try {
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    if (signInErr) console.error("signInWithPassword Error:", signInErr.message);
    else console.log("signInWithPassword Success! User ID:", signInData.user.id);
  } catch (err) {
    console.error("Sign In 2 Exception:", err);
  }

  console.log("\n--- Cleanup: Deleting test user ---");
  try {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const targetUser = users?.users?.find(u => u.email?.toLowerCase() === testEmail.toLowerCase());
    if (targetUser) {
      await supabaseAdmin.auth.admin.deleteUser(targetUser.id);
      await supabase.from("profiles").delete().eq("id", targetUser.id);
      console.log("Cleanup complete!");
    }
  } catch (err) {
    console.error("Cleanup Exception:", err);
  }
}

testAuth();
