require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase credentials in .env file");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Administrative client using service_role key to bypass restrictions for signup / deletion
const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const fetchAllSegments = async (documentId, select = "*") => {
  let allSegments = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("document_segments")
      .select(select)
      .eq("document_id", documentId)
      .order("segment_index", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    allSegments = allSegments.concat(data);
    if (data.length < pageSize) {
      break;
    }

    page++;
  }

  return allSegments;
};

module.exports = {
  supabase,
  supabaseAdmin,
  fetchAllSegments
};
