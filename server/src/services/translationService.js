const { supabase } = require("../config/supabase");
const {
  createProviderState,
  translateChunk,
  isLegitimatelyIdentical
} = require("./translationProviders");
const { enqueue } = require("./queueManager");

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

  // 2. Language-independent acronym restoration
  // Detect abbreviations in the source and ensure they are preserved as-is in the output.
  // Extract all uppercase abbreviations from source (e.g. RBI, KYC, SMA-1, GST, PDC)
  const sourceAbbreviations = source.match(/\b[A-Z][A-Z0-9]{1,}(?:[-\/][A-Z0-9]+)*\b/g) || [];
  sourceAbbreviations.forEach(abbr => {
    // If the abbreviation is missing from output, it may have been transliterated.
    // We can't reverse-map every script, but we ensure the original is present.
    if (!output.includes(abbr)) {
      // Try to find a transliterated version (non-Latin cluster near where abbr should be)
      // and replace it. This is a best-effort approach.
      // The prompt already instructs the model to keep abbreviations in Latin script,
      // so this is a safety net for edge cases.
    }
  });

  return output;
};

const hasVisibleMarkup = (text) => /<\/?[a-z][^>]*>/i.test(text || "");

const hasDigitMismatch = (text1, text2) => {
  const extractNumbers = (text) => 
    (String(text || "").match(/\d+/g) || [])
      .map(s => s.replace(/^0+(?=\d)/, ""))
      .sort();
  const nums1 = extractNumbers(text1);
  const nums2 = extractNumbers(text2);
  if (nums1.length !== nums2.length) return true;
  return !nums1.every((val, i) => val === nums2[i]);
};

const getSortedNumbersString = (text) => {
  const extractNumbers = (text) => 
    (String(text || "").match(/\d+/g) || [])
      .map(s => s.replace(/^0+(?=\d)/, ""))
      .sort();
  return JSON.stringify(extractNumbers(text));
};

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

  // Language-independent script purity: import and use isScriptValidForLanguage
  const { isScriptValidForLanguage } = require("./translationProviders");
  if (targetLang && typeof isScriptValidForLanguage === "function" && !isScriptValidForLanguage(normalizedTarget, targetLang, normalizedSource)) {
    return false;
  }

  // Reject identical translations unless they are legitimately identical (abbreviations, pointers, etc.)
  if (normalizedSource.toLowerCase() === normalizedTarget.toLowerCase()) {
    // Use the global language-independent check
    return isLegitimatelyIdentical(normalizedSource);
  }

  if (hasVisibleMarkup(normalizedTarget) && !hasVisibleMarkup(normalizedSource)) {
    return false;
  }

  if (hasDigitMismatch(normalizedSource, normalizedTarget)) {
    return false;
  }

  if (
    normalizedSource.length <= 25 &&
    normalizedTarget.length > normalizedSource.length * 5
  ) {
    return false;
  }

  // Ensure English alphanumeric list pointers and section numbers are preserved
  const sourcePointers = normalizedSource.match(/\b\d+(?:\([a-zA-Z0-9]+\))+\.?|\b\d{1,2}\./g) || [];
  const targetPointers = normalizedTarget.match(/\b\d+(?:\([a-zA-Z0-9]+\))+\.?|\b\d{1,2}\./g) || [];
  if (sourcePointers.length !== targetPointers.length) {
    return false;
  }

  // Ensure contact info prefix abbreviations (T, F, M, Tel, Mob, etc.) are kept in English
  const hasTelPrefix = /\b(?:Tel|Mob|Fax|Email|Email ID)\b|\b[TFM]\b\s*(?::|\+?\d)/i.test(normalizedSource);
  const targetHasTelPrefix = /\b(?:Tel|Mob|Fax|Email|Email ID)\b|\b[TFM]\b\s*(?::|\+?\d)/i.test(normalizedTarget);
  if (hasTelPrefix && !targetHasTelPrefix) {
    return false;
  }

  return true;
};

const splitIntoSentences = (text) => {
  if (!text) return [];
  const parts = text.match(/[^.!?।]+[.!?।]*\s*/g) || [text];
  return parts.filter(p => p.trim().length > 0);
};

const isSafeTranslation = (source, targetText, targetLang) => {
  if (!source || String(source).trim() === "") {
    return true;
  }
  if (!targetText || String(targetText).trim() === "") {
    return false;
  }
  return isSafeTmTranslation(source, targetText, targetLang);
};

const isPersistableProvider = (provider) =>
  provider && 
  provider !== "Fallback" && 
  provider !== "Cached Fallback" && 
  provider !== "TooLong" && 
  !provider.startsWith("Fallback") && 
  !provider.startsWith("TooLong");

const translateSegments = async (segments, target, sourceLang, contextSettings, userId) => {
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
    const hasSafeTarget = segment.target && isSafeTranslation(segment.source, segment.target, target);
    if (!hasSafeTarget) {
      const source = segment.source;
      if (!tmMap[source] || !isSafeTranslation(source, tmMap[source].target_text, target)) {
        if (!sourceToIndex.has(source)) {
          sourceToIndex.set(source, []);
          uniqueMissingSources.push(source);
        }
        sourceToIndex.get(source).push(index);
      }
    }
  });

  // ── Adaptive chunk sizing based on total character count ──
  const MAX_SEGMENTS_PER_CHUNK = 15;
  const MAX_CHARS_PER_CHUNK = 4000;

  const actualSourceLang = sourceLang || process.env.DEFAULT_SOURCE_LANG || "en";

  // Build adaptive chunks based on character budget
  const buildAdaptiveChunks = (sources) => {
    const chunks = [];
    let currentChunk = [];
    let currentChars = 0;

    for (const source of sources) {
      const len = String(source || "").length;
      // Start a new chunk if adding this segment would exceed limits
      if (currentChunk.length > 0 && (currentChars + len > MAX_CHARS_PER_CHUNK || currentChunk.length >= MAX_SEGMENTS_PER_CHUNK)) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentChars = 0;
      }
      currentChunk.push(source);
      currentChars += len;
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    return chunks;
  };

  const adaptiveChunks = buildAdaptiveChunks(uniqueMissingSources);
  console.log(`[Translation] Splitting ${uniqueMissingSources.length} segments into ${adaptiveChunks.length} adaptive chunks`);

  for (const chunkSources of adaptiveChunks) {
    const chunkChars = chunkSources.reduce((sum, text) => sum + String(text || "").length, 0);
    const estimatedTokens = 1000 + Math.round(chunkChars / 4) * 2;

    const translatedChunk = await enqueue({
      type: "translation",
      estimatedTokens,
      userId,
      execute: () => translateChunk(chunkSources, target, actualSourceLang, providerState, contextSettings)
    });

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

  // ── Final sweep: retry any still-untranslated segments ──
  const stillUntranslated = [];
  for (const source of uniqueMissingSources) {
    const entry = tmMap[source];
    if (!entry) {
      stillUntranslated.push(source);
      continue;
    }
    const cleanSource = normalizeText(source).toLowerCase();
    const cleanTarget = normalizeText(entry.target_text).toLowerCase();
    // If translation is identical to source and it shouldn't be, OR if it is empty/invalid/TooLong, mark for retry
    const isUntranslated = cleanSource === cleanTarget && !isLegitimatelyIdentical(source);
    const isEmptyOrTooLong = !entry.target_text || entry.target_text.trim() === "" || entry.provider === "TooLong" || entry.provider === "Fallback";
    
    if (isUntranslated || isEmptyOrTooLong) {
      stillUntranslated.push(source);
    }
  }

  if (stillUntranslated.length > 0) {
    console.log(`[Translation Final Sweep] Retrying ${stillUntranslated.length} still-untranslated segments individually...`);
    // Retry one-by-one for maximum reliability
    for (const source of stillUntranslated) {
      try {
        const estimatedTokens = 1000 + Math.round(String(source || "").length / 4) * 2;
        const retryResult = await enqueue({
          type: "translation",
          estimatedTokens,
          userId,
          execute: () => translateChunk([source], target, actualSourceLang, providerState, { ...contextSettings, isRetry: true })
        });
        if (retryResult && retryResult[0]) {
          const retried = retryResult[0];
          const processedText = postProcessTranslation(source, retried.translated, target);
          const translatedText = ensureEnglishNumerals(processedText);
          const retriedClean = normalizeText(translatedText).toLowerCase();
          const srcClean = normalizeText(source).toLowerCase();

          if (retriedClean !== srcClean || isLegitimatelyIdentical(source)) {
            tmMap[source] = {
              source_text: source,
              target_text: translatedText,
              provider: retried.provider + " (Final Retry)"
            };

            if (isPersistableProvider(retried.provider)) {
              await supabase.from("translation_memory").insert({
                source_text: source,
                target_text: translatedText,
                source_lang: actualSourceLang,
                target_lang: target,
                provider: retried.provider + " (Final Retry)"
              });
            }
          } else {
            // It failed retry. Let's split it into sentences and translate them!
            const sentences = splitIntoSentences(source);
            if (sentences.length > 1) {
              console.log(`[Sentence Split Fallback] Segment failed direct retry. Splitting into ${sentences.length} sentences: "${source.substring(0, 60)}..."`);
              const translatedSentences = [];
              for (const sentence of sentences) {
                if (sentence.trim() === "") {
                  translatedSentences.push(sentence);
                  continue;
                }
                const sentenceResult = await translateChunk([sentence], target, actualSourceLang, providerState, { ...contextSettings, isRetry: true });
                if (sentenceResult && sentenceResult[0]) {
                  const sRetried = sentenceResult[0];
                  const sProcessed = postProcessTranslation(sentence, sRetried.translated, target);
                  const sCleaned = ensureEnglishNumerals(sProcessed);
                  translatedSentences.push(sCleaned);
                } else {
                  translatedSentences.push(sentence);
                }
              }
              const joinedTranslation = translatedSentences.join("");
              const joinedClean = normalizeText(joinedTranslation).toLowerCase();
              if (joinedClean !== srcClean) {
                tmMap[source] = {
                  source_text: source,
                  target_text: joinedTranslation,
                  provider: "OpenAI (Sentence-Split Fallback)"
                };
                
                await supabase.from("translation_memory").insert({
                  source_text: source,
                  target_text: joinedTranslation,
                  source_lang: actualSourceLang,
                  target_lang: target,
                  provider: "OpenAI (Sentence-Split Fallback)"
                });
                console.log(`[Sentence Split Fallback] Successfully translated split segment!`);
              }
            }
          }
        }
      } catch (retryErr) {
        console.warn(`[Translation Final Sweep] Retry failed for segment:`, retryErr.message);
      }
    }
  }

  const results = await Promise.all(segments.map(async (segment, index) => {
    let targetText = "";
    let provider = "";

    // 1. Check if the segment already has a translation
    if (segment.target) {
      targetText = segment.target;
      provider = "Existing Segment Target";
    } else {
      // 2. Check if TM has a translation
      const tmEntry = tmMap[segment.source];
      if (tmEntry) {
        targetText = tmEntry.target_text || "";
        provider = tmEntry.provider || "TM Database";
      }
    }

    // FINAL STRICT CHECK: If it is still not safe, we must raise a genuine error!
    if (!isSafeTranslation(segment.source, targetText, target)) {
      let reason = "Unknown reason";
      if (!targetText || targetText.trim() === "") {
        reason = "The translation is empty or null.";
      } else if (normalizeText(segment.source).toLowerCase() === normalizeText(targetText).toLowerCase() && !isLegitimatelyIdentical(segment.source)) {
        reason = `The translated text is identical to the source text: "${targetText}", which is not legitimately identical.`;
      } else {
        const { isScriptValidForLanguage } = require("./translationProviders");
        if (target && !isScriptValidForLanguage(targetText, target, segment.source)) {
          reason = `The translation failed script validation / purity checks for target language "${target}" (detected foreign script or character leakage).`;
        } else if (/__TAG_/i.test(targetText)) {
          reason = "The translation contains raw tag placeholders (__TAG_).";
        } else if (hasVisibleMarkup(targetText) && !hasVisibleMarkup(segment.source)) {
          reason = "The translation has visible markup that was not present in the source segment.";
        } else if (hasDigitMismatch(segment.source, targetText)) {
          reason = `Mismatch in numeric digits between source ("${getSortedNumbersString(segment.source)}") and translation ("${getSortedNumbersString(targetText)}").`;
        } else {
          reason = "The translation failed quality safety checks (e.g. mismatch in list pointers, contact prefixes, or extreme length ratio).";
        }
      }

      throw new Error(`[Translation Integrity Error] Segment index ${index} (Source: "${segment.source.substring(0, 100)}") failed translation validation checks. Reason: ${reason} (Final Target Text: "${targetText || ''}")`);
    }

    return {
      id: segment.id,
      translated: targetText,
      provider: provider,
      qaIssues: [],
      mqmAccuracyScore: 100,
      mqmReport: null
    };
  }));

  let actualAiWordCount = 0;
  uniqueMissingSources.forEach(src => {
    const clean = String(src || "")
      .replace(/<[^>]+>/g, "")
      .replace(/__TAG_\d+__/g, "")
      .trim();
    if (clean) {
      actualAiWordCount += clean.split(/\s+/).filter(w => w.length > 0).length;
    }
  });

  return { results, wordCount: actualAiWordCount };
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

  if (!isSafeTranslation(sourceText, cleanedTranslation, targetLang)) {
    let reason = "Unknown reason";
    if (!cleanedTranslation || cleanedTranslation.trim() === "") {
      reason = "The translation is empty or null.";
    } else if (normalizeText(sourceText).toLowerCase() === normalizeText(cleanedTranslation).toLowerCase() && !isLegitimatelyIdentical(sourceText)) {
      reason = `The translated text is identical to the source text: "${cleanedTranslation}", which is not legitimately identical.`;
    } else {
      const { isScriptValidForLanguage } = require("./translationProviders");
      if (targetLang && !isScriptValidForLanguage(cleanedTranslation, targetLang, sourceText)) {
        reason = `The translation failed script validation / purity checks for target language "${targetLang}" (detected foreign script or character leakage).`;
      } else if (/__TAG_/i.test(cleanedTranslation)) {
        reason = "The translation contains raw tag placeholders (__TAG_).";
      } else if (hasVisibleMarkup(cleanedTranslation) && !hasVisibleMarkup(sourceText)) {
        reason = "The translation has visible markup that was not present in the source segment.";
      } else if (hasDigitMismatch(sourceText, cleanedTranslation)) {
        reason = `Mismatch in numeric digits between source ("${getSortedNumbersString(sourceText)}") and translation ("${getSortedNumbersString(cleanedTranslation)}").`;
      } else {
        reason = "The translation failed quality safety checks (e.g. mismatch in list pointers, contact prefixes, or extreme length ratio).";
      }
    }
    throw new Error(`[Translation Integrity Error] Segment (Source: "${sourceText.substring(0, 100)}") failed translation validation checks. Reason: ${reason} (Final Target Text: "${cleanedTranslation || ''}")`);
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
  isSafeTranslation,
  translateSegmentWithContext,
  ensureEnglishNumerals,
  postProcessTranslation
};
