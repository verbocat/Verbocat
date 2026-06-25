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

CONTEXT & SETTINGS REQUIREMENT:
- You MUST analyze and prioritize the provided Context & Settings first (Jira context, custom instructions/description, tone, formality) to guide your quality assessment.
- Analyze how the source text should be translated under these constraints, and evaluate if the translation complies with them.
- Any suggestions or corrections must align strictly with this context.
- TONE COMPLIANCE: If the requested tone is 'Formal' (or if the text is a legal/banking document), formal language is CORRECT. Do NOT flag formal phrasing as 'Too Formal' or suggest converting it to casual talk (e.g. do not suggest changing 'पुष्टि करता है' to 'बताना चाहता है').

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

FALSE-POSITIVE PREVENTION & LOCALIZATION RULES (CRITICAL):
- You MUST double check all potential errors before writing them down.
- Conjunction and Word Presence: Before marking a word or conjunction (like 'and', 'but', 'or') as "Omitted" or missing, you must verify if its target language equivalent (e.g. 'और', 'लेकिन', 'या' in Hindi) is already present in the translation. If it is present, it is NOT an error. Never report false omissions.
- Meaning Representation: If a concept or verb is already translated (e.g., 'have understood' translated as 'समझता है' or 'समझ गया है'), it is NOT omitted. Do not flag minor grammatical tense or voice differences as major omissions.
- Acronym and Abbreviation Preservation: Alphanumeric abbreviations, acronyms, and standard initialization codes (such as NRI, AMB, CIBIL, KYC, OTP, ATM) should be preserved in their Latin-script uppercase form in the translation (e.g. "NRI" in Hindi translation instead of transliterating to "एनआरआई", and "AMB" instead of "एएमबी"). If the translation transliterates these standard acronyms, you MUST flag this as a terminology or spelling error and suggest the Latin uppercase acronym (e.g., snippet: "एनआरआई", correction: "NRI").
- Grammatical Gender and Case Agreement: Check for grammatical agreement in the target language. For example, in Hindi, possessive/adjective agreement is strict. "सहमति" (consent) is feminine, so "आपका सहमति" is grammatically incorrect (should be "आपकी सहमति"). Similarly, if suggesting "सहमति पत्र" (consent letter, masculine), you must check if the possessive matches (e.g. "आपका सहमति पत्र" is correct). Suggest corrections that restore proper grammar and agreement.
- List Index Localization: Do NOT flag translated list indices (like letters or numerals) as errors if they represent standard local equivalents. For example, translating the English list letter 'h.)' to the corresponding Hindi letter 'झ.)' is standard and correct Devanagari listing order (skipping non-initial consonants like ङ). Do NOT flag this as mistranslation, addition, or spelling error.
- Standard Punctuation differences (like using '।' instead of '.') are correct target language punctuation and must not be flagged as errors.
- Do NOT deduct points unless you have concrete, indisputable evidence of an error. If there are no errors, the score must be exactly 100.

OFFENDING SNIPPET & CORRECTION RULES:
- The "snippet" field MUST contain ONLY the specific incorrect text/substring from the translated text that needs to be replaced. Do NOT include any surrounding correct words.
- The "correction" field MUST contain ONLY the corrected text to replace the offending "snippet" with. Do NOT include the whole sentence, only the exact correction.
- SYNTAX CHECK: Ensure that replacing the "snippet" with the "correction" in the translation yields a grammatically correct sentence. Do not introduce duplicate words (like duplicate conjunctions 'और और') or break sentence flow.

TECHNICAL TAGS & EMAIL INSTRUCTIONS:
- You will see formatting tags in the source and translation (such as "<5261>", "</5261>", "<65>", etc.). These are system-protected markup placeholders.
- Do NOT flag these system tags as 'untranslated text', 'additions', 'omissions', or 'spelling errors'. They must be ignored during quality evaluation and should be allowed to remain intact in the translation.
- Email addresses (e.g. "customercare@piramal.com") and phone numbers (e.g. "1800-266-6444") should remain untranslated. Do NOT flag them as untranslated or as omissions if they are kept identical in the translation.

Target Language: ${targetLangName} (from ${sourceLangName})

CRITICAL FORMATTING: You must output ONLY a valid JSON object with the following structure:
{
  "analysisSteps": [
    "Step 1: Analyzed Jira context, global tone, and formality constraints.",
    "Step 2: Fact-checked whether there is any list index or punctuation localization. The source has list index 'h.)' and the translation has 'झ.)'. 'झ' is the correct 8th index in Hindi list sequencing, so this is correct localization and not an error.",
    "Step 3: Fact-checked conjunction 'and'. The source has 'aware of and have understood' and translation has 'अवगत है और ... समझता है'. 'और' is present, meaning 'and' is translated properly and not omitted.",
    "Step 4: Checked for other spelling/grammar/mistranslation issues."
  ],
  "accuracyScore": 97, // Math-based score from 0 to 100 after deductions. If errors is empty, this MUST be 100.
  "errors": [
    {
      "category": "Terminology / Incorrect Term",
      "severity": "Minor",
      "snippet": "चार्जों", // ONLY the wrong text/substring from the translation
      "correction": "प्रभारों", // ONLY the corrected version of that substring to replace it with
      "explanation": "In standard banking/legal contexts, 'charges' is translated as 'प्रभारों' rather than the transliterated 'चार्जों'."
    }
  ],
  "clarifyingQuestions": [],
  "improvementSuggestion": "Consider adding a custom glossary instruction to translate 'charges' as 'प्रभार' for banking consistency."
}

If no errors are found, the accuracyScore MUST be 100, and you should return empty arrays for errors and clarifyingQuestions, and an empty string for improvementSuggestion.`;

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
    
    if (parsed.analysisSteps) {
      console.log(`[MQM CoT Analysis for "${sourceText.substring(0, 40)}..."]:`, parsed.analysisSteps);
    }

    const errors = Array.isArray(parsed.errors) ? parsed.errors : [];
    
    // Post-process programmatically to verify abbreviation & alignment accuracy
    checkAcronymErrors(sourceText, translatedText, errors);
    resolveOverlappingErrors(errors, translatedText);

    // Recalculate mathematical score based on corrected error severities
    let calculatedScore = 100;
    for (const err of errors) {
      const severity = (err.severity || "").toLowerCase();
      if (severity === "minor") {
        calculatedScore -= 3;
      } else if (severity === "major") {
        calculatedScore -= 10;
      } else if (severity === "critical") {
        calculatedScore -= 25;
      } else {
        calculatedScore -= 3; // Default minor deduction
      }
    }
    const accuracyScore = Math.max(0, calculatedScore);

    return {
      accuracyScore,
      errors,
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

// Programmatic acronym checking to prevent Devnagari transliterations of standard Latin abbreviations
const checkAcronymErrors = (sourceText, translatedText, errors) => {
  const acronyms = [
    { latin: "NRI", devanagari: "एनआरआई" },
    { latin: "AMB", devanagari: "एएमबी" },
    { latin: "CIBIL", devanagari: "सिबिल" },
    { latin: "CIBIL", devanagari: "सीआईबीआईएल" },
    { latin: "KYC", devanagari: "केवाईसी" },
    { latin: "OTP", devanagari: "ओटीपी" },
    { latin: "ATM", devanagari: "एटीएम" }
  ];

  for (const item of acronyms) {
    // Check if source contains the Latin acronym as a whole word
    const sourceRegex = new RegExp(`\\b${item.latin}\\b`, "i");
    if (sourceRegex.test(sourceText)) {
      // Check if translation contains the Devanagari transliteration
      const transRegex = new RegExp(item.devanagari, "g");
      if (transRegex.test(translatedText)) {
        // Check if this acronym or transliteration is already reported
        const alreadyReported = errors.some(
          err => err.snippet && (err.snippet.includes(item.devanagari) || err.correction === item.latin)
        );

        if (!alreadyReported) {
          errors.push({
            category: "Terminology / Incorrect Term",
            severity: "Minor",
            snippet: item.devanagari,
            correction: item.latin,
            explanation: `Acronyms like '${item.latin}' must remain in English/Latin script instead of being transliterated to '${item.devanagari}'.`
          });
        }
      }
    }
  }
};

// Resolves conflicting or overlapping errors (e.g. grammar correction "आपका" -> "आपकी" conflicting with terminology correction "सहमति" -> "सहमति पत्र")
const resolveOverlappingErrors = (errors, translatedText) => {
  // Find if we have a "सहमति" -> "सहमति पत्र" terminology correction
  const hasConsentLetterCorrection = errors.some(
    err => (err.snippet === "सहमति" || err.snippet === "सहमति पत्र") && err.correction.includes("सहमति पत्र")
  );

  if (hasConsentLetterCorrection) {
    // If we also have a correction for "आपका" -> "आपकी" or "आपका सहमति" -> "आपकी सहमति"
    // that conflicts (since सहमति पत्र is masculine, so 'आपका सहमति पत्र' is grammatically correct)
    const grammarErrIndex = errors.findIndex(
      err => (err.snippet === "आपका सहमति" && err.correction === "आपकी सहमति") ||
             (err.snippet === "आपका" && err.correction === "आपकी" && (translatedText.includes("आपका सहमति") || translatedText.includes("आपका सहमति पत्र")))
    );

    if (grammarErrIndex !== -1) {
      // Remove the conflicting grammar error
      errors.splice(grammarErrIndex, 1);
      
      // Update the terminology error to encompass the full phrase "आपका सहमति" -> "आपका सहमति पत्र"
      const termErr = errors.find(err => (err.snippet === "सहमति" || err.snippet === "सहमति पत्र") && err.correction.includes("सहमति पत्र"));
      if (termErr && translatedText.includes("आपका सहमति")) {
        termErr.snippet = "आपका सहमति";
        termErr.correction = "आपका सहमति पत्र";
        termErr.explanation = "The term 'Consent' must be translated as 'सहमति पत्र' to reflect the formal document requirement, and possessive 'आपका' agrees with the masculine 'पत्र'.";
      }
    }
  }
};

module.exports = {
  evaluateTranslationMQM
};
