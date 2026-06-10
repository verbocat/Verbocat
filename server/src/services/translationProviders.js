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

  let systemPrompt = process.env.OPENAI_SYSTEM_PROMPT;
  
  let contextBlock = "";
  let userContext = "";
  if (contextSettings) {
    contextBlock = `\nTranslation Context Metadata:\nDomain: ${contextSettings.domain || "General"}\nContent Type: ${contextSettings.contentType || "General"}\nAudience: ${contextSettings.audience || "General"}\nPurpose: ${contextSettings.purpose || "General"}\nTone: ${contextSettings.tone || "General"}\nFormality: ${contextSettings.formality || "Neutral"}\nTerminology Strictness: ${contextSettings.terminologyStrictness || "Flexible"}\nSEO Optimization: ${contextSettings.seoOptimization || "Off"}\n\nCRITICAL OVERRIDE INSTRUCTIONS:\nIGNORE any other instructions in this prompt that tell you to 'maintain original tone' or 'preserve original formality'. YOU MUST OVERRIDE THE ORIGINAL TEXT'S STYLE and adapt your wording to perfectly match the requested Tone (${contextSettings.tone || "General"}) and Formality (${contextSettings.formality || "Neutral"}).\nIf Tone is 'Casual' or Formality is 'Informal' or 'Very Informal', you MUST use highly colloquial, everyday conversational language (e.g., Hinglish for Hindi). For languages like Hindi, completely avoid highly academic, typical, or Sanskritized vocabulary (e.g., use 'लोन' instead of 'ऋण', 'डिटेल्स' instead of 'विवरण', 'कस्टमर' instead of 'उपभोक्ता'). Do not sound like a machine. Use natural, conversational phrasing that people use in real life.\nIf Formality is 'Very Formal', use precise, strict, professional, and standard terminology.`;
    
    userContext = `\n\nREMINDER: Tone is ${contextSettings.tone || "General"} and Formality is ${contextSettings.formality || "Neutral"}. YOU MUST OVERRIDE THE ORIGINAL TONE AND ADAPT YOUR VOCABULARY STRICTLY TO THIS OR YOU WILL BE PENALIZED!`;
  }
  
  const strictInstructions = `\n\nCRITICAL INSTRUCTIONS: You are a pure translation engine. You MUST ONLY output valid JSON. Your response must be a JSON object containing a 'translations' array of strings. The translated strings MUST be in the exact same order as the input 'texts' array. Translate each string into ${targetName}. Do NOT act as a conversational AI. If a text is just a fragment like "To,", translate that exact fragment contextually. Preserve any __TAG_n__ tokens.
Additionally:
- Technical terms MUST be transliterated (e.g. Locator -> लोकेटर not सुनने का यंत्र).
- Abbreviations MUST always be kept as abbreviations (e.g. N/A -> N/A not एन/ए).${contextBlock}`;

  if (!systemPrompt) {
    systemPrompt = `Translate the user texts from ${sourceName} to ${targetName}. Do not modify or translate tokens that look like __TAG_0__, __TAG_1__ etc. Preserve punctuation and numbers. Return only the translated text without commentary.` + strictInstructions;
  } else {
    systemPrompt = systemPrompt.replace(/{source}/g, sourceName).replace(/{target}/g, targetName) + strictInstructions;
  }

  const payload = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify({ texts: protectedTexts }) + userContext }
    ],
    temperature: 0.6,
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

  tags.forEach((tag, index) => {
    output = output.replace(`__TAG_${index}__`, tag);
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

module.exports = {
  createProviderState,
  translateChunk,
  getProviderStatus
};
