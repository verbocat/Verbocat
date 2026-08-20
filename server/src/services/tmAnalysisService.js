const { supabase } = require("../config/supabase");
const stringSimilarity = require("string-similarity");

const CATEGORY_DEFINITIONS = {
  ice: { name: "ICE / Context Match", billingWeight: 0.10, color: "#10b981" },
  exact: { name: "100% Exact Match", billingWeight: 0.10, color: "#6366f1" },
  crossFileRepetitions: { name: "Cross-File Repetitions", billingWeight: 0.30, color: "#06b6d4" },
  internalRepetitions: { name: "Internal Repetitions", billingWeight: 0.30, color: "#8b5cf6" },
  fuzzy95: { name: "95% - 99% Fuzzy", billingWeight: 0.30, color: "#fbbf24" },
  fuzzy85: { name: "85% - 94% Fuzzy", billingWeight: 0.60, color: "#f59e0b" },
  fuzzy75: { name: "75% - 84% Fuzzy", billingWeight: 0.70, color: "#ea580c" },
  fuzzy50: { name: "50% - 74% Fuzzy", billingWeight: 1.00, color: "#ef4444" },
  new: { name: "New Words (0% - 49%)", billingWeight: 1.00, color: "#94a3b8" }
};

const cleanSourceText = (text) => {
  if (!text) return "";
  return String(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/__TAG_\d+__/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const countWords = (text) => {
  const clean = cleanSourceText(text);
  if (!clean || !/[\p{L}\p{N}]/u.test(clean)) return 0;
  return clean.split(/\s+/).filter(Boolean).length;
};

/**
 * Perform Cross-File and Project-Level TM Analysis
 */
const runProjectTmAnalysis = async ({
  projectId,
  targetLang,
  mode = "exclusive",
  crossFile = true,
  activeTenantId = null,
  isSuperAdmin = false
}) => {
  // 1. Fetch project details
  let projQuery = supabase.from("projects").select("*").eq("id", projectId);
  if (!isSuperAdmin && activeTenantId) {
    projQuery = projQuery.eq("organization_id", activeTenantId);
  }
  const { data: project, error: projErr } = await projQuery.single();
  if (projErr || !project) {
    throw new Error(`Project ${projectId} not found or access denied`);
  }

  const selectedTargetLang = targetLang || (Array.isArray(project.target_languages) ? project.target_languages[0] : (project.target_lang || "hi"));

  // 2. Fetch all documents in project in sequential order
  const { data: docs, error: docErr } = await supabase
    .from("documents")
    .select("id, name, word_count, file_size, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (docErr) throw docErr;
  const projectDocs = docs || [];

  // 3. Fetch translation memory entries for the target language
  let tmQuery = supabase
    .from("translation_memory")
    .select("source_text, target_text, provider")
    .eq("target_lang", selectedTargetLang);

  if (!isSuperAdmin && (activeTenantId || project.organization_id)) {
    tmQuery = tmQuery.eq("organization_id", activeTenantId || project.organization_id);
  }

  const { data: tmEntries } = await tmQuery;
  const tmList = tmEntries || [];

  const tmExactMap = new Map();
  const tmSourcesList = [];
  for (const item of tmList) {
    if (item.source_text) {
      const norm = cleanSourceText(item.source_text).toLowerCase();
      if (norm) {
        tmExactMap.set(norm, item);
        tmSourcesList.push(norm);
      }
    }
  }

  // 4. Initialize Tracking State
  const isExclusive = mode === "exclusive";
  const useCrossFile = isExclusive && (crossFile === true || crossFile === "true");

  // Global Project Seen Segments Map: normalizedText -> { docId, docName, segmentIndex }
  const projectSeenSegments = new Map();

  const initCategoryStats = () => {
    const cats = {};
    for (const [key, def] of Object.entries(CATEGORY_DEFINITIONS)) {
      cats[key] = {
        name: def.name,
        count: 0,
        words: 0,
        percentage: 0,
        billingWeight: def.billingWeight,
        weightedWords: 0,
        color: def.color
      };
    }
    return cats;
  };

  const projectCategories = initCategoryStats();
  let projectTotalSegments = 0;
  let projectTotalWords = 0;
  let projectTotalWeightedWords = 0;
  const fileBreakdowns = [];

  // 5. Analyze each document sequentially
  for (const doc of projectDocs) {
    const { data: segs } = await supabase
      .from("document_segments")
      .select("segment_index, source_text, target_text, target_lang")
      .eq("document_id", doc.id)
      .order("segment_index", { ascending: true });

    const templateSegs = (segs || []).filter(s => !s.target_lang || s.target_lang === null);
    const countableSegs = templateSegs.length > 0 ? templateSegs : (segs || []);

    const fileCategories = initCategoryStats();
    const fileSeenSegments = new Map(); // normalizedText -> segmentIndex
    let fileTotalSegments = 0;
    let fileTotalWords = 0;
    let fileTotalWeightedWords = 0;

    for (const seg of countableSegs) {
      const cleaned = cleanSourceText(seg.source_text);
      if (!cleaned || !/[\p{L}\p{N}]/u.test(cleaned)) continue;

      const words = countWords(cleaned);
      if (words === 0) continue;

      fileTotalSegments++;
      fileTotalWords += words;

      const normalized = cleaned.toLowerCase();
      let matchedCategory = null;

      // Check 1: TM Exact Match (ICE or Exact)
      if (tmExactMap.has(normalized)) {
        const tmEntry = tmExactMap.get(normalized);
        const isIce = tmEntry.provider && tmEntry.provider.startsWith("Linguist (ICE)");
        matchedCategory = isIce ? "ice" : "exact";
      }
      // Check 2: Internal Repetition (seen earlier in THIS file)
      else if (fileSeenSegments.has(normalized)) {
        matchedCategory = "internalRepetitions";
      }
      // Check 3: Cross-File Repetition (Exclusive Mode: seen earlier in an EARLIER file of this project)
      else if (useCrossFile && projectSeenSegments.has(normalized)) {
        matchedCategory = "crossFileRepetitions";
      }
      // Check 4: Fuzzy Match against TM
      else if (tmSourcesList.length > 0) {
        try {
          const matchResult = stringSimilarity.findBestMatch(normalized, tmSourcesList);
          const bestRating = matchResult.bestMatch.rating;
          if (bestRating >= 0.95) {
            matchedCategory = "fuzzy95";
          } else if (bestRating >= 0.85) {
            matchedCategory = "fuzzy85";
          } else if (bestRating >= 0.75) {
            matchedCategory = "fuzzy75";
          } else if (bestRating >= 0.50) {
            matchedCategory = "fuzzy50";
          }
        } catch (_) {}
      }

      // Check 5: Default to New Words
      if (!matchedCategory) {
        matchedCategory = "new";
      }

      // Record occurrence in maps
      if (!fileSeenSegments.has(normalized)) {
        fileSeenSegments.set(normalized, seg.segment_index);
      }
      if (!projectSeenSegments.has(normalized)) {
        projectSeenSegments.set(normalized, {
          docId: doc.id,
          docName: doc.name,
          segmentIndex: seg.segment_index
        });
      }

      // Accumulate file-level metrics
      const weightedWords = Math.round(words * CATEGORY_DEFINITIONS[matchedCategory].billingWeight);
      fileCategories[matchedCategory].count += 1;
      fileCategories[matchedCategory].words += words;
      fileCategories[matchedCategory].weightedWords += weightedWords;
      fileTotalWeightedWords += weightedWords;

      // Accumulate project-level metrics
      projectCategories[matchedCategory].count += 1;
      projectCategories[matchedCategory].words += words;
      projectCategories[matchedCategory].weightedWords += weightedWords;
      projectTotalWeightedWords += weightedWords;
    }

    projectTotalSegments += fileTotalSegments;
    projectTotalWords += fileTotalWords;

    // Compute percentages for file
    for (const key of Object.keys(fileCategories)) {
      fileCategories[key].percentage = fileTotalWords > 0
        ? Math.round((fileCategories[key].words / fileTotalWords) * 100)
        : 0;
    }

    const fileSavings = fileTotalWords > 0
      ? Math.round(((fileTotalWords - fileTotalWeightedWords) / fileTotalWords) * 100)
      : 0;

    fileBreakdowns.push({
      documentId: doc.id,
      fileName: doc.name,
      totalSegments: fileTotalSegments,
      totalWords: fileTotalWords,
      totalWeightedWords: fileTotalWeightedWords,
      savingsPercentage: fileSavings,
      crossFileRepetitionWords: fileCategories.crossFileRepetitions.words,
      internalRepetitionWords: fileCategories.internalRepetitions.words,
      categories: fileCategories
    });
  }

  // Compute percentages for project
  for (const key of Object.keys(projectCategories)) {
    projectCategories[key].percentage = projectTotalWords > 0
      ? Math.round((projectCategories[key].words / projectTotalWords) * 100)
      : 0;
  }

  const projectSavings = projectTotalWords > 0
    ? Math.round(((projectTotalWords - projectTotalWeightedWords) / projectTotalWords) * 100)
    : 0;

  const totalCrossFileWords = projectCategories.crossFileRepetitions.words;
  const totalInternalWords = projectCategories.internalRepetitions.words;

  return {
    projectId,
    projectName: project.name,
    targetLanguage: selectedTargetLang,
    mode: isExclusive ? "exclusive" : "inclusive",
    crossFileEnabled: useCrossFile,
    totalDocuments: projectDocs.length,
    totalSegments: projectTotalSegments,
    totalWords: projectTotalWords,
    totalWeightedWords: projectTotalWeightedWords,
    savingsPercentage: projectSavings,
    crossFileRepetitionWords: totalCrossFileWords,
    internalRepetitionWords: totalInternalWords,
    categories: projectCategories,
    fileBreakdowns
  };
};

/**
 * Perform Single-Document TM Analysis
 */
const runDocumentTmAnalysis = async ({
  documentId,
  targetLang,
  activeTenantId = null,
  isSuperAdmin = false
}) => {
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, name, project_id, target_lang, organization_id")
    .eq("id", documentId)
    .single();

  if (docErr || !doc) {
    throw new Error(`Document ${documentId} not found`);
  }

  const selectedTargetLang = targetLang || doc.target_lang || "hi";

  const { data: segs } = await supabase
    .from("document_segments")
    .select("segment_index, source_text, target_text, target_lang")
    .eq("document_id", documentId)
    .order("segment_index", { ascending: true });

  const templateSegs = (segs || []).filter(s => !s.target_lang || s.target_lang === null);
  const countableSegs = templateSegs.length > 0 ? templateSegs : (segs || []);

  // Fetch TM
  let tmQuery = supabase
    .from("translation_memory")
    .select("source_text, target_text, provider")
    .eq("target_lang", selectedTargetLang);

  if (!isSuperAdmin && (activeTenantId || doc.organization_id)) {
    tmQuery = tmQuery.eq("organization_id", activeTenantId || doc.organization_id);
  }

  const { data: tmEntries } = await tmQuery;
  const tmList = tmEntries || [];

  const tmExactMap = new Map();
  const tmSourcesList = [];
  for (const item of tmList) {
    if (item.source_text) {
      const norm = cleanSourceText(item.source_text).toLowerCase();
      if (norm) {
        tmExactMap.set(norm, item);
        tmSourcesList.push(norm);
      }
    }
  }

  const initCategoryStats = () => {
    const cats = {};
    for (const [key, def] of Object.entries(CATEGORY_DEFINITIONS)) {
      cats[key] = {
        name: def.name,
        count: 0,
        words: 0,
        percentage: 0,
        billingWeight: def.billingWeight,
        weightedWords: 0,
        color: def.color
      };
    }
    return cats;
  };

  const categories = initCategoryStats();
  const seenSegments = new Map();
  let totalSegments = 0;
  let totalWords = 0;
  let totalWeightedWords = 0;

  for (const seg of countableSegs) {
    const cleaned = cleanSourceText(seg.source_text);
    if (!cleaned || !/[\p{L}\p{N}]/u.test(cleaned)) continue;

    const words = countWords(cleaned);
    if (words === 0) continue;

    totalSegments++;
    totalWords += words;

    const normalized = cleaned.toLowerCase();
    let matchedCategory = null;

    if (tmExactMap.has(normalized)) {
      const tmEntry = tmExactMap.get(normalized);
      const isIce = tmEntry.provider && tmEntry.provider.startsWith("Linguist (ICE)");
      matchedCategory = isIce ? "ice" : "exact";
    } else if (seenSegments.has(normalized)) {
      matchedCategory = "internalRepetitions";
    } else if (tmSourcesList.length > 0) {
      try {
        const matchResult = stringSimilarity.findBestMatch(normalized, tmSourcesList);
        const bestRating = matchResult.bestMatch.rating;
        if (bestRating >= 0.95) matchedCategory = "fuzzy95";
        else if (bestRating >= 0.85) matchedCategory = "fuzzy85";
        else if (bestRating >= 0.75) matchedCategory = "fuzzy75";
        else if (bestRating >= 0.50) matchedCategory = "fuzzy50";
      } catch (_) {}
    }

    if (!matchedCategory) matchedCategory = "new";

    if (!seenSegments.has(normalized)) {
      seenSegments.set(normalized, seg.segment_index);
    }

    const weightedWords = Math.round(words * CATEGORY_DEFINITIONS[matchedCategory].billingWeight);
    categories[matchedCategory].count += 1;
    categories[matchedCategory].words += words;
    categories[matchedCategory].weightedWords += weightedWords;
    totalWeightedWords += weightedWords;
  }

  for (const key of Object.keys(categories)) {
    categories[key].percentage = totalWords > 0
      ? Math.round((categories[key].words / totalWords) * 100)
      : 0;
  }

  const savingsPercentage = totalWords > 0
    ? Math.round(((totalWords - totalWeightedWords) / totalWords) * 100)
    : 0;

  return {
    documentId,
    fileName: doc.name,
    targetLanguage: selectedTargetLang,
    projectId: doc.project_id,
    totalSegments,
    totalWords,
    totalWeightedWords,
    savingsPercentage,
    categories
  };
};

module.exports = {
  runProjectTmAnalysis,
  runDocumentTmAnalysis,
  CATEGORY_DEFINITIONS
};
