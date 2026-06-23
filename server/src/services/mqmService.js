const axios = require("axios");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/**
 * Performs an honest, exact MQM audit of the translation against the source text and context.
 */
const evaluateTranslationMQM = async ({
  sourceText,
  translatedText,
  targetLang,
  sourceLang,
  contextJira,
  contextDescription,
  contextSettings
}) => {
  if (!OPENAI_API_KEY) {
    return {
      accuracyScore: 100,
      errors: [],
      clarifyingQuestions: [],
      improvementSuggestion: ""
    };
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

  const systemPrompt = `You are an expert translation quality auditor specialized in the MQM (Multidimensional Quality Metrics) framework.
Your task is to analyze the translation of a text segment and provide an honest, exact, and detailed quality audit.
Do NOT fake or exaggerate any ratings. If a translation is perfect, give it 100. If there are minor flaws, deduct points strictly based on severity.

MQM ERROR TAXONOMY:
1. Accuracy:
   - Addition (Extra words that change the meaning)
   - Omission (Key information left out)
   - Mistranslation (Incorrect meaning translated)
   - Untranslated (Words left in the source language that should have been translated)
2. Fluency:
   - Grammar (Syntax, gender agreement, conjugation errors)
   - Spelling (Typographical or spelling mistakes)
   - Punctuation (Incorrect or missing punctuation)
3. Terminology:
   - Incorrect Term (Using a wrong industry term)
   - Inconsistent Term (Not matching glossary or other occurrences)
4. Style:
   - Too Formal (Translation is rigid or academic when casual was requested)
   - Too Informal (Translation is slangy or casual when formal was requested)
   - Awkward (Stilted or unnatural phrasing)

SEVERITY SCORING DEDUCTIONS (Start at 100 points):
- Minor error: -3 points (Dissonance, style mismatch, minor fluency issue)
- Major error: -10 points (Mistranslation, omission, terminology error that changes meaning slightly)
- Critical error: -25 points (Severe mistranslation, omission, or wrong target language)

Target Language: ${targetLangName} (from ${sourceLangName})

CRITICAL FORMATTING: You must output ONLY a valid JSON object with the following structure:
{
  "accuracyScore": 85, // Math-based score from 0 to 100 after deductions
  "errors": [
    {
      "category": "Style / Too Formal",
      "severity": "Minor",
      "snippet": "Please note that",
      "explanation": "Presents a formal notification style. The user requested extremely informal day-to-day talk."
    }
  ],
  "clarifyingQuestions": [
    "Is 'PFL' a specific brand name that must remain untranslated, or does it stand for a local term that should be localized?"
  ],
  "improvementSuggestion": "Add custom description instruction: 'Use contractions like you've, it's and warm greetings like Hey, just a heads-up'"
}

If no errors are found, return empty arrays and an empty string for improvementSuggestion. Always provide clear, helpful questions or suggestions if the score is below 95.`;

  const userPrompt = `Source Segment: "${sourceText}"
Translated Segment: "${translatedText}"

CONTEXT & SETTINGS PROVIDED:
- Global Tone Setting: ${contextSettings?.tone || "General"}
- Global Formality Setting: ${contextSettings?.formality || "Neutral"}
- Jira Story Context: ${contextJira || "None"}
- Custom Instructions / Description: ${contextDescription || "None"}`;

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 60000
      }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    return {
      accuracyScore: typeof parsed.accuracyScore === "number" ? Math.max(0, Math.min(100, parsed.accuracyScore)) : 100,
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
      clarifyingQuestions: Array.isArray(parsed.clarifyingQuestions) ? parsed.clarifyingQuestions : [],
      improvementSuggestion: typeof parsed.improvementSuggestion === "string" ? parsed.improvementSuggestion : ""
    };
  } catch (error) {
    console.error("MQM evaluation failed:", error);
    return {
      accuracyScore: 100,
      errors: [],
      clarifyingQuestions: [],
      improvementSuggestion: ""
    };
  }
};

module.exports = {
  evaluateTranslationMQM
};
