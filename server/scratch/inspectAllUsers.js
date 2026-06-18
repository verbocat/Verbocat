const { supabase } = require("../src/config/supabase");

async function inspectAll() {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) {
      console.error(error);
      return;
    }
    
    users.forEach(u => {
      console.log(`Email: ${u.email}, ID: ${u.id}, Confirmed: ${!!u.email_confirmed_at}, Identities:`, u.identities);
    });
  } catch (err) {
    console.error(err);
  }
}

inspectAll();
