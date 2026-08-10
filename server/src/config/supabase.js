const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

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

const { splitTextIntoSentences } = require("../utils/sentenceSplitter");

const resegmentDocumentInDb = async (documentId, sourceSegments) => {
  if (!sourceSegments || sourceSegments.length === 0) return false;

  let needsResegmenting = false;
  const newSourceSegments = [];
  let segIdx = 1;

  for (const seg of sourceSegments) {
    const text = String(seg.source_text || "").trim();
    const sentences = splitTextIntoSentences(text, 35);
    
    if (sentences.length > 1) {
      needsResegmenting = true;
      sentences.forEach(s => {
        newSourceSegments.push({
          document_id: documentId,
          target_lang: null,
          segment_index: segIdx++,
          source_text: s,
          target_text: "",
          status: "draft"
        });
      });
    } else {
      newSourceSegments.push({
        document_id: documentId,
        target_lang: null,
        segment_index: segIdx++,
        source_text: text,
        target_text: "",
        status: "draft"
      });
    }
  }

  if (needsResegmenting && newSourceSegments.length > 0) {
    console.log(`[AutoResegment] Resegmenting document ${documentId} into ${newSourceSegments.length} sentence-level segments...`);
    try {
      // Wipe ALL existing segment rows for documentId across all target languages
      await supabase.from("document_segments").delete().eq("document_id", documentId);
      
      const BATCH_SIZE = 500;
      for (let i = 0; i < newSourceSegments.length; i += BATCH_SIZE) {
        await supabase.from("document_segments").insert(newSourceSegments.slice(i, i + BATCH_SIZE));
      }
      return true;
    } catch (err) {
      console.error("[AutoResegment] Failed to resegment document:", err);
    }
  }

  return false;
};

const fetchAllSegments = async (documentId, select = "*", targetLang = null) => {
  if (targetLang && targetLang !== "source") {
    // 1. Fetch template segments (target_lang IS NULL or target_lang = source)
    let sourceSegments = await fetchAllSegmentsRaw(documentId, select, "source");

    // 2. Fetch target language segments
    let targetSegments = await fetchAllSegmentsRaw(documentId, select, targetLang);

    // 3. Deduplicate targetSegments by segment_index (preferring non-empty target_text and latest updated_at)
    if (targetSegments && targetSegments.length > 0) {
      const segMap = new Map();
      targetSegments.forEach(seg => {
        const idx = seg.segment_index;
        if (!segMap.has(idx)) {
          segMap.set(idx, seg);
        } else {
          const existing = segMap.get(idx);
          const hasText = seg.target_text && String(seg.target_text).trim().length > 0;
          const existingHasText = existing.target_text && String(existing.target_text).trim().length > 0;
          if (hasText && !existingHasText) {
            segMap.set(idx, seg);
          } else if (hasText && existingHasText) {
            if (new Date(seg.updated_at || 0) >= new Date(existing.updated_at || 0)) {
              segMap.set(idx, seg);
            }
          } else if (!hasText && !existingHasText) {
            if (new Date(seg.updated_at || 0) >= new Date(existing.updated_at || 0)) {
              segMap.set(idx, seg);
            }
          }
        }
      });
      targetSegments = Array.from(segMap.values());
    }

    // 4. If targetSegments is EMPTY, clone/initialize fresh target segments from source
    if ((!targetSegments || targetSegments.length === 0) && sourceSegments && sourceSegments.length > 0) {
      targetSegments = sourceSegments.map(src => ({
        ...src,
        target_lang: targetLang,
        target_text: "",
        status: "draft"
      }));

      try {
        const seedInserts = sourceSegments.map(src => ({
          document_id: documentId,
          target_lang: targetLang,
          segment_index: src.segment_index,
          source_text: src.source_text || "",
          target_text: "",
          status: "draft"
        }));
        await supabase.from("document_segments").insert(seedInserts);
      } catch (seedErr) {
        console.error("Failed to seed target segments:", seedErr);
      }
    } else {
      const sourceMap = {};
      sourceSegments.forEach(seg => {
        sourceMap[seg.segment_index] = seg.source_text;
      });

      targetSegments = targetSegments.map(seg => ({
        ...seg,
        source_text: sourceMap[seg.segment_index] || seg.source_text || ""
      }));
    }

    return targetSegments;
  }

  return await fetchAllSegmentsRaw(documentId, select, targetLang);
};

module.exports = {
  supabase,
  supabaseAdmin,
  fetchAllSegments
};
