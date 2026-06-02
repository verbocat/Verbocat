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
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-3.5-turbo";

const translateWithOpenAI = async (protectedText, target, source = DEFAULT_SOURCE_LANG) => {
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
  
  const strictInstructions = `\n\nCRITICAL INSTRUCTIONS: You are a pure translation engine. You MUST ONLY output the translated text in ${targetName}. Do NOT act as a conversational AI. Do NOT write letters, complete sentences, or answer questions. If the text is just a fragment like "To," or "REJECTION LETTER", just translate that exact fragment to ${targetName}. Preserve any __TAG_n__ tokens.`;

  if (!systemPrompt) {
    systemPrompt = `Translate the user text from ${sourceName} to ${targetName}. Do not modify or translate tokens that look like __TAG_0__, __TAG_1__ etc. Preserve punctuation and numbers. Return only the translated text without commentary.` + strictInstructions;
  } else {
    systemPrompt = systemPrompt.replace(/{source}/g, sourceName).replace(/{target}/g, targetName) + strictInstructions;
  }

  const payload = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: protectedText }
    ],
    temperature: 0.0,
    max_tokens: 2000
  };

  const response = await axios.post("https://api.openai.com/v1/chat/completions", payload, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    timeout: 20000
  });

  const text = response.data?.choices?.[0]?.message?.content;
  return String(text || "").trim();
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

const callProviderWithRetry = async (provider, protectedText, target, source) => {
  let lastError = null;

  for (let attempt = 0; attempt < PROVIDER_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await provider.translate(protectedText, target, source);
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

const translateWithProviders = async (sourceText, protectedText, target, providerState, sourceLang = DEFAULT_SOURCE_LANG) => {
  if (!validateLang(sourceLang) || !validateLang(target)) {
    throw new Error("Invalid source or target language");
  }

  const now = Date.now();

  for (const provider of providers) {
    if ((providerState.cooldownUntil[provider.name] || 0) > now) {
      continue;
    }

    try {
      const candidate = await callProviderWithRetry(provider, protectedText, target, sourceLang);

      if (isUsableTranslation(sourceText, candidate)) {
        return {
          translated: candidate,
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

const translateChunk = async (texts, target, source = DEFAULT_SOURCE_LANG, providerState = createProviderState()) => {
  if (!target || !validateLang(target)) {
    throw new Error("Invalid or missing target language");
  }

  if (!validateLang(source)) {
    throw new Error("Invalid source language");
  }
  const results = [];

  for (const text of texts) {
    const key = cacheKey(text, target);
    const cachedSuccess = successCache.get(key);

    if (cachedSuccess) {
      results.push({
        source: text,
        translated: cachedSuccess.translated,
        provider: `${cachedSuccess.provider} Cache`
      });
      continue;
    }

    const cachedFailure = getFailedCache(key);

    if (cachedFailure) {
      results.push({
        source: text,
        translated: text,
        provider: "Cached Fallback"
      });
      continue;
    }

    const { protectedText, tags } = protectTags(text);

    if (protectedText.length > MAX_TEXT_LENGTH) {
      results.push({
        source: text,
        translated: text,
        provider: "TooLong"
      });
      continue;
    }

    const translation = await translateWithProviders(
      text,
      protectedText,
      target,
      providerState,
      source
    );

    let translated = translation?.translated || null;
    let provider = translation?.provider || null;

    if (!translated || translated.trim() === "") {
      translated = text;
      provider = "Fallback";
      setLimitedCache(
        failedCache,
        key,
        {
          createdAt: Date.now()
        },
        FAILED_CACHE_LIMIT
      );
    }

    const finalTranslation = stripVisibleTags(restoreProtectedTags(translated, tags));

    if (provider !== "Fallback") {
      setLimitedCache(
        successCache,
        key,
        {
          translated: finalTranslation,
          provider
        },
        SUCCESS_CACHE_LIMIT
      );
    }

    results.push({
      source: text,
      translated: finalTranslation,
      provider
    });
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
