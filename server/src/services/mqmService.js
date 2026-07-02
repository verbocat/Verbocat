const axios = require("axios");
const crypto = require("crypto");
const pLimitModule = require("p-limit");
const pLimit = pLimitModule.default || pLimitModule;
const { supabase } = require("../config/supabase");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MQM_PROMPT_VERSION = "v1.0.0";
const MQM_SCHEMA_VERSION = "v1.0.0";

const SEVERITY_WEIGHT = { minor: 1, major: 5, critical: 25 };

// Segment-level scoring: zero-out applies if a verified critical error exists
function computeSegmentMQMScore(errors, wordCount) {
  if (errors.some(e => e.severity === "critical")) return 0;
  const penalty = errors.reduce((sum, e) => sum + SEVERITY_WEIGHT[e.severity], 0);
  return Math.max(0, Math.round(100 - (penalty / wordCount) * 100));
}

// Document-level scoring: pure weighted average (no zero-out short-circuit)
function computeDocumentMQMScore(allErrors, totalWordCount) {
  const penalty = allErrors.reduce((sum, e) => sum + SEVERITY_WEIGHT[e.severity], 0);
  return Math.max(0, Math.round(100 - (penalty / totalWordCount) * 100));
}

function calculateMqmHash(source, target, glossaryVersion = "v1", promptVersion = MQM_PROMPT_VERSION) {
  return crypto
    .createHash("md5")
    .update(`${source}|||${target}|||${glossaryVersion}|||${promptVersion}`)
    .digest("hex");
}

const getLangName = (code) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
  } catch (e) {
    return code;
  }
};

const getTargetSpecificRules = (targetLang, sourceLang, contextSettings = null) => {
  const targetLangName = getLangName(targetLang);
  const tone = contextSettings?.tone || "General";
  const formality = contextSettings?.formality || "Neutral";
  const domain = contextSettings?.domain || "General";

  let domainGuidelines = "";
  const lowerDomain = domain.toLowerCase();
  if (lowerDomain.includes("legal") || lowerDomain.includes("contract") || lowerDomain.includes("agreement")) {
    domainGuidelines = `
- LEGAL DOMAIN CONSTRAINTS (STRICT):
  * Do NOT recommend replacing established, legally precise translations with colloquial or generic terms.
  * For example, "to the extent of conflict" must be translated as "संघर्ष की सीमा तक" (exact scope of conflict), NOT generalized to "संघर्ष के मामले में" (in case of conflict).
  * "Invocation" in lien/securities context means enforcement/calling-upon, translated as "प्रवर्तन" or "आह्वान", NOT "आवेदन" (application).
  * Do NOT change precise legal terms like "successors and permitted assigns" unless they are grammatically incorrect.
`;
  } else if (lowerDomain.includes("banking") || lowerDomain.includes("finance") || lowerDomain.includes("financial")) {
    domainGuidelines = `
- FINANCIAL & BANKING DOMAIN CONSTRAINTS (STRICT):
  * "Drawing Power" is a standard banking term referring to the borrowing limit based on collateral. It must remain "ड्राइंग पावर" or "आहरण सीमा", NOT translated literally to general terms like "उपयोग की शक्ति".
  * "At actuals" refers to the actual expenses incurred (वास्तविक लागत / वास्तविक व्यय के अनुसार), NOT the value of the asset (वास्तविक मूल्य).
  * "Ad valorem duty" is a legal tax based on value, translated as "मूल्यानुसार शुल्क" or "एड वैलोरम ड्यूटी", NOT generic "शुल्क".
  * Do NOT replace industry-standard English/loan terms that are commonly used in Hindi banking documents (e.g. "Key Facts Statement", "ROC", "CIBIL") unless requested.
`;
  }

  return `
- TARGET GRAMMAR & COMPLIANCE: Ensure the translation is grammatically correct, matches correct gender/number agreements, uses proper punctuation (such as full stops or language-specific sentence terminators like purna-viram in Hindi), and respects syntax rules native to the ${targetLangName} language.
- TONE & FORMALITY COMPLIANCE: The translation must adhere strictly to a ${formality} level of formality and ${tone} tone suitable for the ${domain} domain.
- CAPITALIZATION & ACRONYMS: Ensure standard acronyms and names are capitalized and formatted appropriately based on ${targetLangName} professional conventions.
- ANTI-HALLUCINATION & LEGAL PRECISION: Do NOT suggest stylistic changes that weaken legal precision, technical accuracy, or domain terminology. Do NOT flag standard list indices or numbers as errors.
${domainGuidelines}
`;
};

const getGlossaryRules = (sourceText, glossary) => {
  if (!glossary || !Array.isArray(glossary) || glossary.length === 0) return "";
  const matches = [];
  for (const entry of glossary) {
    if (!entry.source || !entry.target) continue;
    const escaped = entry.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isLatin = /^[A-Za-z0-9\s]+$/.test(entry.source);
    const regex = isLatin ? new RegExp(`\\b${escaped}\\b`, "i") : new RegExp(escaped, "i");
    if (regex.test(sourceText)) {
      matches.push(entry);
    }
  }
  if (matches.length === 0) return "";
  return `
- TERMINOLOGY & GLOSSARY COMPLIANCE (STRICT): The following approved term mappings MUST be adhered to. Any deviation (e.g., using a different synonym or transliterating when it should remain in Latin) must be flagged as a 'terminology' error:
${matches.map(m => `  * Source term: "${m.source}" -> Approved Target term: "${m.target}"`).join("\n")}
`;
};

// ── Pass 1 Error Detection Prompt ────────────────────────────────────
const getGlobalContextStr = (globalReport, segmentIndex) => {
  if (!globalReport || segmentIndex === null) return "";

  const majorErrorsForSeg = (globalReport.majorErrors || []).filter(e => e.segmentIndex === segmentIndex);
  const inconsistenciesForSeg = (globalReport.inconsistencies || []).filter(inc =>
    inc.variants.some(v => v.segmentIndex === segmentIndex)
  );

  let majorErrorsPrompt = "";
  if (majorErrorsForSeg.length > 0) {
    majorErrorsPrompt = "\n- POTENTIAL MAJOR/CRITICAL ERRORS FOUND IN GLOBAL SCAN FOR THIS SEGMENT (RE-VERIFICATION REQUIRED):\n  Re-verify each of these potential errors. If they are genuine, confirm them. If they are false positives, do NOT flag them.\n" +
      majorErrorsForSeg.map(e => "  * Span \"" + e.span + "\" -> Correction \"" + e.correction + "\". Reason: " + e.comment).join("\n") + "\n";
  }

  let inconsistenciesPrompt = "";
  if (inconsistenciesForSeg.length > 0) {
    inconsistenciesPrompt = "\n- POTENTIAL TERMINOLOGY INCONSISTENCIES FOR THIS SEGMENT:\n  The global scan detected inconsistent translation of terms. Check if the translation in this segment uses an incorrect variant. If so, flag it as a 'terminology' error and suggest the recommended translation.\n" +
      inconsistenciesForSeg.map(inc => "  * Source term: \"" + inc.sourceTerm + "\" (Recommended translation: \"" + inc.recommendedTranslation + "\")\n    Offending variants/segments:\n" +
        inc.variants.map(v => "      - Segment " + v.segmentIndex + ": \"" + v.targetTranslation + "\"").join("\n")).join("\n") + "\n";
  }

  return "\n- GLOBAL DOCUMENT CONTEXT:\n  * Domain: " + (globalReport.detectedDomain || "General") + "\n  * Tone/Formality: " + (globalReport.detectedToneFormality || "Neutral") + "\n" + majorErrorsPrompt + inconsistenciesPrompt;
};

const getPass1SystemPrompt = (targetLangName, sourceLangName, targetSpecificRules, glossaryRules, visualRules, globalReport = null, segmentIndex = null) => {
  const globalContextStr = getGlobalContextStr(globalReport, segmentIndex);
  return `You are an expert translation quality auditor specialized in the MQM (Multidimensional Quality Metrics) framework.
Your task is to analyze the translation of a text segment and detect errors.

MQM ERROR TAXONOMY (Core):
- accuracy: Addition (extra words changing meaning), Omission (key information left out), Mistranslation (incorrect meaning), Untranslated (words left in source language).
- fluency: Grammar (syntax, gender agreement, conjugation), Spelling (typos), Punctuation.
- terminology: Incorrect term, inconsistent term.
- style: Too formal, too informal, awkward phrasing.
- locale: Violation of local conventions (dates, numbers, formats).

SEVERITY LEVEL DEFINITIONS:
- minor: Limited impact. Does not block understanding or change critical meaning.
- major: Seriously affects meaning or usability.
- critical: Unfit for purpose. Introduces safety, legal, financial, or reputational risks.

WORKED EXAMPLES (Language-Agnostic):

Example 1:
Source: "Your session has expired."
Target: "Tu sesión ha expirado"
Errors: []

Example 2:
Source: "Please verify your account details."
Target: "Por favor verifique detalles de cuenta"
Errors: [
  {
    "span": "detalles de cuenta",
    "correction": "los detalles de su cuenta",
    "category": "fluency",
    "severity": "minor",
    "comment": "Grammar error: missing article before 'detalles'"
  }
]

Example 3:
Source: "The company shall not be liable for any indirect or consequential damages."
Target: "Die Firma haftet nicht für direkte Schäden."
Errors: [
  {
    "span": "direkte Schäden",
    "correction": "indirekte oder Folgeschäden",
    "category": "accuracy",
    "severity": "critical",
    "comment": "Critical mistranslation: 'indirect/consequential' was translated as 'direct' (direkte), reversing the legal liability."
  }
]

TARGET-SPECIFIC LOCALIZATION & GRAMMAR RULES (CRITICAL):
${targetSpecificRules}
${glossaryRules}
${visualRules}
${globalContextStr}

SLIDING WINDOW LOCAL CONTEXT & COHERENCE DIRECTIVE (CRITICAL):
- You are provided with a sliding window of local context (Previous Segment and Next Segment sources/translations) in the user prompt.
- CONTINUATION CHECK: If the previous segment ends with a colon (":"), a comma (","), a conjunction, or is a conditional statement (e.g., "यदि", "if", "provided that"), the current segment is a grammatical continuation of the previous segment. Evaluate its grammar, tense, and verb form as a continuation. Do NOT flag a verb tense/form (like 'होता है' or 'हो जाएगी' in Hindi) as an error if it makes perfect grammatical sense as a sub-clause of the previous segment.
- TERMINOLOGY & COHERENCE CHECK: Use adjacent segments to resolve ambiguous terms. For example, if the source term is "Term of Loan" and the next segment mentions a duration (like "36 months" / "36 महीने"), the correct translation of "Term" is "tenure/duration" (e.g., "अवधि" in Hindi). Do NOT flag "अवधि" as an error or suggest changing it to a legal condition term (like "शर्त").

TECHNICAL MARKS & SYSTEM RULES:
- Ignore system-protected protected tags like "<5261>", "</5261>" or place-holders. Do NOT flag them as untranslated or spelling errors.
- Email addresses and phone numbers should remain untranslated; do not flag them.
- SUGGESTED CORRECTION REQUIREMENTS: For every error, you MUST provide a valid, grammatically correct replacement in the 'correction' field. The correction MUST be different from the offending 'span' and resolve the error (e.g., if 'span' is 'का अस्वीकृति', the 'correction' should be 'की अस्वीकृति'). Do NOT copy the offending span verbatim into the correction field.

Target Language: ${targetLangName} (from ${sourceLangName})`;
};

// ── Pass 2 & 3 Prompts for Verification ──────────────────────────────
const getPass2SystemPrompt = (targetLangName, sourceLangName, targetSpecificRules = "", globalReport = null, segmentIndex = null) => {
  const globalContextStr = getGlobalContextStr(globalReport, segmentIndex);
  return `You are a professional translator and proofreader.
Your task is to take a translation, review the flagged errors, and output a single, corrected version of the translation text (post-edited text) that fixes all valid flagged errors. Keep the rest of the translation unchanged. Do not introduce new errors.

TARGET-SPECIFIC LOCALIZATION & GRAMMAR RULES (CRITICAL):
${targetSpecificRules}
${globalContextStr}

Target Language: ${targetLangName} (from ${sourceLangName})`;
};

const getPass3SystemPrompt = (targetLangName, sourceLangName, targetSpecificRules = "", globalReport = null, segmentIndex = null) => {
  const globalContextStr = getGlobalContextStr(globalReport, segmentIndex);
  return `You are a translation quality assurance judge.
You will be shown:
1. The original source text.
2. The original translation.
3. A post-edited translation that attempts to fix flagged errors.
4. A list of flagged errors.

For each flagged error, compare the original translation with the post-edited translation and the source text.
Decide if the original text at that span had a genuine error that was correctly resolved in the post-edited translation.

Reject rules (very important):
- Reject any error flags that are false positive noise.
- Reject corrections that introduce colloquial or generic wording in place of legally precise translations (e.g. "संघर्ष की सीमा तक" is legally accurate and should NOT be replaced with generic "संघर्ष के मामले में").
- Reject corrections that attempt to literally translate established banking/financial terms (e.g., "Drawing Power" must remain "ड्राइंग पावर" or "आहरण सीमा", reject any change to "उपयोग की शक्ति"; "actuals" must remain "वास्तविक लागत/व्यय", reject any change to "वास्तविक मूल्य").
- Reject grammatical nits or verb form changes that are actually correct when read in continuation with the previous segment.
${globalContextStr}

Output "accept" if it was a genuine error that is correctly fixed.
Output "reject" if the original translation was correct, acceptable, or preferred.

Target Language: ${targetLangName} (from ${sourceLangName})`;
};

// ── Schemas for OpenAI Strict Mode ───────────────────────────────────
const mqmSchema = {
  name: "mqm_errors",
  strict: true,
  schema: {
    type: "object",
    properties: {
      errors: {
        type: "array",
        items: {
          type: "object",
          properties: {
            span: { type: "string", description: "Exact substring from the target text containing the error" },
            correction: { type: "string", description: "The suggested corrected text that should replace the offending span" },
            category: { type: "string", enum: ["accuracy", "fluency", "terminology", "style", "locale"] },
            severity: { type: "string", enum: ["minor", "major", "critical"] },
            comment: { type: "string", description: "Reason why this is an error" }
          },
          required: ["span", "correction", "category", "severity", "comment"],
          additionalProperties: false
        }
      }
    },
    required: ["errors"],
    additionalProperties: false
  }
};

const postEditSchema = {
  name: "post_edit",
  strict: true,
  schema: {
    type: "object",
    properties: {
      postEditedText: { type: "string", description: "The full target text after applying corrections for all flagged errors" }
    },
    required: ["postEditedText"],
    additionalProperties: false
  }
};

const verdictsSchema = {
  name: "verdicts",
  strict: true,
  schema: {
    type: "object",
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            span: { type: "string", description: "The span corresponding to the error being evaluated" },
            verdict: { type: "string", enum: ["accept", "reject"], description: "Whether the flagged error is genuine (accept) or false positive noise (reject)" },
            rationale: { type: "string", description: "Explanation for the verdict" }
          },
          required: ["span", "verdict", "rationale"],
          additionalProperties: false
        }
      }
    },
    required: ["verdicts"],
    additionalProperties: false
  }
};

// ── OpenAI Calling Helper with 1 retry ───────────────────────────────
const callOpenAI = async (messages, responseFormat, retries = 1) => {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OpenAI API Key");
  }
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: OPENAI_MODEL,
        messages,
        temperature: 0,
        response_format: responseFormat
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 45000
      }
    );
    const content = response.data?.choices?.[0]?.message?.content;
    return JSON.parse(content);
  } catch (err) {
    if (retries > 0) {
      console.warn(`[MQM OpenAI API Call] Failed, retrying once... Error: ${err.message}`);
      return callOpenAI(messages, responseFormat, retries - 1);
    }
    throw err;
  }
};

/**
 * Programmatic check: Discard any flagged errors where the span does not appear verbatim in target.
 * We do a case-insensitive check and extract the exact-case substring for highlight support.
 */
const verifyAndSanitizeSpans = (errors, targetText) => {
  const verified = [];
  const cleanText = (t) => String(t || "").replace(/[\s\u200b\u200c\u200d\u00a0\.\,\?\"\'\।]+/g, "").trim().toLowerCase();
  const normalizedTarget = cleanText(targetText);

  for (const err of errors) {
    if (!err || typeof err !== "object") continue;
    const span = String(err.span || "").trim();
    if (!span) continue;

    // 1. Verbatim case-insensitive substring check
    const idx = targetText.toLowerCase().indexOf(span.toLowerCase());
    if (idx !== -1) {
      err.span = targetText.substring(idx, idx + span.length);
      verified.push(err);
      continue;
    }

    // 2. Fuzzy spaces/punctuation matching check
    const normalizedSpan = cleanText(span);
    if (normalizedSpan && normalizedTarget.includes(normalizedSpan)) {
      const words = span.split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        const firstWord = words[0].toLowerCase();
        const lastWord = words[words.length - 1].toLowerCase();
        const firstIdx = targetText.toLowerCase().indexOf(firstWord);
        const lastIdx = targetText.toLowerCase().lastIndexOf(lastWord);
        if (firstIdx !== -1 && lastIdx !== -1 && lastIdx >= firstIdx) {
          err.span = targetText.substring(firstIdx, lastIdx + lastWord.length);
          verified.push(err);
          continue;
        }
      }
    }

    console.log(`[MQM Filter] Discarded hallucinated error span (not found in target text): "${span}"`);
  }
  return verified;
};

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
  isFullAudit = false,
  documentId = null,
  glossaryVersion = "v1",
  onCriticalEscalate = null,
  screenshotBuffer = null,
  screenshotMimeType = null,
  globalReport = null,
  segmentIndex = null
}) => {
  if (!OPENAI_API_KEY) {
    return {
      accuracyScore: 100,
      errors: [],
      clarifyingQuestions: [],
      improvementSuggestion: "",
      promptVersion: MQM_PROMPT_VERSION,
      schemaVersion: MQM_SCHEMA_VERSION
    };
  }

  // 1. Caching Check (Bypassed database caching to force fresh evaluation every time)
  const hash = calculateMqmHash(sourceText, translatedText, glossaryVersion, MQM_PROMPT_VERSION);

  const sourceLangName = getLangName(sourceLang);
  const targetLangName = getLangName(targetLang);
  const targetSpecificRules = getTargetSpecificRules(targetLang, sourceLang, contextSettings);
  const glossaryRules = getGlossaryRules(sourceText, contextSettings?.glossary);

  let visualRules = "";
  if (screenshotBuffer) {
    visualRules = `
- VISUAL & LAYOUT INSPECTION: Inspect the provided screenshot of the segment context. Check for:
  * Truncation: Is the translated text cut off or overlapping other elements?
  * Visual Fit: Is the text too long or short for the button/card/column?
  * Visual Context: Does the translation match the visual meaning (e.g. is 'Home' translated as 'मुख्य पृष्ठ' (page) or 'घर' (building) contextually)?
  If there is a visual layout issue, flag it as a 'locale' or 'style' error.
`;
  }

  const wordCount = Math.max(1, sourceText.trim().split(/\s+/).filter(Boolean).length);

  try {
    // ── Pass 1: Error Detection ──
    const pass1Sys = getPass1SystemPrompt(targetLangName, sourceLangName, targetSpecificRules, glossaryRules, visualRules, globalReport, segmentIndex);
    const pass1User = `Source Segment: "${sourceText}"
Translated Segment: "${translatedText}"

CONTEXT & SETTINGS:
- Global Tone: ${contextSettings?.tone || "General"}
- Global Formality: ${contextSettings?.formality || "Neutral"}
- Jira Story: ${contextJira || "None"}
- Instructions: ${contextDescription || "None"}

SLIDING WINDOW LOCAL CONTEXT:
${prevSource ? `- Previous Source: "${prevSource}"` : ""}
${prevTarget ? `- Previous Translation: "${prevTarget}"` : ""}
${nextSource ? `- Next Source: "${nextSource}"` : ""}
${nextTarget ? `- Next Translation: "${nextTarget}"` : ""}`;

    const userContent = [
      { type: "text", text: pass1User }
    ];
    if (screenshotBuffer) {
      const mime = screenshotMimeType || "image/png";
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${mime};base64,${screenshotBuffer.toString("base64")}`
        }
      });
    }

    const pass1Result = await callOpenAI(
      [
        { role: "system", content: pass1Sys },
        { role: "user", content: userContent }
      ],
      { type: "json_schema", json_schema: mqmSchema }
    );

    let detectedErrors = pass1Result.errors || [];
    detectedErrors = verifyAndSanitizeSpans(detectedErrors, translatedText);

    // Run custom rule corrections if target specific functions are defined
    if (typeof checkAcronymErrors === "function") {
      checkAcronymErrors(sourceText, translatedText, detectedErrors);
    }
    if (typeof resolveOverlappingErrors === "function") {
      resolveOverlappingErrors(detectedErrors, translatedText);
    }

    const hasCritical = detectedErrors.some(e => e.severity === "critical");
    const runSelfCheck = isFullAudit || hasCritical;

    // Trigger intermediate report if critical is flagged (Manual Edit only)
    if (hasCritical && onCriticalEscalate) {
      const nonCriticalErrors = detectedErrors.filter(e => e.severity !== "critical");
      const intermediateScore = computeSegmentMQMScore(nonCriticalErrors, wordCount);
      const intermediateReport = {
        accuracyScore: intermediateScore,
        errors: detectedErrors.map(e => ({
          category: e.category,
          severity: e.severity,
          snippet: e.span,
          correction: e.correction || "",
          explanation: e.comment || "",
          verifying: e.severity === "critical"
        })),
        clarifyingQuestions: [],
        improvementSuggestion: "Verifying critical errors...",
        hash,
        promptVersion: MQM_PROMPT_VERSION,
        schemaVersion: MQM_SCHEMA_VERSION,
        isEscalating: true
      };

      onCriticalEscalate(intermediateReport).catch(err => {
        console.error("[MQM critical escalation callback error]:", err.message);
      });
    }

    let finalErrors = detectedErrors;

    // ── 3-Pass Self-Check Escalation ──
    if (runSelfCheck && detectedErrors.length > 0) {
      console.log(`[MQM Escalation] Running 3-Pass Self-Check for: "${sourceText.substring(0, 35)}..." (isFullAudit: ${isFullAudit}, hasCritical: ${hasCritical})`);
      
      // Pass 2: Post-Edited Clean String
      const pass2Sys = getPass2SystemPrompt(targetLangName, sourceLangName, targetSpecificRules, globalReport, segmentIndex);
      const pass2User = `Source Segment: "${sourceText}"
Original Translation: "${translatedText}"
Flagged Errors:
${JSON.stringify(detectedErrors, null, 2)}

SLIDING WINDOW LOCAL CONTEXT:
${prevSource ? `- Previous Source: "${prevSource}"` : ""}
${prevTarget ? `- Previous Translation: "${prevTarget}"` : ""}
${nextSource ? `- Next Source: "${nextSource}"` : ""}
${nextTarget ? `- Next Translation: "${nextTarget}"` : ""}

Please output the corrected version of the translation text (postEditedText) fixing these errors.`;

      const pass2Result = await callOpenAI(
        [
          { role: "system", content: pass2Sys },
          { role: "user", content: pass2User }
        ],
        { type: "json_schema", json_schema: postEditSchema }
      );

      const postEditedText = pass2Result.postEditedText || translatedText;

      // Pass 3: Verdict Comparison
      const pass3Sys = getPass3SystemPrompt(targetLangName, sourceLangName, targetSpecificRules, globalReport, segmentIndex);
      const pass3User = `Source Segment: "${sourceText}"
Original Translation: "${translatedText}"
Post-Edited Translation: "${postEditedText}"
Flagged Errors:
${JSON.stringify(detectedErrors, null, 2)}

SLIDING WINDOW LOCAL CONTEXT:
${prevSource ? `- Previous Source: "${prevSource}"` : ""}
${prevTarget ? `- Previous Translation: "${prevTarget}"` : ""}
${nextSource ? `- Next Source: "${nextSource}"` : ""}
${nextTarget ? `- Next Translation: "${nextTarget}"` : ""}

For each flagged error, evaluate whether the error is genuine (accept) or false positive noise (reject).`;

      const pass3Result = await callOpenAI(
        [
          { role: "system", content: pass3Sys },
          { role: "user", content: pass3User }
        ],
        { type: "json_schema", json_schema: verdictsSchema }
      );

      const verdicts = pass3Result.verdicts || [];

      // Filter only accepted errors
      finalErrors = detectedErrors.filter(err => {
        const matchingVerdict = verdicts.find(v => String(v.span).toLowerCase() === String(err.span).toLowerCase());
        const accepted = matchingVerdict ? matchingVerdict.verdict === "accept" : true; // Default accept if missing
        if (!accepted) {
          console.log(`[MQM Self-Check] Rejected false-positive error: "${err.span}" (Rationale: ${matchingVerdict?.rationale || "None"})`);
        }
        return accepted;
      });
    }

    const accuracyScore = computeSegmentMQMScore(finalErrors, wordCount);

    const report = {
      accuracyScore,
      errors: finalErrors.map(e => ({
        category: e.category,
        severity: e.severity,
        snippet: e.span,
        correction: e.correction || "",
        explanation: e.comment || ""
      })),
      clarifyingQuestions: [],
      improvementSuggestion: finalErrors.length > 0 
        ? `ISSUES DETECTED BY MQM AUDIT:\n` + finalErrors.map(e => 
            `[${e.severity}] ${e.category}\n${e.comment || e.explanation || ""}\n- Replace:\n"${e.span}"\n+ With:\n"${e.correction || ""}"`
          ).join("\n\n")
        : "",
      hash,
      promptVersion: MQM_PROMPT_VERSION,
      schemaVersion: MQM_SCHEMA_VERSION
    };

    return report;

  } catch (error) {
    console.error(`[MQM Evaluation Failed] error:`, error.message);
    return {
      evaluationFailed: true,
      accuracyScore: 100,
      errors: [],
      clarifyingQuestions: [],
      improvementSuggestion: "",
      hash,
      promptVersion: MQM_PROMPT_VERSION,
      schemaVersion: MQM_SCHEMA_VERSION
    };
  }
};

/**
 * Batch Pass 1 Error Detection for 5-10 sequential segments.
 * Reduces token overhead. Returns detected errors grouped by segment index.
 */
const evaluateBatchPass1 = async ({
  segments,
  targetLang,
  sourceLang,
  contextSettings,
  globalReport = null
}) => {
  const sourceLangName = getLangName(sourceLang);
  const targetLangName = getLangName(targetLang);
  const targetSpecificRules = getTargetSpecificRules(targetLang, sourceLang, contextSettings);

  // Match glossary terms for all segments in batch
  let glossaryRules = "";
  if (contextSettings?.glossary && Array.isArray(contextSettings.glossary) && contextSettings.glossary.length > 0) {
    const matchedEntries = [];
    for (const seg of segments) {
      for (const entry of contextSettings.glossary) {
        if (!entry.source || !entry.target) continue;
        const escaped = entry.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const isLatin = /^[A-Za-z0-9\s]+$/.test(entry.source);
        const regex = isLatin ? new RegExp(`\\b${escaped}\\b`, "i") : new RegExp(escaped, "i");
        if (regex.test(seg.source_text)) {
          if (!matchedEntries.some(m => m.source === entry.source)) {
            matchedEntries.push(entry);
          }
        }
      }
    }
    if (matchedEntries.length > 0) {
      glossaryRules = `
- TERMINOLOGY & GLOSSARY COMPLIANCE (STRICT): The following approved term mappings MUST be adhered to. Any deviation (e.g., using a different synonym or transliterating when it should remain in Latin) must be flagged as a 'terminology' error:
${matchedEntries.map(m => `  * Source term: "${m.source}" -> Approved Target term: "${m.target}"`).join("\n")}
`;
    }
  }

  let globalContextStr = "";
  if (globalReport) {
    const majorErrorsInBatch = (globalReport.majorErrors || []).filter(e => 
      segments.some(seg => seg.segment_index === e.segmentIndex)
    );
    const inconsistenciesInBatch = (globalReport.inconsistencies || []).filter(inc =>
      inc.variants.some(v => segments.some(seg => seg.segment_index === v.segmentIndex))
    );

    let majorErrorsPrompt = "";
    if (majorErrorsInBatch.length > 0) {
      majorErrorsPrompt = "\n- FLAGGED MAJOR/CRITICAL ERRORS IN THIS BATCH (RE-VERIFICATION REQUIRED):\n  The global scan detected these potential major/critical errors in this batch. Re-verify each of them carefully. If they are genuine, include them in the errors output. If they are false positives, do not output them.\n" +
        majorErrorsInBatch.map(e => "  * Segment " + e.segmentIndex + ": Span \"" + e.span + "\" -> Correction \"" + e.correction + "\". Reason: " + e.comment).join("\n") + "\n";
    }

    let inconsistenciesPrompt = "";
    if (inconsistenciesInBatch.length > 0) {
      inconsistenciesPrompt = "\n- FLAGGED TERMINOLOGY INCONSISTENCIES:\n  The global scan detected inconsistent translation of terms across segments. If the segment has an incorrect variant, flag it as a 'terminology' error:\n" +
        inconsistenciesInBatch.map(inc => "  * Source term: \"" + inc.sourceTerm + "\" (Recommended translation: \"" + inc.recommendedTranslation + "\")\n    Offending segments/variants:\n" +
          inc.variants.map(v => "      - Segment " + v.segmentIndex + ": \"" + v.targetTranslation + "\"").join("\n")).join("\n") + "\n";
    }

    globalContextStr = "\n- GLOBAL DOCUMENT CONTEXT:\n  * Domain: " + (globalReport.detectedDomain || "General") + "\n  * Tone/Formality: " + (globalReport.detectedToneFormality || "Neutral") + "\n" + majorErrorsPrompt + inconsistenciesPrompt;
  }

  const sysPrompt = `You are an expert translation quality auditor specialized in the MQM (Multidimensional Quality Metrics) framework.
Your task is to analyze the translation of multiple sequential text segments and detect errors.

MQM ERROR TAXONOMY (Core):
- accuracy: Addition, Omission, Mistranslation, Untranslated.
- fluency: Grammar, Spelling, Punctuation.
- terminology: Incorrect term, inconsistent term.
- style: Too formal, too informal, awkward phrasing.
- locale: Date, number, or format conventions.

SEVERITY LEVEL DEFINITIONS:
- minor: Limited impact. Doesn't block understanding.
- major: Seriously affects meaning or usability.
- critical: Unfit for purpose. Safety, legal, financial, or reputational risks.

WORKED EXAMPLES (Language-Agnostic):
Example 1:
Segment Index: 0
Source: "Your session has expired."
Target: "Tu sesión ha expirado"
Errors: []

Example 2:
Segment Index: 1
Source: "Please verify your account details."
Target: "Por favor verifique detalles de cuenta"
Errors: [
  {
    "segmentIndex": 1,
    "span": "detalles de cuenta",
    "correction": "los details de su cuenta",
    "category": "fluency",
    "severity": "minor",
    "comment": "Grammar error: missing article before 'detalles'"
  }
]

TARGET-SPECIFIC LOCALIZATION & GRAMMAR RULES (CRITICAL):
${targetSpecificRules}
${glossaryRules}
${globalContextStr}

TECHNICAL MARKS & SYSTEM RULES:
- Ignore system protected tags like "<5261>", "</5261>" or place-holders. Do NOT flag them.
- Email addresses and phone numbers should remain untranslated.
- SUGGESTED CORRECTION REQUIREMENTS: For every error, you MUST provide a valid, grammatically correct replacement in the 'correction' field. The correction MUST be different from the offending 'span' and resolve the error (e.g., if 'span' is 'का अस्वीकृति', the 'correction' should be 'की अस्वीकृति'). Do NOT copy the offending span verbatim into the correction field.

Target Language: ${targetLangName} (from ${sourceLangName})`;

  const batchMqmSchema = {
    name: "batch_mqm_errors",
    strict: true,
    schema: {
      type: "object",
      properties: {
        errors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              segmentIndex: { type: "integer", description: "The index matching the segment_index of the input segments" },
              span: { type: "string", description: "Exact substring from the target text containing the error" },
              correction: { type: "string", description: "The suggested corrected text that should replace the offending span" },
              category: { type: "string", enum: ["accuracy", "fluency", "terminology", "style", "locale"] },
              severity: { type: "string", enum: ["minor", "major", "critical"] },
              comment: { type: "string", description: "Detailed explanation of the error" }
            },
            required: ["segmentIndex", "span", "correction", "category", "severity", "comment"],
            additionalProperties: false
          }
        }
      },
      required: ["errors"],
      additionalProperties: false
    }
  };

  const userPrompt = segments.map(seg => `
Segment Index: ${seg.segment_index}
Source: "${seg.source_text}"
Translation: "${seg.target_text || ""}"
`).join("\n---\n");

  try {
    const result = await callOpenAI(
      [
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt }
      ],
      { type: "json_schema", json_schema: batchMqmSchema }
    );
    return result.errors || [];
  } catch (err) {
    console.error("[MQM Batch Pass 1 Failed]", err.message);
    throw err;
  }
};

/**
 * Execute Document-wide MQM background audit.
 * Coordinates batch Pass 1 calls and concurrent worker pool (p-limit) for Phase 4 self-checks.
 */
/**
 * Phase 1: Global Document Context & Translation Inconsistency Scan
 * Scans all segments of the document (chunked by source word count) to identify global context and inconsistencies.
 */
const scanDocumentGlobally = async (segments, targetLang, sourceLang, contextSettings) => {
  const sourceLangName = getLangName(sourceLang);
  const targetLangName = getLangName(targetLang);

  // Group segments into chunks such that the total source word count of segments in a chunk does not exceed 1000 words.
  const chunks = [];
  let currentChunk = [];
  let currentWordCount = 0;

  for (const seg of segments) {
    const wordCount = (seg.source_text || "").trim().split(/\s+/).filter(Boolean).length;
    if (currentWordCount + wordCount > 1000 && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [seg];
      currentWordCount = wordCount;
    } else {
      currentChunk.push(seg);
      currentWordCount += wordCount;
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  const sysPrompt = "You are a translation quality manager specialized in the MQM (Multidimensional Quality Metrics) framework.\n" +
    "Your task is to analyze the source texts and translations of a document chunk to extract:\n" +
    "1. The global domain context, overall tone, formality, and styling rules.\n" +
    "2. All major, clear translation errors (such as critical mistranslations, major omissions, or obvious glossary violations) inside the chunk.\n" +
    "3. Terminology inconsistencies (e.g. if the same source word/phrase is translated differently in different parts of the chunk).\n\n" +
    "You must output a JSON object containing the global document profile.";

  const globalScanSchema = {
    name: "global_document_scan",
    strict: true,
    schema: {
      type: "object",
      properties: {
        detectedDomain: { type: "string", description: "Brief description of the domain and topic of the document" },
        detectedToneFormality: { type: "string", description: "The tone and formality level detected across the document" },
        majorErrors: {
          type: "array",
          description: "List of major, clear translation errors identified in this chunk",
          items: {
            type: "object",
            properties: {
              segmentIndex: { type: "integer", description: "The 0-based segment index where this error occurs" },
              span: { type: "string", description: "Exact offending word/phrase from the translation text" },
              correction: { type: "string", description: "The recommended corrected translation" },
              category: { type: "string", enum: ["accuracy", "fluency", "terminology", "style", "locale"] },
              severity: { type: "string", enum: ["major", "critical"] },
              comment: { type: "string", description: "Reason why this is a major/critical error" }
            },
            required: ["segmentIndex", "span", "correction", "category", "severity", "comment"],
            additionalProperties: false
          }
        },
        inconsistencies: {
          type: "array",
          description: "List of key terms or phrases that are translated inconsistently across segments",
          items: {
            type: "object",
            properties: {
              sourceTerm: { type: "string", description: "The term in the source language" },
              variants: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    segmentIndex: { type: "integer", description: "The 0-based index of the segment containing this variant" },
                    targetTranslation: { type: "string", description: "The translation of the term in this segment" }
                  },
                  required: ["segmentIndex", "targetTranslation"],
                  additionalProperties: false
                }
              },
              recommendedTranslation: { type: "string", description: "The recommended correct translation for this source term to maintain consistency" },
              reasoning: { type: "string", description: "Why these variants are inconsistent or which one is correct/incorrect" }
            },
            required: ["sourceTerm", "variants", "recommendedTranslation", "reasoning"],
            additionalProperties: false
          }
        }
      },
      required: ["detectedDomain", "detectedToneFormality", "majorErrors", "inconsistencies"],
      additionalProperties: false
    }
  };

  const mergedReport = {
    detectedDomain: "",
    detectedToneFormality: "",
    majorErrors: [],
    inconsistencies: []
  };

  const domainSamples = [];
  const toneSamples = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log("[MQM Global Scan] Scanning chunk " + (i + 1) + "/" + chunks.length + " (" + chunk.length + " segments)...");

    const segmentListStr = chunk.map(seg => "\nSegment Index: " + seg.segment_index + "\nSource: \"" + seg.source_text + "\"\nTranslation: \"" + (seg.target_text || "") + "\"").join("\n---\n");

    const userPrompt = "Below are all the segments of this chunk:\n---\n" + segmentListStr + "\n---\nPlease perform a global quality review to find major errors, inconsistencies, and establish the document profile for this chunk.";

    try {
      const result = await callOpenAI(
        [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt }
        ],
        { type: "json_schema", json_schema: globalScanSchema }
      );

      if (result) {
        if (result.detectedDomain) domainSamples.push(result.detectedDomain);
        if (result.detectedToneFormality) toneSamples.push(result.detectedToneFormality);
        if (Array.isArray(result.majorErrors)) {
          mergedReport.majorErrors.push(...result.majorErrors);
        }
        if (Array.isArray(result.inconsistencies)) {
          mergedReport.inconsistencies.push(...result.inconsistencies);
        }
      }
    } catch (err) {
      console.error("[MQM Global Scan] Failed to scan chunk " + (i + 1) + ":", err.message);
    }
  }

  mergedReport.detectedDomain = domainSamples.length > 0 ? domainSamples[0] : "General";
  mergedReport.detectedToneFormality = toneSamples.length > 0 ? toneSamples[0] : "Neutral";

  return mergedReport;
};

const auditDocumentMQM = async (documentId, jobId, contextSettings = null) => {
  const { getIo } = require("./socket");
  const io = getIo();

  try {
    console.log("[Audit Job " + jobId + "] Starting background audit...");

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docErr || !doc) {
      throw new Error("Document not found: " + documentId);
    }

    const { data: segments, error: fetchErr } = await supabase
      .from("document_segments")
      .select("*")
      .eq("document_id", documentId)
      .order("segment_index", { ascending: true });

    if (fetchErr || !segments || segments.length === 0) {
      throw new Error("No segments found to audit.");
    }

    // Set job initial metrics
    await supabase
      .from("audit_jobs")
      .update({
        status: "in_progress",
        total_segments: segments.length,
        completed_segments: 0,
        failed_segments: 0,
        updated_at: new Date().toISOString()
      })
      .eq("id", jobId);

    // Phase 1: Run Global Document-Wide Scan (Chunked by Word Count)
    console.log("[Audit Job " + jobId + "] Running Phase 1: Global document-wide scan...");
    const globalReport = await scanDocumentGlobally(
      segments,
      doc.target_lang,
      doc.source_lang,
      contextSettings
    );
    console.log("[Audit Job " + jobId + "] Phase 1 complete. Detected domain: \"" + globalReport.detectedDomain + "\", tone: \"" + globalReport.detectedToneFormality + "\", major errors: " + globalReport.majorErrors.length + ", inconsistencies: " + globalReport.inconsistencies.length);

    // Group segments by batches of 8 for Pass 1 detection calls
    const batchSize = 8;
    const segmentBatches = [];
    for (let i = 0; i < segments.length; i += batchSize) {
      segmentBatches.push(segments.slice(i, i + batchSize));
    }

    const targetSpecificRules = getTargetSpecificRules(doc.target_lang, doc.source_lang);
    const errorsMapBySegment = {};
    segments.forEach(seg => {
      errorsMapBySegment[seg.segment_index] = [];
    });

    console.log("[Audit Job " + jobId + "] Running Pass 1 Batch error detection in parallel...");
    const batchLimit = pLimit(5); // concurrency limit for batch calls

    await Promise.all(
      segmentBatches.map(batch =>
        batchLimit(async () => {
          // Check cancellation
          const { data: currentJob } = await supabase
            .from("audit_jobs")
            .select("status")
            .eq("id", jobId)
            .single();

          if (currentJob?.status === "cancelled") {
            return;
          }

          try {
            const rawErrors = await evaluateBatchPass1({
              segments: batch,
              targetLang: doc.target_lang,
              sourceLang: doc.source_lang,
              contextSettings,
              globalReport
            });

            for (const err of rawErrors) {
              const segIdx = err.segmentIndex;
              if (errorsMapBySegment[segIdx]) {
                errorsMapBySegment[segIdx].push(err);
              }
            }
          } catch (err) {
            console.error("[Audit Job " + jobId + "] Batch error detection failed for range.", err.message);
            // We'll fallback to running individual Pass 1 on these segments in next phase
            batch.forEach(seg => {
              seg.needsIndividualPass1 = true;
            });
          }
        })
      )
    );

    // Check cancellation before phase 2
    const { data: currentJobStatus } = await supabase
      .from("audit_jobs")
      .select("status")
      .eq("id", jobId)
      .single();

    if (currentJobStatus?.status === "cancelled") {
      console.log("[Audit Job " + jobId + "] Cancelled before detailed checks.");
      return;
    }

    console.log("[Audit Job " + jobId + "] Running detailed Phase 2 verification on segments...");
    const limit = pLimit(10);
    let completedCount = 0;
    let failedCount = 0;

    const processSegment = async (seg) => {
      // Check cancellation loop
      const { data: job } = await supabase
        .from("audit_jobs")
        .select("status")
        .eq("id", jobId)
        .single();

      if (job?.status === "cancelled") {
        return;
      }

      const prevSegment = segments.find(s => s.segment_index === seg.segment_index - 1);
      const nextSegment = segments.find(s => s.segment_index === seg.segment_index + 1);

      const pass1Errors = errorsMapBySegment[seg.segment_index] || [];
      const hasErrors = pass1Errors.length > 0;
      
      const hasGlobalErrors = (globalReport?.majorErrors || []).some(e => e.segmentIndex === seg.segment_index) ||
                              (globalReport?.inconsistencies || []).some(inc => inc.variants.some(v => v.segmentIndex === seg.segment_index));
      
      const needsFullAudit = hasErrors || seg.needsIndividualPass1 || hasGlobalErrors;

      try {
        let mqmReport = null;

        if (!needsFullAudit) {
          // No errors detected in Batch Pass 1 or Global scan, save instantly as clean
          const wordCount = Math.max(1, seg.source_text.trim().split(/\s+/).filter(Boolean).length);
          const hash = calculateMqmHash(seg.source_text, seg.target_text || "", "v1", MQM_PROMPT_VERSION);
          
          mqmReport = {
            accuracyScore: 100,
            errors: [],
            clarifyingQuestions: [],
            improvementSuggestion: "",
            hash,
            promptVersion: MQM_PROMPT_VERSION,
            schemaVersion: MQM_SCHEMA_VERSION
          };
        } else {
          // Run full 3-Pass evaluation pipeline with global context
          mqmReport = await evaluateTranslationMQM({
            sourceText: seg.source_text,
            translatedText: seg.target_text || "",
            targetLang: doc.target_lang,
            sourceLang: doc.source_lang,
            contextJira: seg.context_jira || "",
            contextDescription: seg.context_description || "",
            contextSettings: contextSettings,
            prevSource: prevSegment?.source_text,
            prevTarget: prevSegment?.target_text,
            nextSource: nextSegment?.source_text,
            nextTarget: nextSegment?.target_text,
            isFullAudit: true,
            documentId: doc.id,
            globalReport,
            segmentIndex: seg.segment_index
          });
        }

        if (mqmReport.evaluationFailed) {
          failedCount++;
        }

        await saveSegmentAuditResult(doc.id, seg, mqmReport, io);
        completedCount++;

      } catch (err) {
        console.error("[Audit Job " + jobId + "] Failed segment index " + seg.segment_index + ":", err.message);
        failedCount++;
      }

      await updateHeartbeat(jobId, completedCount, failedCount);
    };

    await Promise.all(segments.map(seg => limit(() => processSegment(seg))));

    // Final job check
    const { data: finalJob } = await supabase
      .from("audit_jobs")
      .select("status")
      .eq("id", jobId)
      .single();

    if (finalJob?.status === "cancelled") {
      console.log(`[Audit Job ${jobId}] Finished but was marked cancelled.`);
      return;
    }

    await supabase
      .from("audit_jobs")
      .update({
        status: failedCount === segments.length ? "failed" : "completed",
        error_message: failedCount > 0 ? `${failedCount} segments failed evaluation.` : null,
        updated_at: new Date().toISOString()
      })
      .eq("id", jobId);

    console.log(`[Audit Job ${jobId}] Finished with status: completed. Failed count: ${failedCount}`);

    if (io) {
      io.to(documentId).emit("document-audit-completed", {
        documentId,
        jobId
      });
    }

  } catch (error) {
    console.error(`[Audit Job ${jobId}] Fatal crash:`, error.message);
    await supabase
      .from("audit_jobs")
      .update({
        status: "failed",
        error_message: error.message,
        updated_at: new Date().toISOString()
      })
      .eq("id", jobId);
  }
};

const saveSegmentAuditResult = async (documentId, segment, mqmReport, io) => {
  const accuracyScore = mqmReport.evaluationFailed ? segment.mqm_accuracy_score || 100 : mqmReport.accuracyScore;

  const { error } = await supabase
    .from("document_segments")
    .update({
      mqm_accuracy_score: accuracyScore,
      mqm_report: mqmReport,
      updated_at: new Date().toISOString()
    })
    .eq("document_id", documentId)
    .eq("segment_index", segment.segment_index);

  if (error) {
    console.error(`[Audit Job] Failed database update for segment index ${segment.segment_index}:`, error.message);
  } else if (io) {
    io.to(documentId).emit("segment-updated", {
      segmentIndex: segment.segment_index,
      targetText: segment.target_text,
      status: segment.status || "translated",
      contextJira: segment.context_jira || "",
      contextDescription: segment.context_description || "",
      mqmAccuracyScore: accuracyScore,
      mqmReport: mqmReport,
      updatedBy: "System Auditor"
    });
  }
};

const updateHeartbeat = async (jobId, completed, failed) => {
  await supabase
    .from("audit_jobs")
    .update({
      completed_segments: completed,
      failed_segments: failed,
      updated_at: new Date().toISOString()
    })
    .eq("id", jobId);
};

// ── Acronym & Localization Rules ──
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
    const sourceRegex = new RegExp(`\\b${item.latin}\\b`, "i");
    if (sourceRegex.test(sourceText)) {
      const transRegex = new RegExp(item.devanagari, "g");
      if (transRegex.test(translatedText)) {
        const alreadyReported = errors.some(
          err => err.span && (err.span.includes(item.devanagari) || err.correction === item.latin)
        );

        if (!alreadyReported) {
          errors.push({
            category: "terminology",
            severity: "minor",
            span: item.devanagari,
            correction: item.latin,
            comment: `Acronyms like '${item.latin}' must remain in English/Latin script instead of being transliterated to '${item.devanagari}'.`
          });
        }
      }
    }
  }
};

const resolveOverlappingErrors = (errors, translatedText) => {
  for (const err of errors) {
    if (err.correction) {
      if (err.correction.includes("सहमति पत्र") && (err.correction.includes("आपकी") || err.correction.includes("की"))) {
        err.correction = err.correction.replace(/आपकी/g, "आपका").replace(/की/g, "का");
        err.comment = "The term 'Consent' must be translated as 'सहमति पत्र' (masculine), and possessive 'आपका' agrees with the masculine 'पत्र'.";
      }
    }
  }

  const hasConsentLetterCorrection = errors.some(
    err => (err.span === "सहमति" || err.span === "सहमति पत्र") && err.correction.includes("सहमति पत्र")
  );

  if (hasConsentLetterCorrection) {
    const grammarErrIndex = errors.findIndex(
      err => (err.span === "आपका सहमति" && err.correction === "आपकी सहमति") ||
             (err.span === "आपका" && err.correction === "आपकी" && (translatedText.includes("क्या आपका सहमति") || translatedText.includes("आपका सहमति") || translatedText.includes("आपका सहमति पत्र")))
    );

    if (grammarErrIndex !== -1) {
      errors.splice(grammarErrIndex, 1);
      const termErr = errors.find(err => (err.span === "सहमति" || err.span === "सहमति पत्र") && err.correction.includes("सहमति पत्र"));
      if (termErr && translatedText.includes("आपका सहमति")) {
        termErr.span = "आपका सहमति";
        termErr.correction = "का सहमति पत्र";
        termErr.comment = "The term 'Consent' must be translated as 'सहमति पत्र' to reflect the formal document requirement, and possessive 'आपका' agrees with the masculine 'पत्र'.";
      }
    }
  }
};

module.exports = {
  computeSegmentMQMScore,
  computeDocumentMQMScore,
  evaluateTranslationMQM,
  auditDocumentMQM,
  scanDocumentGlobally,
  evaluateBatchPass1
};
