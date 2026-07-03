const axios = require("axios");
const { protectTags, restoreProtectedTags } = require("../utils/tagProtection");

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
const OPENAI_MODEL = "gpt-4o-mini";

const parseRetryAfter = (errorMessage) => {
  if (!errorMessage) return null;
  const match = errorMessage.match(/try again in ([0-9.]+)(ms|s|m)/i);
  if (match) {
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === "ms") return value;
    if (unit === "s") return value * 1000;
    if (unit === "m") return value * 60 * 1000;
  }
  return null;
};

const callOpenAIWithRetry = async (payload, retries = 5, attempt = 1) => {
  try {
    const response = await axios.post("https://api.openai.com/v1/chat/completions", payload, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 120000
    });
    return response;
  } catch (err) {
    const isRateLimit = err.response?.status === 429;
    const isNetworkError = !err.response || err.code === "ECONNRESET" || err.code === "ETIMEDOUT";

    if (retries > 0 && (isRateLimit || isNetworkError || err.response?.status >= 500)) {
      let delay = 0;
      if (isRateLimit) {
        const errorMsg = err.response?.data?.error?.message || err.message || "";
        const parsedDelay = parseRetryAfter(errorMsg);
        if (parsedDelay !== null) {
          delay = parsedDelay + 1500; // Add 1.5s buffer
          console.warn(`[Translation OpenAI API Call] Rate limit parsed from error. Sleeping for ${Math.round(delay)}ms... Error: ${errorMsg}`);
        }
      }

      if (delay === 0) {
        // Fallback to exponential backoff
        const baseDelay = Math.pow(2, attempt) * 2000;
        const jitter = Math.random() * 1000;
        delay = baseDelay + jitter;
      }

      console.warn(`[Translation OpenAI API Call] Failed with status ${err.response?.status || err.code} on attempt ${attempt}. Retrying in ${Math.round(delay)}ms... Error: ${err.message}`);
      await sleep(delay);
      return callOpenAIWithRetry(payload, retries - 1, attempt + 1);
    }
    throw err;
  }
};

const getTargetSpecificTranslationRules = (targetLang, sourceLang, contextSettings = null) => {
  const getLangName = (code) => {
    try {
      return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
    } catch (e) {
      return code;
    }
  };

  const targetLangName = getLangName(targetLang);
  const tone = contextSettings?.tone || "General";
  const formality = contextSettings?.formality || "Neutral";
  const domain = contextSettings?.domain || "General";
  const isHindi = targetLang.toLowerCase().startsWith("hi");

  let domainGuidelines = "";
  const lowerDomain = domain.toLowerCase();
  
  if (lowerDomain.includes("legal") || lowerDomain.includes("contract") || lowerDomain.includes("agreement")) {
    domainGuidelines = `
- LEGAL DOMAIN CONSTRAINTS (STRICT):
  * Use legally precise, standard formal language native to ${targetLangName} contract drafting.
  * Never replace established legal terms with colloquial equivalents (e.g. translate "to the extent of conflict" as "संघर्ष की सीमा तक" in Hindi, NOT "संघर्ष के मामले में").
  * Translate "invocation" of security/lien as enforcement ("प्रवर्तन" or "आह्वान" in Hindi), NOT "आवेदन" (application).
  * Translate boilerplate lists of representatives (e.g. "legal heirs, executors and administrators") completely without omitting any elements.
`;
  } else if (lowerDomain.includes("banking") || lowerDomain.includes("finance") || lowerDomain.includes("financial")) {
    domainGuidelines = `
- FINANCIAL & BANKING DOMAIN CONSTRAINTS (STRICT):
  * Do NOT literally translate established financial terms. "Drawing Power" must remain "ड्राइंग पावर" or "आहरण सीमा", NOT "उपयोग की शक्ति".
  * "At actuals" refers to the actual expenses/costs incurred (वास्तविक लागत / वास्तविक व्यय के अनुसार), NOT the asset value (वास्तविक मूल्य).
  * "Ad valorem duty" is a value-based tax/duty, translated as "मूल्यानुसार शुल्क" or "एड वैलोरम ड्यूटी" in Hindi, NOT generic "शुल्क".
  * Keep standard banking terms or acronyms (e.g., "Key Facts Statement", "ROC", "CIBIL", "PDC") in their professional English/Latin representation if commonly used in local target documents.
`;
  } else if (lowerDomain.includes("tech") || lowerDomain.includes("software") || lowerDomain.includes("it")) {
    domainGuidelines = `
- TECHNICAL & SOFTWARE IT DOMAIN CONSTRAINTS (STRICT):
  * Maintain industry-standard technical terms (e.g., "interface", "dashboard", "database", "repository") rather than forced, obscure native equivalents.
  * Preserve all code variables, placeholder patterns, and syntax keywords (e.g., "{user_name}", "%d", "&&", "||") exactly as they are in the source text. Do NOT translate them.
`;
  } else if (lowerDomain.includes("medical") || lowerDomain.includes("health") || lowerDomain.includes("healthcare")) {
    domainGuidelines = `
- MEDICAL & HEALTHCARE DOMAIN CONSTRAINTS (STRICT):
  * Enforce strict compliance with standard medical nomenclature (e.g. anatomical terms, pharmaceutical brand names, clinical diagnoses).
  * Avoid any colloquialisms, casual translations, or layperson approximations of clinical terminology.
`;
  }

  let languageSpecific = "";
  if (isHindi) {
    languageSpecific = `
- Since the target language is Hindi, you MUST write the output strictly in the Devanagari script. Do NOT use Perso-Arabic (Urdu) characters or Urdu-only vocabulary under any circumstances. Every word must be standard Hindi written in Devanagari.
- Always place a space after the Hindi purna-viram ('।') full stop when starting a new sentence (e.g. 'है। हमारी' -> 'है। हमारी').
- HINDI GENDER AGREEMENT: Ensure perfect grammatical gender and possessive agreement for common banking words in Hindi:
  * 'अस्वीकृति' (dishonour/rejection) is FEMININE (e.g. 'भुगतान निर्देशों की अस्वीकृति', NOT 'भुगतान निर्देशों का अस्वीकृति').
  * 'सहमति' (consent) is FEMININE (e.g., 'आपकी सहमति').
  * 'सहमति पत्र' (consent letter) is MASCULINE (e.g., 'का सहमति पत्र' / 'आपका सहमति पत्र').
  * 'मांग' (demand) is FEMININE (e.g., 'मांग की जाएगी').
  * 'अवधि' (period/tenure) is FEMININE (e.g., 'ऋण की अवधि').
  * 'अधिकार' (right) is MASCULINE (e.g., 'लेंडर का अधिकार').
  * 'निर्देश' / 'निर्देशों' / 'अनुदेश' (instructions) is MASCULINE (e.g., 'भुगतान निर्देशों का पालन').
- HINDI COMMON TRANSLATIONS:
  * 'unattested' -> translate as 'गैर-हस्ताक्षरित' (do NOT write 'बिना हस्ताक्षरित').
  * 'legal heirs, executors and administrators' -> translate as 'कानूनी उत्तराधिकारी, निष्पादक और प्रशासक'.
  * 'loan-cum-pledge agreement' -> translate as 'ऋण-सह-गिरवी समझौता'.
  * 'repayment mode/mandate' -> translate as 'पुनर्भुगतान मोड/जनादेश' or 'पुनर्भुगतान मोड/आदेश'.
  * 'undertakes' / 'undertaking' -> translate as 'वचन देता है' or 'वचनबद्ध है' / 'वचनबद्धता' (do NOT leave as English 'undertaking' in Hindi).
  * 'governing' -> translate as 'नियंत्रित करने वाला'.
  * 'sanctioned details' -> translate as 'अनुमोदित विवरण'.`;
  } else {
    // General multilingual grammar guidelines
    languageSpecific = `
- Ensure standard grammatical gender, case, and possessive agreements in ${targetLangName}.
- Respect local punctuation, capitalization, and naming conventions of the ${targetLangName} professional community.
- Preserve standard acronyms and uppercase brand abbreviations.`;
  }

  return `
- TARGET GRAMMAR & COMPLIANCE: Ensure the translation is grammatically correct, matches correct gender/number agreements, and uses standard punctuation/syntax native to the ${targetLangName} language.
- TONE & FORMALITY COMPLIANCE: The translation must adhere strictly to a ${formality} level of formality and ${tone} tone suitable for the ${domain} domain.
${languageSpecific}
${domainGuidelines}
`;
};

const buildTranslationSystemPrompt = (targetLang, sourceLang, contextSettings, contextJira = "", contextDescription = "") => {
  const getLangName = (code) => {
    try {
      return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
    } catch (e) {
      return code;
    }
  };

  const sourceName = getLangName(sourceLang);
  const targetName = getLangName(targetLang);

  // Determine Tone and Formality
  const tone = contextSettings?.tone || "General";
  const formality = contextSettings?.formality || "Neutral";

  // Check if informal is requested either globally or in custom description/Jira
  const combinedContextText = `${contextJira || ""} ${contextDescription || ""}`.toLowerCase();
  const hasCasualKeywords = combinedContextText.includes("informal") ||
                            combinedContextText.includes("casual") ||
                            combinedContextText.includes("friendly") ||
                            combinedContextText.includes("day-to-day") ||
                            combinedContextText.includes("day to day") ||
                            combinedContextText.includes("talk") ||
                            combinedContextText.includes("conversational") ||
                            combinedContextText.includes("colloquial") ||
                            combinedContextText.includes("extreme") ||
                            combinedContextText.includes("simple") ||
                            combinedContextText.includes("warm") ||
                            combinedContextText.includes("spoken");

  const isCasual = tone === "Casual" || 
                   tone === "Friendly" || 
                   formality === "Informal" || 
                   formality === "Very Informal" ||
                   hasCasualKeywords;

  let styleInstructions = "";
  if (isCasual) {
    styleInstructions = `
- YOU MUST MAKE THE TRANSLATION EXTREMELY INFORMAL, FRIENDLY, AND CASUAL (like day-to-day spoken conversational talk between friends).
- Avoid all formal, textbook, literal, or corporate translations.
- Rewrite sentences to sound like natural spoken language. Use active voice and warm phrasing.
- For English: Use everyday conversational terms and contractions (e.g. "don't", "can't", "it's"). Translate rigid legalese or rules into simple conversational explanations.
- For Hindi: Use highly conversational Hinglish/colloquial phrasing that people speak in real life. Completely avoid rigid, academic, or heavy Sanskritized words.
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

  const targetSpecificRules = getTargetSpecificTranslationRules(targetLang, sourceLang, contextSettings);

  const baseInstructions = `You are an expert human localizer and professional translator. You translate text from ${sourceName} to ${targetName}.
Your goal is to produce translations that read as if they were originally written by a native speaker of ${targetName}, rather than a machine.

CRITICAL LANGUAGE PURITY DIRECTIVES (SUPER STRICT):
- You MUST translate the text ONLY into the target language (${targetName}).
- Under no circumstances should you include words, characters, or script from any other language (for example, do NOT output Urdu/Arabic script or vocabulary when translating to Hindi).
- The output translation must be written strictly and purely in the standard script and vocabulary native to ${targetName}. Do NOT mix scripts or languages, except for preserving system tags or approved uppercase English acronyms.

CRITICAL STYLE DIRECTIVES:
- IGNORE the original text's tone/formality if it is formal. YOU MUST OVERRIDE the style to perfectly match the requested Tone (${tone}) and Formality (${formality}).
${styleInstructions}

TARGET LANGUAGE & DOMAIN RULES (STRICT):
${targetSpecificRules}

- Custom instructions, Jira context, or user feedback (if provided) always take absolute precedence over the default style instructions. If the user requests a change in tone, formality, style, or specific wording via custom instructions/description, you MUST follow those instructions fully.
- DO NOT leave standard English words (such as 'belonging', 'tackling', 'fellow travelers', 'stakeholders', 'champions') untranslated or transliterated verbatim in the target sentence, unless they are proper brand names (e.g. 'Tripadvisor', 'Viator') or technical codes. Translate them into correct, natural, standard terms of the target language.
- Ensure perfect grammatical correctness, phrasing, and gender agreement in the target language.
- Avoid literal, machine-like translations. The translation must sound natural and idiomatic in the target language.
- Technical terms MUST be transliterated appropriately.
- ABBREVIATIONS & ACRONYMS: Abbreviations MUST always be kept as abbreviations. Standard abbreviations (like 'Sr. No.', 'No.', 'Ltd.', 'Pvt.', 'Co.', 'Ref.', 'Cl.', 'Qty.', 'Amt.') must be translated to their corresponding standard abbreviations in the target language (e.g. 'Sr. No.' -> 'ক্র: নং' or 'ক্র.সং.', 'Ltd.' -> 'লিমিটেড' or 'লি.'), or kept entirely in English if commonly used in target business documents (e.g. 'Pvt. Ltd.'). NEVER output a mixed combination of partial English abbreviations and translated words (e.g. do NOT write 'Sr. ক্রমিক নং' or 'Sr. ক্র: নং'; either translate it fully to the target language abbreviation 'ক্র: নং' or preserve it in English 'Sr. No.').
- SECTION IDENTIFIERS & LETTERS: Always preserve Latin/English letters (A, B, C, D, I, II) representing document sections, annexures, parts, schedules, or lists (e.g., 'Annex A', 'Annex B', 'Part C', 'Clause 4(a)'). Do NOT translate or transliterate these identifier letters into the target script (e.g. do NOT write 'অ্যানেক্স বি' or 'पार्ट बी' or 'अनुभाग ए'). Keep them in Latin characters, e.g. write 'Annex B' or keep the B as English 'B' like 'অ্যানেক্স B' or 'Annex B'.
- ARABIC NUMERALS (0-9): Do NOT translate, convert, or localize standard English/Arabic numbers (e.g. '3', '15', '30', '160017') into native script digits (such as Bengali ৩ or Devanagari ३). All numerical digits MUST remain as standard ASCII English digits (0-9) in the target translation.
- DO NOT translate, transliterate, or localize list indices, alphabetic bullet points, numbering, section numbers, or clause labels (e.g. 'h.', 'j.', 'k.', 'l.', 'm.', 'b)', 'd)', 'a)', 's)', 'c)', 'r).', '1.', '2)', '5.', '16(a)'). They must be preserved EXACTLY as they appear in the original source text (keeping the same English alphabet/numbers and punctuation, e.g. keeping 'h.' as 'h.', 'b)' as 'b)', etc.).
- Uppercase English abbreviations, acronyms, or proper names (e.g. 'PDC', 'RBI', 'KYC', 'CIBIL', 'OTP', 'PAN') MUST be preserved EXACTLY in their original English uppercase form. Do NOT translate or transliterate them into Devanagari (e.g. do NOT write 'पीडीसी' for 'PDC', or 'आरबीआई' for 'RBI').
- STRICT COMPLETENESS & BOILERPLATE PRESERVATION: You MUST translate every single phrase, word, definition, and clause of the source text. Under no circumstances should you omit, summarize, truncate, or leave out any boilerplate legal details (such as lists of heirs, legal executors, administrators, covenants, or conditions). Every single legal term and detail in the source must have a direct, fully translated equivalent in the target translation.
- YOU MUST TRANSLATE EVERY SINGLE TEXT SEGMENT FULLY. Under no circumstances should you leave any segment untranslated, copy the English source verbatim, or return empty values for long or complex legal segments. Every segment MUST be translated into the target language.
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
    temperature: 0.0,
    max_tokens: 16000,
    response_format: { type: "json_object" }
  };

  const response = await callOpenAIWithRetry(payload);

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

// Local definition removed — imported from tagProtection utility instead.

const isScriptValidForLanguage = (text, targetLang) => {
  const cleanLang = String(targetLang || "").toLowerCase();
  
  // 1. If target is Hindi, strictly forbid any Perso-Arabic characters
  if (cleanLang.startsWith("hi")) {
    if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) {
      return false;
    }
  }

  // 2. Multilingual Script Purity Rule:
  // If target language is European or Latin-based (e.g. en, es, fr, de, it, pt),
  // forbid any non-Latin scripts (like Arabic, Cyrillic, Devanagari, Han/Chinese, Japanese, Hangul)
  const isLatinBased = /^(en|es|fr|de|it|pt|nl|sv|no|da|fi|pl)/.test(cleanLang);
  if (isLatinBased) {
    if (/[\u0900-\u097F\u0600-\u06FF\u0400-\u04FF\u4E00-\u9FFF]/.test(text)) {
      return false;
    }
  }

  // 3. Forbid other target language scripts from leaking into each other.
  const isArabicBased = /^(ar|ur|fa|ps|sd)/.test(cleanLang);
  if (!isArabicBased && /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text)) {
    if (/[\u0621-\u064A]/.test(text)) {
      return false;
    }
  }

  return true;
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

      // Validate script purity to prevent foreign scripts/Urdu leakage
      if (translated && !isScriptValidForLanguage(translated, target)) {
        console.warn(`[Translation Validation Failed] Unsafe script detected in translation for target "${target}": "${translated}"`);
        translated = null; // force fallback to source text
      }

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
});const translateSegmentWithVision = async ({
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

  // Protect HTML tags to preserve formatting
  const { protectedText: protectedSource, tags } = protectTags(sourceText);
  let protectedExisting = undefined;
  if (existingTranslation) {
    const { protectedText } = protectTags(existingTranslation);
    protectedExisting = protectedText;
  }

  const baseSystemPrompt = buildTranslationSystemPrompt(targetLang, sourceLang, contextSettings, contextJira, contextDescription);
  const targetSpecificRules = getTargetSpecificTranslationRules(targetLang, sourceLang, contextSettings);

  const jsonFormattingInstructions = `\n\nCRITICAL OUTPUT FORMATTING: You are a pure translation engine. You MUST ONLY output valid JSON. Your response must be a JSON object containing a single key "translation" containing the translated string. Output a JSON object like this:
{
  "translation": "your_smart_translation_here"
}
Preserve any __TAG_n__ tokens (like __TAG_0__, __TAG_1__, etc.) exactly as they are in the source, and place them in the correct corresponding translated position.`;

  let systemPrompt = baseSystemPrompt + jsonFormattingInstructions;

  // Add vision specific instructions
  systemPrompt += `\n\nVISION DIRECTIVES:
- Inspect the visual placement of the segment in the screenshot (if provided). Check where it is used (button, title, paragraph, menu item) and adapt your translation to fit that layout, role, and style.
- Apply localizer common sense. Use standard, natural terminology corresponding to that visual element.
- Strictly adhere to any custom description/instructions or terminology limits in the Jira story.`;

  if (existingTranslation) {
    systemPrompt += `\n\nREFINEMENT AND EDITING DIRECTIVES:
- You are provided with an 'Existing Translation' of the source segment (with tag placeholders): "${protectedExisting}".
- If the user provides custom instructions, a Jira story, or context settings (e.g., asking to make the translation "more informal", "extremely informal", "friendly", "formal again", etc.), you MUST analyze the 'Existing Translation' and rewrite/refine it to strictly satisfy the user's instructions.
- Do NOT return the 'Existing Translation' unmodified if the user's instructions ask for a change in tone, formality, style, or vocabulary. You must perform the requested changes.
- Ensure the final translation remains a correct and complete translation of the 'Source Segment', but is rewritten to match the requested style.
- The final output MUST be in the requested target language (${targetLangName}). Do not output in any other language.`;
  }

  let textPrompt = `Translate the following source text segment:
Source Segment: "${protectedSource}"
Translate to: ${targetLangName} (from ${sourceLangName})`;

  if (protectedExisting) {
    textPrompt += `\nExisting Translation: "${protectedExisting}"`;
  }

  if (contextJira) {
    textPrompt += `\n\nJira Story Context:\n${contextJira}`;
  }
  if (contextDescription) {
    textPrompt += `\n\nCustom Instructions / Description:\n${contextDescription}`;
  }

  if (prevSource || nextSource) {
    textPrompt += `\n\nSLIDING WINDOW LOCAL TRANSLATION CONTEXT:
Use the adjacent segments to resolve pronoun reference, gender continuity, terminology alignment, and semantic ambiguities:
${prevSource ? `- Previous Segment Source: "${prevSource}"` : ""}
${prevTarget ? `- Previous Segment Translation: "${prevTarget}"` : ""}
${nextSource ? `- Next Segment Source: "${nextSource}"` : ""}
${nextTarget ? `- Next Segment Translation: "${nextTarget}"` : ""}

DIRECTIVES FOR USING CONTEXT:
1. Ensure the translation of the current segment is grammatically, stylistically, and terminally consistent with the adjacent segments.
2. If the previous segment ends with a colon (":"), a comma (","), a conjunction, or is a conditional statement (e.g. "if:", "यदि:"), translate the current segment as a direct continuation of that clause (matching its grammatical mood, tense, and flow).
3. If an English term is ambiguous (e.g., "Term of Loan"), inspect the adjacent segments (if the next segment is a duration like "36 months", then "Term of Loan" refers to duration/tenure, translate it accordingly, e.g. "ऋण की अवधि" in Hindi).`;
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
    temperature: 0.0,
    response_format: { type: "json_object" }
  };

  const response = await callOpenAIWithRetry(payload);

  const content = response.data?.choices?.[0]?.message?.content;
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed.translation !== "string") {
      throw new Error("Invalid response format from OpenAI");
    }
    let rawTranslation = parsed.translation.trim();

    // ── Pass 2: Self-Correction Proofreading Loop ──
    const proofreadSysPrompt = `You are an expert translation editor and quality assurance proofreader.
Your task is to review the candidate translation and output a corrected, refined final translation that is highly accurate and fluent in ${targetLangName}.

TARGET LANGUAGE & DOMAIN RULES (STRICT):
${targetSpecificRules}

Specifically proofread for:
1. Omissions: Ensure that no boilerplate clauses or legal details (such as lists of heirs, administrators, executors, or key details) were omitted. If something is missing, restore it.
2. Terminology: Correct any literal or generic translations of industry terms (e.g. ensure 'Drawing Power' remains 'ड्राइंग पावर/आहरण सीमा', 'invocation' remains 'प्रवर्तन', and 'actuals' remains 'वास्तविक लागत').
3. Preservation: Ensure that no alphabetic list indicators or acronyms were translated.

Output your final translation inside a JSON object with a single "translation" key:
{
  "translation": "your_refined_translation_here"
}`;

    const proofreadUserPrompt = `Source Segment: "${protectedSource}"
Candidate Translation: "${rawTranslation}"

SLIDING WINDOW LOCAL TRANSLATION CONTEXT:
${prevSource ? `- Previous Source: "${prevSource}"` : ""}
${prevTarget ? `- Previous Translation: "${prevTarget}"` : ""}
${nextSource ? `- Next Source: "${nextSource}"` : ""}
${nextTarget ? `- Next Translation: "${nextTarget}"` : ""}`;

    const proofreadPayload = {
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: proofreadSysPrompt },
        { role: "user", content: proofreadUserPrompt }
      ],
      temperature: 0.0,
      response_format: { type: "json_object" }
    };

    const proofreadResponse = await callOpenAIWithRetry(proofreadPayload);

    const proofreadContent = proofreadResponse.data?.choices?.[0]?.message?.content;
    const proofreadParsed = JSON.parse(proofreadContent);
    if (proofreadParsed && typeof proofreadParsed.translation === "string") {
      rawTranslation = proofreadParsed.translation.trim();
    }

    // Restore protected HTML tags
    return restoreProtectedTags(rawTranslation, tags);
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
