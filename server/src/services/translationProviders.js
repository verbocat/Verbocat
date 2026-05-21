const axios = require("axios");
const { protectTags } = require("../utils/tagProtection");

const translateWithMyMemory = async (protectedText, target) => {
  const response = await axios.get("https://api.mymemory.translated.net/get", {
    params: {
      q: protectedText,
      langpair: `en|${target}`
    },
    timeout: 10000
  });

  return response.data.responseData.translatedText;
};

const translateWithLibreTranslate = async (protectedText, target) => {
  const response = await axios.post(
    "https://translate.argosopentech.com/translate",
    {
      q: protectedText,
      source: "en",
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

const translateWithLingva = async (protectedText, target) => {
  const response = await axios.get(
    `https://lingva.ml/api/v1/en/${target}/${encodeURIComponent(protectedText)}`,
    {
      timeout: 10000
    }
  );

  return response.data.translation;
};

const restoreProtectedTags = (translated, tags) => {
  let output = translated.replace(/&#10;/g, " ").replace(/\s+/g, " ").trim();

  tags.forEach((tag, index) => {
    output = output.replace(`__TAG_${index}__`, tag);
  });

  return output;
};

const translateChunk = async (texts, target = "hi") => {
  const results = [];

  for (const text of texts) {
    const { protectedText, tags } = protectTags(text);
    let translated = null;
    let provider = null;

    try {
      translated = await translateWithMyMemory(protectedText, target);
      if (translated && translated.trim() !== "") {
        provider = "MyMemory";
      }
    } catch (error) {}

    if (!translated) {
      try {
        translated = await translateWithLibreTranslate(protectedText, target);
        if (translated && translated.trim() !== "") {
          provider = "LibreTranslate";
        }
      } catch (error) {}
    }

    if (!translated) {
      try {
        translated = await translateWithLingva(protectedText, target);
        if (translated && translated.trim() !== "") {
          provider = "Lingva";
        }
      } catch (error) {}
    }

    if (!translated || translated.trim() === "") {
      translated = text;
      provider = "Fallback";
    }

    results.push({
      source: text,
      translated: restoreProtectedTags(translated, tags),
      provider
    });
  }

  return results;
};

module.exports = {
  translateChunk
};
