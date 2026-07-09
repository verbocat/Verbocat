const { supabase, supabaseAdmin } = require("../src/config/supabase");

async function inspectAll() {
  try {
    const targetEmail = "getgodeepak@gmail.com";
    console.log(`Checking Auth Users for ${targetEmail}...`);
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) {
      console.error("Auth search error:", error);
    } else {
      const matchedAuth = users.filter(u => u.email.toLowerCase() === targetEmail.toLowerCase());
      console.log(`Found ${matchedAuth.length} matching auth users:`);
      matchedAuth.forEach(u => {
        console.log(`  Auth User - Email: ${u.email}, ID: ${u.id}, Confirmed: ${!!u.email_confirmed_at}`);
      });
    }

    console.log(`Checking Profiles table for ${targetEmail}...`);
    const { data: profiles, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .ilike("email", targetEmail);

    if (profileErr) {
      console.error("Profiles search error:", profileErr);
    } else {
      console.log(`Found ${profiles.length} matching profiles:`);
      profiles.forEach(p => {
        console.log(`  Profile - Email: ${p.email}, ID: ${p.id}, Role: ${p.role}`);
      });
    }
  } catch (err) {
    console.error(err);
  }
}

inspectAll();
