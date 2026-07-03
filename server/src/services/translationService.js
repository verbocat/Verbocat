const { supabase } = require("../config/supabase");
const {
  createProviderState,
  translateChunk
} = require("./translationProviders");

const normalizeText = (text) =>
  String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const zeroDigits = [
  0x0966, // Devanagari (Hindi, Marathi, etc.)
  0x09E6, // Bengali
  0x0A66, // Gurmukhi (Punjabi)
  0x0AE6, // Gujarati
  0x0B66, // Oriya
  0x0BE6, // Tamil
  0x0C66, // Telugu
  0x0CE6, // Kannada
  0x0D66, // Malayalam
  0x0660, // Arabic-Indic
  0x06F0, // Extended Arabic-Indic (Persian, Urdu)
  0x0F20, // Tibetan
  0x17E0, // Khmer
  0x1810, // Mongolian
  0x1946, // Limbu
  0x19D0, // New Tai Lue
  0x1A80, // Tai Tham Hora
  0x1A90, // Tai Tham Tham
  0x1B50, // Balinese
  0x1BB0, // Sudanese
  0x1C40, // Lepcha
  0x1C50, // Ol Chiki
  0xA620, // Vai
  0xA8D0, // Saurashtra
  0xA900, // Kayah Li
  0xA9D0, // Javanese
  0xAA50, // Cham
  0xABF0, // Meetei Mayek
  0xFF10, // Fullwidth digits
];

const ensureEnglishNumerals = (text) => {
  if (!text) return "";
  return String(text).replace(/./gu, (char) => {
    const code = char.codePointAt(0);
    for (const zero of zeroDigits) {
      if (code >= zero && code <= zero + 9) {
        return String.fromCharCode(code - zero + 48);
      }
    }
    return char;
  });
};

const postProcessTranslation = (source, target, targetLang) => {
  let output = String(target || "").trim();

  // 1. List prefix protection: h. / b) / a) / r).
  // Match prefix like 'h. ', 'b) ', 'a) ', '1. ', 'r). ', '(a) '
  const prefixRegex = /^(\(?[a-zA-Z0-9]+\)[\.\)]?\s*|^[a-zA-Z0-9]+\.\s*)/;
  const sourceMatch = source.match(prefixRegex);
  if (sourceMatch) {
    const sourcePrefix = sourceMatch[1];
    if (!output.startsWith(sourcePrefix)) {
      // Find what target prefix was generated (e.g. any word/characters followed by a purna-viram, dot, or bracket)
      const targetPrefixRegex = /^(\(?[^\s]+\)[\.\।\)]?\s*|^[^\s]+[\.।]\s*)/;
      const targetMatch = output.match(targetPrefixRegex);
      if (targetMatch) {
        const targetPrefix = targetMatch[1];
        output = sourcePrefix + output.slice(targetPrefix.length);
      } else {
        output = sourcePrefix + output;
      }
    }
  }

  // 2. Acronym translation restoration (e.g. targetLang is Hindi)
  if (targetLang && targetLang.toLowerCase().startsWith("hi")) {
    const acronymsMap = {
      "आरबीआई": "RBI",
      "आर.बी.आई.": "RBI",
      "आरबीआइ": "RBI",
      "आर.बी.आइ.": "RBI",
      "आरबीआई": "RBI",
      "आरबीआय": "RBI",
      "पीडीसी": "PDC",
      "पी.डी.सी.": "PDC",
      "केवाईसी": "KYC",
      "के.वाई.सी.": "KYC",
      "ओटीपी": "OTP",
      "ओ.टी.पी.": "OTP",
      "सिबिल": "CIBIL",
      "पैन": "PAN",
      "एनआरआई": "NRI",
      "एन.आर.आई.": "NRI"
    };
    
    Object.keys(acronymsMap).forEach(key => {
      const regex = new RegExp(key, "g");
      output = output.replace(regex, acronymsMap[key]);
    });
  }

  return output;
};

const hasVisibleMarkup = (text) => /<\/?[a-z][^>]*>/i.test(text || "");

const digitString = (text) => String(text || "").replace(/\D/g, "");

const isSafeTmTranslation = (source, target, targetLang) => {
  const normalizedSource = normalizeText(source);
  const normalizedTarget = normalizeText(target);

  if (!normalizedTarget) {
    return false;
  }

  // Reject any translation containing raw __TAG_ placeholders
  if (/__TAG_/i.test(normalizedTarget)) {
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
    if (!/\p{L}/u.test(clean)) {
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

  const chunkSize = 20;

  const actualSourceLang = sourceLang || process.env.DEFAULT_SOURCE_LANG || "en";

  for (let index = 0; index < uniqueMissingSources.length; index += chunkSize) {
    const chunkSources = uniqueMissingSources.slice(index, index + chunkSize);
    const translatedChunk = await translateChunk(chunkSources, target, actualSourceLang, providerState, contextSettings);

    const insertRows = [];

    chunkSources.forEach((source, offset) => {
      const translated = translatedChunk[offset];
      const processedText = postProcessTranslation(source, translated.translated, target);
      const translatedText = ensureEnglishNumerals(processedText);

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

  const results = await Promise.all(segments.map(async (segment, index) => {
    const tmEntry = tmMap[segment.source];
    const targetText = tmEntry ? tmEntry.target_text : "";
    const provider = tmEntry && tmEntry.provider ? tmEntry.provider : "TM Database";

    return {
      id: segment.id,
      translated: targetText,
      provider: provider,
      qaIssues: [],
      mqmAccuracyScore: 100,
      mqmReport: null
    };
  }));

  return { results };
};

const translateSegmentWithContext = async ({
  sourceText,
  existingTranslation,
  targetLang,
  sourceLang,
  contextJira,
  contextDescription,
  screenshotBuffer,
  screenshotMimeType,
  contextSettings,
  prevSource,
  prevTarget,
  nextSource,
  nextTarget
}) => {
  const { translateSegmentWithVision } = require("./translationProviders");
  const actualSourceLang = sourceLang || "en";

  const translated = await translateSegmentWithVision({
    sourceText,
    existingTranslation,
    targetLang,
    sourceLang: actualSourceLang,
    contextJira,
    contextDescription,
    screenshotBuffer,
    screenshotMimeType,
    contextSettings,
    prevSource,
    prevTarget,
    nextSource,
    nextTarget
  });

  const processed = postProcessTranslation(sourceText, translated, targetLang);
  const cleanedTranslation = ensureEnglishNumerals(processed);

  // Run MQM evaluation on the newly translated segment to verify if errors are resolved
  const { evaluateTranslationMQM } = require("./mqmService");
  let mqmReport = null;
  let mqmAccuracyScore = 100;
  try {
    mqmReport = await evaluateTranslationMQM({
      sourceText,
      translatedText: cleanedTranslation,
      targetLang,
      sourceLang: actualSourceLang,
      contextJira,
      contextDescription,
      contextSettings,
      prevSource,
      prevTarget,
      nextSource,
      nextTarget,
      isFullAudit: true,
      screenshotBuffer,
      screenshotMimeType
    });
    mqmAccuracyScore = mqmReport?.accuracyScore !== undefined ? mqmReport.accuracyScore : 100;
  } catch (err) {
    console.error("Failed to run MQM on re-translated segment:", err);
  }

  return {
    translated: cleanedTranslation,
    qaIssues: [],
    mqmAccuracyScore,
    mqmReport
  };
};

module.exports = {
  translateSegments,
  isSafeTmTranslation,
  translateSegmentWithContext,
  ensureEnglishNumerals
};
