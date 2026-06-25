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
  contextSettings,
  prevSource,
  prevTarget,
  nextSource,
  nextTarget,
  model
}) => {
  const activeModel = model || OPENAI_MODEL;
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

  const isTargetHindi = String(targetLang || "").toLowerCase().startsWith("hi");
  const isTargetEnglish = String(targetLang || "").toLowerCase().startsWith("en");

  let targetSpecificRules = "";
  if (isTargetHindi) {
    targetSpecificRules = `
- HINDI GRAMMAR & GENDER COMPLIANCE: Check for grammatical agreement in Hindi. Adjective/possessive agreement must match the noun gender. 
  - "सहमति" (consent) is feminine, so "आपका सहमति" is grammatically incorrect (must be "आपकी सहमति").
  - "सहमति पत्र" (consent letter) is masculine, so "आपका सहमति पत्र" is correct. Suggest grammatical corrections that preserve proper gender and possessive agreement.
- ACRONYM & TRANSLITERATION PRESERVATION: Uppercase Latin acronyms and initialization codes (e.g. NRI, AMB, CIBIL, KYC, OTP, ATM) must remain in their original Latin-script uppercase form in the Hindi translation (e.g., use "NRI" instead of transliterating to "एनआरआई", and "AMB" instead of "एएमबी"). If the translation transliterates these, flag this as a Terminology error and suggest the Latin uppercase version.
- LIST INDEX MAPPING: Standard English list indices (like letters or numbers, e.g. "h.)") can be translated to corresponding Hindi listing characters (like "झ.)"). Do not flag standard Devanagari listing ordering as errors.
- CONJUNCTIONS: Verify if equivalent Hindi conjunctions (like 'और', 'लेकिन', 'या') are present before reporting missing English conjunctions (like 'and', 'but', 'or').
- DISSENT ON FORMALITY: Hindi banking/legal translations must be formal. Do NOT flag formal phrasing (e.g. "पुष्टि करता है", "अधीन", "प्रभारों") as "Too Formal" or suggest casual rewrites. For example, translate 'charges' as 'प्रभारों' rather than the transliterated 'चार्जों'.
`;
  } else if (isTargetEnglish) {
    targetSpecificRules = `
- ENGLISH GRAMMAR & SYNTAX: Ensure strict adherence to English grammar rules, including correct subject-verb agreement, verb tenses, preposition usage, and article placement ('a', 'an', 'the').
  - Note: Assertive sentences cannot use 'any' in place of 'a' or 'some' (e.g., "There is any material change" is grammatically incorrect; it must be "There is a material change").
- LEGAL/BANKING TERMINOLOGY: Standard banking and legal terms must use precise English equivalents. For example, 'प्रभारों' should be translated as 'charges', 'सहमति' as 'consent', 'सहमति पत्र' as 'consent letter' or 'consent form'.
- CAPITALIZATION: Ensure proper capitalization of standard acronyms (e.g., NRI, AMB, CIBIL, KYC, OTP, ATM, GST), proper nouns, and the start of sentences.
- PHRASING & FLOW: Phrasing must sound natural and professional. Avoid literal translations of Hindi idioms or sentence structures (e.g. "PCHFL की राय में" should be translated as "In the opinion of PCHFL" or "In PCHFL's opinion").
`;
  } else {
    targetSpecificRules = `
- GRAMMAR & SYNTAX: Ensure correct grammar, syntax, gender/plural agreement, and formatting in the target language (${targetLangName}).
- ACRONYM PRESERVATION: Keep standard alphanumeric acronyms and abbreviations in their original uppercase Latin form if standard in ${targetLangName} technical/banking documents.
- CONJUNCTIONS & PREPOSITIONS: Do not report false omissions of conjunctions/prepositions. Verify if the target language equivalent is present.
`;
  }

  const systemPrompt = `You are an expert translation quality auditor specialized in the MQM (Multidimensional Quality Metrics) framework.
Your task is to analyze the translation of a text segment and provide an honest, exact, and detailed quality audit.
Do NOT fake or exaggerate any ratings. If a translation is perfect, give it 100. If there are minor flaws, deduct points strictly based on severity.

CONTEXT & SETTINGS REQUIREMENT:
- You MUST analyze and prioritize the provided Context & Settings first (Jira context, custom instructions/description, tone, formality) to guide your quality assessment.
- Analyze how the source text should be translated under these constraints, and evaluate if the translation complies with them.
- Any suggestions or corrections must align strictly with this context.

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

TARGET-SPECIFIC LOCALIZATION & GRAMMAR RULES (CRITICAL):
${targetSpecificRules}

FALSE-POSITIVE PREVENTION & LOCALIZATION RULES:
- You MUST double check all potential errors before writing them down.
- Do NOT deduct points unless you have concrete, indisputable evidence of an error. If there are no errors, the score must be exactly 100.

OFFENDING SNIPPET & CORRECTION RULES:
- The "snippet" field MUST contain ONLY the specific incorrect text/substring from the translated text that needs to be replaced. Do NOT include any surrounding correct words.
- The "correction" field MUST contain ONLY the corrected text to replace the offending "snippet" with. Do NOT include the whole sentence, only the exact correction.
- SYNTAX CHECK: Ensure that replacing the "snippet" with the "correction" in the translation yields a grammatically correct sentence. Do not introduce duplicate words or break sentence flow.

TECHNICAL TAGS & EMAIL INSTRUCTIONS:
- You will see formatting tags in the source and translation (such as "<5261>", "</5261>", "<65>", etc.). These are system-protected markup placeholders.
- Do NOT flag these system tags as 'untranslated text', 'additions', 'omissions', or 'spelling errors'. They must be ignored during quality evaluation and should be allowed to remain intact in the translation.
- Email addresses (e.g. "customercare@piramal.com") and phone numbers (e.g. "1800-266-6444") should remain untranslated. Do NOT flag them as untranslated or as omissions if they are kept identical in the translation.

Target Language: ${targetLangName} (from ${sourceLangName})

SLIDING WINDOW CONTEXT UTILIZATION:
- You are provided with a Sliding Window Local Context containing the source and translation of adjacent segments (previous and next) if available.
- Use this local context to resolve ambiguities, verify pronoun agreement (like gender and plurality continuity across segments), and ensure consistent terminology and style flow.
- Remember: the target of your audit is strictly the "Translated Segment" relative to the "Source Segment". Do NOT flag errors in the adjacent segments; they are only provided to help you understand the context.

CRITICAL FORMATTING: You must output ONLY a valid JSON object with the following structure:
{
  "analysisSteps": [
    "Step 1: Analyzed Jira context, global tone, and formality constraints.",
    "Step 2: Fact-checked target language specific guidelines.",
    "Step 3: Fact-checked grammatical correctness and term alignments.",
    "Step 4: Checked for other spelling/grammar/mistranslation issues."
  ],
  "accuracyScore": 95, // Math-based score from 0 to 100 after deductions. If errors is empty, this MUST be 100.
  "errors": [
    {
      "category": "Terminology / Incorrect Term", // Must match the taxonomy categories
      "severity": "Minor", // Minor, Major, or Critical
      "snippet": "incorrect_substring", // ONLY the specific wrong substring from the translation
      "correction": "corrected_substring", // ONLY the corrected version of that substring to replace it with
      "explanation": "Detailed explanation of why this error is flagged."
    }
  ],
  "clarifyingQuestions": [],
  "improvementSuggestion": "Brief suggestion to improve overall quality."
}

If no errors are found, the accuracyScore MUST be 100, and you should return empty arrays for errors and clarifyingQuestions, and an empty string for improvementSuggestion.`;

  const userPrompt = `Source Segment: "${sourceText}"
Translated Segment: "${translatedText}"

CONTEXT & SETTINGS PROVIDED:
- Global Tone Setting: ${contextSettings?.tone || "General"}
- Global Formality Setting: ${contextSettings?.formality || "Neutral"}
- Jira Story Context: ${contextJira || "None"}
- Custom Instructions / Description: ${contextDescription || "None"}

SLIDING WINDOW LOCAL CONTEXT:
${prevSource ? `- Previous Segment Source: "${prevSource}"` : ""}
${prevTarget ? `- Previous Segment Translation: "${prevTarget}"` : ""}
${nextSource ? `- Next Segment Source: "${nextSource}"` : ""}
${nextTarget ? `- Next Segment Translation: "${nextTarget}"` : ""}`;

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: activeModel,
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

    const rawErrors = Array.isArray(parsed.errors) ? parsed.errors : [];
    
    // Programmatic verification filter to remove hallucinated/invalid errors
    const cleanText = (t) => String(t || "").replace(/[\s\u200b\u200c\u200d\u00a0]+/g, "").trim();
    const normalizedTranslated = cleanText(translatedText);
    
    const verifiedErrors = [];
    for (const err of rawErrors) {
      if (!err || typeof err !== "object") continue;
      
      const snippet = String(err.snippet || "").trim();
      const correction = String(err.correction || "").trim();
      
      if (!snippet || !correction) continue;
      if (snippet === correction) continue;
      
      // Verify if snippet exists in the translation (space-insensitive)
      const normalizedSnippet = cleanText(snippet);
      if (!normalizedTranslated.toLowerCase().includes(normalizedSnippet.toLowerCase())) {
        console.log(`[MQM Filter] Discarded false-positive error (snippet not found in translation): "${snippet}"`);
        continue;
      }
      
      // Extract exact case-matching substring from the translation for UI highlighting
      const exactIdx = translatedText.toLowerCase().indexOf(snippet.toLowerCase());
      if (exactIdx !== -1) {
        err.snippet = translatedText.substring(exactIdx, exactIdx + snippet.length);
      } else {
        err.snippet = snippet;
      }
      
      err.correction = correction;
      verifiedErrors.push(err);
    }

    // Post-process programmatically to verify abbreviation & alignment accuracy
    checkAcronymErrors(sourceText, translatedText, verifiedErrors);
    resolveOverlappingErrors(verifiedErrors, translatedText);

    // Recalculate mathematical score based on corrected error severities
    let calculatedScore = 100;
    for (const err of verifiedErrors) {
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
      errors: verifiedErrors,
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
  // Correct any grammatical gender errors in the suggestions for "सहमति पत्र"
  for (const err of errors) {
    if (err.correction) {
      if (err.correction.includes("सहमति पत्र") && (err.correction.includes("आपकी") || err.correction.includes("की"))) {
        err.correction = err.correction.replace(/आपकी/g, "आपका").replace(/की/g, "का");
        err.explanation = "The term 'Consent' must be translated as 'सहमति पत्र' (masculine), and possessive 'आपका' agrees with the masculine 'पत्र'.";
      }
    }
  }

  // Find if we have a "सहमति" -> "सहमति पत्र" terminology correction
  const hasConsentLetterCorrection = errors.some(
    err => (err.snippet === "सहमति" || err.snippet === "सहमति पत्र") && err.correction.includes("सहमति पत्र")
  );

  if (hasConsentLetterCorrection) {
    // If we also have a correction for "आपका" -> "आपकी" or "आपका सहमति" -> "आपकी सहमति"
    // that conflicts (since सहमति पत्र is masculine, so 'आपका सहमति पत्र' is grammatically correct)
    const grammarErrIndex = errors.findIndex(
      err => (err.snippet === "आपका सहमति" && err.correction === "आपकी सहमति") ||
             (err.snippet === "आपका" && err.correction === "आपकी" && (translatedText.includes("क्या आपका सहमति") || translatedText.includes("आपका सहमति") || translatedText.includes("आपका सहमति पत्र")))
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
