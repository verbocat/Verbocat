const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const { supabase } = require('../server/src/config/supabase');

async function test() {
  const { data: psData, error: psErr } = await supabase.from('project_shares').select('*').limit(5);
  console.log('project_shares content:', psErr ? psErr.message : psData);
}

test().catch(console.error);
