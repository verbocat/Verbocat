const { supabase } = require("../src/config/supabase");

async function check() {
  try {
    const usersInfo = [
      { email: "divyanshusinghchouhan@verbolabs.com", id: "d02d37ba-90d1-4147-bf8f-1687d66500d5" },
      { email: "verbocat@verbolabs.com", id: "ed0fd6d8-eb6d-472b-a4e3-509f1c9b4ecd" }
    ];
    
    for (const info of usersInfo) {
      console.log(`\nFull details for ${info.email}:`);
      const { data: { user }, error } = await supabase.auth.admin.getUserById(info.id);
      
      if (error) {
        console.error(`Error for ${info.email}:`, error);
        continue;
      }
      
      console.log(JSON.stringify(user, null, 2));
    }
  } catch (err) {
    console.error(err);
  }
}

check();
