const axios = require("axios");
const { protectTags } = require("../utils/tagProtection");

// Configurable endpoints and defaults via environment variables to avoid
// hard-coded values in source. Secure callers should set these in the runtime
// environment (e.g. process manager or container secrets) instead of editing
// code.
const GOOGLE_URL = process.env.GOOGLE_TRANSLATE_URL || "https://translate.googleapis.com/translate_a/single";
const MYMEMORY_URL = process.env.MYMEMORY_URL || "https://api.mymemory.translated.net/get";
const LIBRE_URL = process.env.LIBRE_URL || "https://translate.argosopentech.com/translate";
const LINGVA_URL = process.env.LINGVA_URL || "https://lingva.ml";

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
    OpenAI: 0,
    Google: 0,
    MyMemory: 0,
    LibreTranslate: 0,
    Lingva: 0
  }
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-3.5-turbo";

const translateWithOpenAI = async (protectedText, target, source = DEFAULT_SOURCE_LANG) => {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const systemPrompt = `You are a concise translator. Translate the user text from ${source} to ${target}. Do not modify or translate tokens that look like __TAG_0__, __TAG_1__ etc. Preserve punctuation and numbers. Return only the translated text without commentary.`;

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

const translateWithGoogle = async (protectedText, target, source = DEFAULT_SOURCE_LANG) => {
  const response = await axios.get(GOOGLE_URL, {
    params: {
      client: "gtx",
      sl: source,
      tl: target,
      dt: "t",
      q: protectedText
    },
    timeout: 10000
  });

  return (response.data?.[0] || [])
    .map((part) => part?.[0] || "")
    .join("");
};

const translateWithMyMemory = async (protectedText, target, source = DEFAULT_SOURCE_LANG) => {
  const response = await axios.get(MYMEMORY_URL, {
    params: {
      q: protectedText,
      langpair: `${source}|${target}`
    },
    timeout: 10000
  });

  return response.data.responseData.translatedText;
};

const translateWithLibreTranslate = async (protectedText, target, source = DEFAULT_SOURCE_LANG) => {
  const response = await axios.post(
    LIBRE_URL,
    {
      q: protectedText,
      source,
      target,
      format: "text"
    },
    {
      headers: {
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );

  return response.data.translatedText;
};

const translateWithLingva = async (protectedText, target, source = DEFAULT_SOURCE_LANG) => {
  const url = `${LINGVA_URL}/api/v1/${encodeURIComponent(source)}/${encodeURIComponent(target)}/${encodeURIComponent(protectedText)}`;
  const response = await axios.get(url, { timeout: 10000 });

  return response.data.translation;
};

const providers = [];

if (OPENAI_API_KEY) {
  providers.push({ name: "OpenAI", translate: translateWithOpenAI });
}

providers.push(
  { name: "Google", translate: translateWithGoogle },
  { name: "MyMemory", translate: translateWithMyMemory },
  { name: "LibreTranslate", translate: translateWithLibreTranslate },
  { name: "Lingva", translate: translateWithLingva }
);

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

module.exports = {
  createProviderState,
  translateChunk
};
