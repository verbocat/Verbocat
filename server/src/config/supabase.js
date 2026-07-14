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

const fetchAllSegmentsRaw = async (documentId, select = "*", targetLang = null) => {
  let allSegments = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabase
      .from("document_segments")
      .select(select)
      .eq("document_id", documentId);

    if (targetLang === "source") {
      query = query.is("target_lang", null);
    } else if (targetLang) {
      query = query.eq("target_lang", targetLang);
    }

    const { data, error } = await query
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

const fetchAllSegments = async (documentId, select = "*", targetLang = null) => {
  if (targetLang && targetLang !== "source") {
    // 1. Fetch the target language segments (with source_text potentially = "")
    const targetSegments = await fetchAllSegmentsRaw(documentId, select, targetLang);
    
    // Check if we need to map source_text (e.g. if select is "*" or includes "source_text")
    const needsSourceText = select === "*" || select.includes("source_text");
    if (needsSourceText) {
      // 2. Fetch the template segments (target_lang IS NULL), selecting index and source_text
      const sourceSegments = await fetchAllSegmentsRaw(documentId, "segment_index, source_text", "source");

      // 3. Map source texts by segment_index
      const sourceMap = {};
      sourceSegments.forEach(seg => {
        sourceMap[seg.segment_index] = seg.source_text;
      });

      // 4. Merge source_text into targetSegments
      return targetSegments.map(seg => {
        const mappedSourceText = sourceMap[seg.segment_index];
        if (mappedSourceText !== undefined) {
          return {
            ...seg,
            source_text: mappedSourceText
          };
        }
        return seg;
      });
    }
    return targetSegments;
  } else {
    return fetchAllSegmentsRaw(documentId, select, targetLang);
  }
};

module.exports = {
  supabase,
  supabaseAdmin,
  fetchAllSegments
};
