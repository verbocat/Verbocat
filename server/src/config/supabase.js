const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://iugntvfbtgdowuyrpggn.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1Z250dmZidGdkb3d1eXJwZ2duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNDM0NjEsImV4cCI6MjA5NDgxOTQ2MX0.3LbmkoQOqbx7dad41w_8IQjdkNQLXfSiAjYr0fotc4Q";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

module.exports = {
  supabase
};
