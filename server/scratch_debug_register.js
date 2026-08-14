const { supabase, supabaseAdmin } = require('./src/config/supabase');

async function testExistingUserBranch() {
  const email = "divyanshusingh2229@gmail.com";
  const password = "wrong_or_right_password";

  console.log("Testing existing user branch for:", email);

  const t0 = Date.now();
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (!profileRow) {
    console.log("Profile row not found!");
    return;
  }

  const { data: adminUserRes } = await supabaseAdmin.auth.admin.getUserById(profileRow.id);
  const existingUser = adminUserRes?.user;

  console.log(`[${Date.now() - t0}ms] Existing auth user found:`, existingUser?.id, "Email confirmed at:", existingUser?.email_confirmed_at);

  const tSignIn = Date.now();
  console.log(`[${tSignIn - t0}ms] Calling supabase.auth.signInWithPassword...`);
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  console.log(`[${Date.now() - t0}ms] signInWithPassword finished (${Date.now() - tSignIn}ms). Error:`, loginError?.message, "Data:", loginData?.user?.id ? "SUCCESS" : "NONE");
}

testExistingUserBranch().catch(console.error);
