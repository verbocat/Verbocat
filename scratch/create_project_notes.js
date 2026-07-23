const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const { supabaseAdmin, supabase } = require('../server/src/config/supabase');

async function createNotesTable() {
  console.log('Creating project_notes table SQL...');
  const sql = `
    CREATE TABLE IF NOT EXISTS public.project_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
      author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL,
      author_email TEXT NOT NULL,
      content TEXT NOT NULL,
      is_pinned BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
    );
  `;

  // Test rpc or query
  const { data, error } = await supabaseAdmin.rpc('exec_sql', { sql_query: sql });
  if (error) {
    console.log('RPC exec_sql error (expected if function not created):', error.message);
  } else {
    console.log('Table created via RPC exec_sql!', data);
  }
}

createNotesTable().catch(console.error);
