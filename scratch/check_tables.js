const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const { supabase } = require('../server/src/config/supabase');

async function checkTables() {
  const { data, error } = await supabase.from('project_notes').select('*').limit(1);
  if (error) {
    console.log('project_notes error:', error.message);
  } else {
    console.log('project_notes exists:', data);
  }
}

checkTables().catch(console.error);
