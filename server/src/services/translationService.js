const { supabase } = require("../config/supabase");
const { runQaChecks } = require("../utils/qa");
const {
  createProviderState,
  translateChunk
} = require("./translationProviders");

const normalizeText = (text) =>
  String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ensureEnglishNumerals = (text) => {
  return String(text || "").replace(/[०-९]/g, (match) => {
    return String.fromCharCode(match.charCodeAt(0) - 0x0966 + 48);
  });
};

const hasVisibleMarkup = (text) => /<\/?[a-z][^>]*>/i.test(text || "");

const digitString = (text) => String(text || "").replace(/\D/g, "");

const isSafeTmTranslation = (source, target, targetLang) => {
  const normalizedSource = normalizeText(source);
  const normalizedTarget = normalizeText(target);

  if (!normalizedTarget) {
    return false;
  }

  // Reject Hindi target text containing Urdu/Arabic characters (range [\u0600-\u06FF])
  if (targetLang === "hi" && /[\u0600-\u06FF]/.test(normalizedTarget)) {
    return false;
  }

  // Reject identical translations unless they are purely numbers, punctuation, codes, list pointers, or URLs
  if (normalizedSource.toLowerCase() === normalizedTarget.toLowerCase()) {
    const clean = normalizedSource.trim();
    
    // Check if it's a URL
    if (/https?:\/\/[^\s]+/i.test(clean)) {
      return true;
    }
    
    // Check if it has no letters at all (just numbers, punctuation, symbols)
    if (!/[a-zA-Z]/.test(clean)) {
      return true;
    }
    
    // Check if it is a list pointer like (a), (vi), 1., 5.11.3.2, a., etc.
    const isListPointer = /^\(?[a-zA-Z0-9]+\)?\.?$/i.test(clean) || /^\d+(\.\d+)*$/i.test(clean);
    if (isListPointer) {
      return true;
    }
    
    // Check if it's a short alphanumeric code (uppercase letters, numbers, spaces allowed but short)
    const isShortCode = /^[A-Z0-9\s:/-]+$/.test(clean) && clean.length <= 35;
    if (isShortCode) {
      return true;
    }
    
    // Otherwise, if identical, it is untranslated English
    return false;
  }

  if (hasVisibleMarkup(normalizedTarget) && !hasVisibleMarkup(normalizedSource)) {
    return false;
  }

  if (digitString(normalizedSource) !== digitString(normalizedTarget)) {
    return false;
  }

  if (
    normalizedSource.length <= 25 &&
    normalizedTarget.length > normalizedSource.length * 5
  ) {
    return false;
  }

  // Ensure English alphanumeric list pointers and section numbers are preserved
  const sourcePointers = normalizedSource.match(/\b\d+(?:\([a-zA-Z0-9]+\))+\.?|\b\d+\./g) || [];
  const targetPointers = normalizedTarget.match(/\b\d+(?:\([a-zA-Z0-9]+\))+\.?|\b\d+\./g) || [];
  if (sourcePointers.length !== targetPointers.length) {
    return false;
  }

  // Ensure contact info prefix abbreviations (T, F, M, Tel, Mob, etc.) are kept in English
  const hasTelPrefix = /\b[TFM]\b|\b(?:Tel|Mob|Fax|Email|Email ID)\b/i.test(normalizedSource);
  const targetHasTelPrefix = /\b[TFM]\b|\b(?:Tel|Mob|Fax|Email|Email ID)\b/i.test(normalizedTarget);
  if (hasTelPrefix && !targetHasTelPrefix) {
    return false;
  }

  return true;
};

const isPersistableProvider = (provider) =>
  provider && provider !== "Fallback" && provider !== "Cached Fallback";

const translateSegments = async (segments, target, sourceLang, contextSettings) => {
  const providerState = createProviderState();

  const uniqueSources = [...new Set(segments.map((s) => s.source))];

  const { data: existingTranslations } = await supabase
    .from("translation_memory")
    .select("*")
    .in("source_text", uniqueSources)
    .eq("target_lang", target);

  const tmMap = {};
  (existingTranslations || []).forEach((item) => {
    tmMap[item.source_text] = item;
  });

  const uniqueMissingSources = [];
  const sourceToIndex = new Map();

  segments.forEach((segment, index) => {
    const isTargetEmpty = !segment.target || segment.target.replace(/<\/?\d+>/g, "").trim() === "";
    if (isTargetEmpty) {
      const source = segment.source;
      if (!tmMap[source] || !isSafeTmTranslation(source, tmMap[source].target_text, target)) {
        if (!sourceToIndex.has(source)) {
          sourceToIndex.set(source, []);
          uniqueMissingSources.push(source);
        }
        sourceToIndex.get(source).push(index);
      }
    }
  });

  const chunkSize = 40;

  const actualSourceLang = sourceLang || process.env.DEFAULT_SOURCE_LANG || "en";

  for (let index = 0; index < uniqueMissingSources.length; index += chunkSize) {
    const chunkSources = uniqueMissingSources.slice(index, index + chunkSize);
    const translatedChunk = await translateChunk(chunkSources, target, actualSourceLang, providerState, contextSettings);

    const insertRows = [];

    chunkSources.forEach((source, offset) => {
      const translated = translatedChunk[offset];
      const translatedText = ensureEnglishNumerals(translated.translated);

      tmMap[source] = {
        source_text: source,
        target_text: translatedText,
        provider: translated.provider
      };

      if (isPersistableProvider(translated.provider)) {
        insertRows.push({
          source_text: source,
          target_text: translatedText,
          source_lang: actualSourceLang,
          target_lang: target,
          provider: translated.provider
        });
      }
    });

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase
        .from("translation_memory")
        .insert(insertRows);

      if (insertError) {
        console.log("SUPABASE INSERT ERROR");
        console.log(insertError);
      }
    }
  }

  const results = segments.map((segment) => {
    const tmEntry = tmMap[segment.source];
    const targetText = tmEntry ? tmEntry.target_text : "";
    const provider = tmEntry && tmEntry.provider ? tmEntry.provider : "TM Database";

    return {
      id: segment.id,
      translated: targetText,
      provider: provider,
      qaIssues: runQaChecks(segment.source, targetText)
    };
  });

  return { results };
};

module.exports = {
  translateSegments,
  isSafeTmTranslation
};
