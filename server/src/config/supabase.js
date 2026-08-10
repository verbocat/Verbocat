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

    const sourceMap = new Map();
    sourceSegments.forEach(s => sourceMap.set(s.segment_index, s));

    // 3. Map targetSegments by segment_index (preferring non-empty target_text and latest updated_at)
    const targetMap = new Map();
    if (targetSegments && targetSegments.length > 0) {
      targetSegments.forEach(seg => {
        const idx = seg.segment_index;
        if (!targetMap.has(idx)) {
          targetMap.set(idx, seg);
        } else {
          const existing = targetMap.get(idx);
          const hasText = seg.target_text && String(seg.target_text).trim().length > 0;
          const existingHasText = existing.target_text && String(existing.target_text).trim().length > 0;
          if (hasText && !existingHasText) {
            targetMap.set(idx, seg);
          } else if (hasText && existingHasText) {
            if (new Date(seg.updated_at || 0) >= new Date(existing.updated_at || 0)) {
              targetMap.set(idx, seg);
            }
          }
        }
      });
    }

    // 4. Build master union of all unique segment_index values across source & target rows
    const allIndices = new Set([
      ...sourceSegments.map(s => s.segment_index),
      ...targetSegments.map(s => s.segment_index)
    ]);
    const sortedIndices = Array.from(allIndices).sort((a, b) => a - b);

    if (sortedIndices.length > 0) {
      const mergedSegments = sortedIndices.map(idx => {
        const src = sourceMap.get(idx);
        const tgt = targetMap.get(idx);

        if (tgt) {
          return {
            ...tgt,
            source_text: (src?.source_text || tgt.source_text || ""),
            target_text: tgt.target_text !== undefined && tgt.target_text !== null ? tgt.target_text : ""
          };
        }

        return {
          document_id: documentId,
          segment_index: idx,
          target_lang: targetLang,
          source_text: src?.source_text || "",
          target_text: "",
          status: "draft"
        };
      });

      return mergedSegments;
    }
  }

  return await fetchAllSegmentsRaw(documentId, select, targetLang);
};

module.exports = {
  supabase,
  supabaseAdmin,
  fetchAllSegments
};
