const axios = require("axios");
const { protectTags } = require("../utils/tagProtection");

// Keep only OpenAI provider; other external provider endpoints were removed
// to simplify the codebase and avoid maintaining multiple external fallbacks.

const DEFAULT_SOURCE_LANG = process.env.DEFAULT_SOURCE_LANG || "en";

const successCache = new Map();
const failedCache = new Map();

const SUCCESS_CACHE_LIMIT = 5000;
const FAILED_CACHE_TTL_MS = 10 * 60 * 1000;
const FAILED_CACHE_LIMIT = 2000;
const RATE_LIMIT_COOLDOWN_MS = 90 * 1000;
const PROVIDER_RETRY_DELAYS_MS = [800, 1800, 3500];

const normalizeTranslatedText = (text) =>
  String(text || "")
    .replace(/&#10;/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/।([^\s])/g, "। $1")
    .trim();

const stripVisibleTags = (text) =>
  normalizeTranslatedText(text).replace(/<\/?[^>]+>/g, "").trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_TEXT_LENGTH = parseInt(process.env.MAX_TRANSLATION_TEXT_LENGTH, 10) || 5000;

const validateLang = (lang) => {
  if (!lang || typeof lang !== "string") return false;
  // Simple ISO-ish check: 2-5 chars, letters and dash allowed (e.g. "pt-BR")
  return /^[a-zA-Z-]{2,5}$/.test(lang);
};

const cacheKey = (source, target) =>
  `${target}::${normalizeTranslatedText(source).toLowerCase()}`;

const setLimitedCache = (cache, key, value, limit) => {
  if (cache.size >= limit) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }

  cache.set(key, value);
};

const getFailedCache = (key) => {
  const cached = failedCache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.createdAt > FAILED_CACHE_TTL_MS) {
    failedCache.delete(key);
    return null;
  }

  return cached;
};

const isRateLimitError = (error) => {
  const status = error?.response?.status;
  return status === 403 || status === 408 || status === 429 || status === 503;
};

const isRetryableError = (error) => {
  if (isRateLimitError(error)) {
    return true;
  }

  return [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNABORTED",
    "ENOTFOUND",
    "EAI_AGAIN"
  ].includes(error?.code);
};

const createProviderState = () => ({
  cooldownUntil: {
    OpenAI: 0
  }
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const buildTranslationSystemPrompt = (targetLang, sourceLang, contextSettings) => {
  const getLangName = (code) => {
    try {
      return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
    } catch (e) {
      return code;
    }
  };

  const sourceName = getLangName(sourceLang);
  const targetName = getLangName(targetLang);
  const isHindi = targetLang.toLowerCase().startsWith("hi");

  // Determine Tone and Formality
  const tone = contextSettings?.tone || "General";
  const formality = contextSettings?.formality || "Neutral";

  let styleInstructions = "";
  if (tone === "Casual" || tone === "Friendly" || formality === "Informal" || formality === "Very Informal") {
    styleInstructions = `
- YOU MUST MAKE THE TRANSLATION EXTREMELY INFORMAL, FRIENDLY, AND CASUAL (like day-to-day spoken conversational talk between friends).
- Avoid all formal, textbook, literal, or corporate translations.
- Rewrite sentences to sound like natural spoken language. Use active voice and warm phrasing.
- For English: Use everyday conversational terms and contractions (e.g. "don't", "can't", "it's"). Translate rigid legalese or rules into simple conversational explanations (e.g. instead of "PFL may change interest rates at its sole discretion and will notify you...", write something like "PFL can change the interest rates whenever they need to, and they'll let you know on their website...").
- For Hindi: Use highly conversational Hinglish/colloquial phrasing that people speak in real life. Completely avoid rigid, academic, or heavy Sanskritized words (e.g., use 'लोन' instead of 'ऋण', 'डिटेल्स' instead of 'विवरण', 'कस्टमर' instead of 'उपभोक्ता', 'बदलेगी' instead of 'परिवर्तित करेगी').
- Under no circumstances should the translation sound stiff, legalistic, or machine-translated.`;
  } else if (tone === "Professional" || formality === "Formal" || formality === "Very Formal") {
    styleInstructions = `
- YOU MUST MAKE THE TRANSLATION FORMAL, PRECISE, AND PROFESSIONAL.
- Use official, standard, and legally sound terminology.
- Maintain a polite, structured, and authoritative tone suitable for legal agreements, official communications, or business contracts.`;
  } else {
    styleInstructions = `
- Translate standardly, keeping the original style, structure, and level of formality of the source text.`;
  }

  let languageSpecificInstructions = "";
  if (isHindi) {
    languageSpecificInstructions = `
- Since the target language is Hindi, you MUST write the output strictly in the Devanagari script. Do NOT use Perso-Arabic (Urdu) characters under any circumstances.
- Always place a space after the Hindi purna-viram ('।') full stop when starting a new sentence (e.g. 'है। हमारी' -> 'है। हमारी').`;
  }

  const baseInstructions = `You are an expert human localizer and professional translator. You translate text from ${sourceName} to ${targetName}.
Your goal is to produce translations that read as if they were originally written by a native speaker of ${targetName}, rather than a machine.

CRITICAL STYLE DIRECTIVES:
- IGNORE the original text's tone/formality if it is formal. YOU MUST OVERRIDE the style to perfectly match the requested Tone (${tone}) and Formality (${formality}).
${styleInstructions}
${languageSpecificInstructions}

- DO NOT leave standard English words (such as 'belonging', 'tackling', 'fellow travelers', 'stakeholders', 'champions') untranslated or transliterated verbatim in the target sentence, unless they are proper brand names (e.g. 'Tripadvisor', 'Viator') or technical codes. Translate them into correct, natural, standard terms of the target language.
- Ensure perfect grammatical correctness, phrasing, and gender agreement in the target language.
- Avoid literal, machine-like translations. The translation must sound natural and idiomatic in the target language.
- Technical terms MUST be transliterated appropriately.
- Abbreviations MUST always be kept as abbreviations (e.g. N/A -> N/A).
- Do NOT translate or transliterate alphanumeric list pointers, section numbers, or clause labels (e.g. '16(a).', '16(a)(i).', '17.', '7(a).', '7(b).', '5.'). Keep them exactly as they are in the original English text.
- Do NOT translate or transliterate contact prefixes or abbreviation labels like 'T', 'F', 'M', 'Tel', 'Mob', 'Fax', 'Email', 'Email ID'. Keep them exactly as they are in the original English text.
- Avoid literal/duplicate translations of doublets (e.g. translate 'Safety & Security' as 'सुरक्षा और संरक्षा' rather than repeating 'सुरक्षा').
- Translate common business/banking terms professionally (e.g. translate 'Earn ... interest' as 'ब्याज प्राप्त करें' in formal Hindi, or 'ब्याज मिलेगा' in informal Hindi).
- Maintain consistent terminology for recurring terms.`;

  return baseInstructions;
};

const translateWithOpenAI = async (protectedTexts, target, source = DEFAULT_SOURCE_LANG, contextSettings = null) => {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const getLangName = (code) => {
    try {
      return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
    } catch (e) {
      return code;
    }
  };

  const sourceName = getLangName(source);
  const targetName = getLangName(target);

  const baseSystemPrompt = buildTranslationSystemPrompt(target, source, contextSettings);
  
  const jsonFormattingInstructions = `\n\nCRITICAL OUTPUT FORMATTING: You are a pure translation engine. You MUST ONLY output valid JSON. Your response must be a JSON object containing a 'translations' array of strings. The translated strings MUST be in the exact same order as the input 'texts' array. Translate each string into ${targetName}. Do NOT act as a conversational AI. If a text is just a fragment like "To,", translate that exact fragment contextually. Preserve any __TAG_n__ tokens.`;

  const systemPrompt = baseSystemPrompt + jsonFormattingInstructions;

  let userContext = "";
  if (contextSettings) {
    userContext = `\n\nREMINDER: Tone is ${contextSettings.tone || "General"} and Formality is ${contextSettings.formality || "Neutral"}. YOU MUST ADAPT YOUR VOCABULARY STRICTLY TO THIS STYLE!`;
  }

  const payload = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify({ texts: protectedTexts }) + userContext }
    ],
    temperature: 0.3,
    max_tokens: 16000,
    response_format: { type: "json_object" }
  };

  const response = await axios.post("https://api.openai.com/v1/chat/completions", payload, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    timeout: 120000
  });

  const content = response.data?.choices?.[0]?.message?.content;
  try {
    const parsed = JSON.parse(content);
    if (!parsed.translations || !Array.isArray(parsed.translations)) {
      throw new Error("Invalid JSON structure from OpenAI");
    }
    return parsed.translations.map(t => String(t || "").trim());
  } catch (error) {
    console.error("OpenAI JSON parsing failed:", error, "Content:", content);
    throw error;
  }
};

const isUsableTranslation = (source, translated) => {
  const cleanSource = normalizeTranslatedText(source).toLowerCase();
  const cleanTranslated = normalizeTranslatedText(translated).toLowerCase();

  return (
    cleanTranslated &&
    cleanTranslated !== cleanSource &&
    !/<\/?[a-z][^>]*>/i.test(cleanTranslated)
  );
};

// Other provider implementations removed — OpenAI is the sole provider.

// Only use OpenAI as the translation provider.
// If `OPENAI_API_KEY` is not configured, the providers array will be empty
// and the service will fall back to returning the original text for safety.
const providers = [];

if (OPENAI_API_KEY) {
  providers.push({ name: "OpenAI", translate: translateWithOpenAI });
}

const callProviderWithRetry = async (provider, protectedTexts, target, source, contextSettings) => {
  let lastError = null;

  for (let attempt = 0; attempt < PROVIDER_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await provider.translate(protectedTexts, target, source, contextSettings);
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === PROVIDER_RETRY_DELAYS_MS.length - 1) {
        throw error;
      }

      await sleep(PROVIDER_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
};

const translateWithProviders = async (sourceTexts, protectedTexts, target, providerState, sourceLang = DEFAULT_SOURCE_LANG, contextSettings = null) => {
  if (!validateLang(sourceLang) || !validateLang(target)) {
    throw new Error("Invalid source or target language");
  }

  const now = Date.now();

  for (const provider of providers) {
    if ((providerState.cooldownUntil[provider.name] || 0) > now) {
      continue;
    }

    try {
      const candidateArray = await callProviderWithRetry(provider, protectedTexts, target, sourceLang, contextSettings);

      if (candidateArray && Array.isArray(candidateArray) && candidateArray.length === protectedTexts.length) {
        return {
          translatedArray: candidateArray,
          provider: provider.name
        };
      }
    } catch (error) {
      console.error(`[Translation Error - ${provider.name}]:`, error?.response?.data || error.message);
      if (isRateLimitError(error)) {
        providerState.cooldownUntil[provider.name] =
          Date.now() + RATE_LIMIT_COOLDOWN_MS;
      }
    }
  }

  return null;
};

const restoreProtectedTags = (translated, tags) => {
  let output = normalizeTranslatedText(translated);

  // Normalize spaces/casing around tag placeholders (e.g., "__tag_0__", "__TAG _ 1__", "__TAG_ 1 __")
  output = output.replace(/__\s*TAG\s*_\s*(\d+)\s*__/gi, '__TAG_$1__');

  const usedTags = new Set();

  // 1. Try exact matching by index first
  tags.forEach((tag, index) => {
    const placeholder = `__TAG_${index}__`;
    if (output.includes(placeholder)) {
      output = output.replace(placeholder, tag);
      usedTags.add(index);
    }
  });

  // 2. Fallback: If there are still __TAG_n__ placeholders in the output,
  // replace them with the unused tags in order.
  const remainingPlaceholderRegex = /__TAG_\d+__/g;
  
  const unusedIndices = [];
  for (let i = 0; i < tags.length; i++) {
    if (!usedTags.has(i)) {
      unusedIndices.push(i);
    }
  }

  let unusedPtr = 0;
  output = output.replace(remainingPlaceholderRegex, () => {
    if (unusedPtr < unusedIndices.length) {
      const tag = tags[unusedIndices[unusedPtr]];
      unusedPtr++;
      return tag;
    }
    return "";
  });

  return output;
};

const translateChunk = async (texts, target, source = DEFAULT_SOURCE_LANG, providerState = createProviderState(), contextSettings = null) => {
  if (!target || !validateLang(target)) {
    throw new Error("Invalid or missing target language");
  }

  if (!validateLang(source)) {
    throw new Error("Invalid source language");
  }

  const results = new Array(texts.length);
  const uncachedIndices = [];
  const uncachedTexts = [];
  const uncachedProtectedTexts = [];
  const uncachedTags = [];
  const uncachedKeys = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const key = cacheKey(text, target);
    
    // CACHE DISABLED TEMPORARILY FOR TESTING
    // const cachedSuccess = successCache.get(key);
    // if (cachedSuccess) {
    //   results[i] = { source: text, translated: cachedSuccess.translated, provider: `${cachedSuccess.provider} Cache` };
    //   continue;
    // }

    // const cachedFailure = getFailedCache(key);
    // if (cachedFailure) {
    //   results[i] = { source: text, translated: text, provider: "Cached Fallback" };
    //   continue;
    // }

    const { protectedText, tags } = protectTags(text);

    if (protectedText.length > MAX_TEXT_LENGTH) {
      results[i] = { source: text, translated: text, provider: "TooLong" };
      continue;
    }

    uncachedIndices.push(i);
    uncachedTexts.push(text);
    uncachedProtectedTexts.push(protectedText);
    uncachedTags.push(tags);
    uncachedKeys.push(key);
  }

  if (uncachedTexts.length > 0) {
    const translationData = await translateWithProviders(uncachedTexts, uncachedProtectedTexts, target, providerState, source, contextSettings);

    const translatedArray = translationData?.translatedArray || [];
    const provider = translationData?.provider || "Fallback";

    for (let j = 0; j < uncachedTexts.length; j++) {
      const originalIndex = uncachedIndices[j];
      const text = uncachedTexts[j];
      const key = uncachedKeys[j];
      const tags = uncachedTags[j];

      let translated = translatedArray[j];
      let currentProvider = provider;

      if (!translated || translated.trim() === "" || currentProvider === "Fallback") {
        translated = text;
        currentProvider = "Fallback";
        setLimitedCache(failedCache, key, { createdAt: Date.now() }, FAILED_CACHE_LIMIT);
      }

      const finalTranslation = restoreProtectedTags(translated, tags);

      if (currentProvider !== "Fallback") {
        setLimitedCache(successCache, key, { translated: finalTranslation, provider: currentProvider }, SUCCESS_CACHE_LIMIT);
      }

      results[originalIndex] = { source: text, translated: finalTranslation, provider: currentProvider };
    }
  }

  return results;
};

const getProviderStatus = () => ({
  providers: [
    { name: "OpenAI", enabled: !!OPENAI_API_KEY, model: OPENAI_MODEL }
  ],
  defaultSource: DEFAULT_SOURCE_LANG,
  maxTextLength: MAX_TEXT_LENGTH
});

const translateSegmentWithVision = async ({
  sourceText,
  targetLang,
  sourceLang,
  contextJira,
  contextDescription,
  screenshotBuffer,
  screenshotMimeType,
  contextSettings
}) => {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const getLangName = (code) => {
    try {
      return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
    } catch (e) {
      return code;
    }
  };

  const sourceLangName = getLangName(sourceLang);
  const targetLangName = getLangName(targetLang);

  const baseSystemPrompt = buildTranslationSystemPrompt(targetLang, sourceLang, contextSettings);

  const jsonFormattingInstructions = `\n\nCRITICAL OUTPUT FORMATTING: You are a pure translation engine. You MUST ONLY output valid JSON. Your response must be a JSON object containing a single key "translation" containing the translated string. Output a JSON object like this:
{
  "translation": "your_smart_translation_here"
}`;

  let systemPrompt = baseSystemPrompt + jsonFormattingInstructions;

  // Add vision specific instructions
  systemPrompt += `\n\nVISION DIRECTIVES:
- Inspect the visual placement of the segment in the screenshot (if provided). Check where it is used (button, title, paragraph, menu item) and adapt your translation to fit that layout, role, and style.
- Apply localizer common sense. Use standard, natural terminology corresponding to that visual element.
- Strictly adhere to any custom description/instructions or terminology limits in the Jira story.`;

  let textPrompt = `Translate the following source text segment:
Source Segment: "${sourceText}"
Translate to: ${targetLangName} (from ${sourceLangName})`;

  if (contextJira) {
    textPrompt += `\n\nJira Story Context:\n${contextJira}`;
  }
  if (contextDescription) {
    textPrompt += `\n\nCustom Instructions / Description:\n${contextDescription}`;
  }

  const userContent = [];
  userContent.push({
    type: "text",
    text: textPrompt
  });

  if (screenshotBuffer) {
    const base64Image = screenshotBuffer.toString("base64");
    const mime = screenshotMimeType || "image/png";
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${mime};base64,${base64Image}`
      }
    });
  }

  const payload = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    temperature: 0.3,
    response_format: { type: "json_object" }
  };

  const response = await axios.post("https://api.openai.com/v1/chat/completions", payload, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    timeout: 120000
  });

  const content = response.data?.choices?.[0]?.message?.content;
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed.translation !== "string") {
      throw new Error("Invalid response format from OpenAI");
    }
    return parsed.translation.trim();
  } catch (error) {
    console.error("OpenAI vision translation JSON parsing failed:", error, "Content:", content);
    throw error;
  }
};

module.exports = {
  createProviderState,
  translateChunk,
  getProviderStatus,
  translateSegmentWithVision
};
