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

const getTargetSpecificRules = (targetLang, sourceLang) => {
  const targetLangName = getLangName(targetLang);
  const isTargetHindi = String(targetLang || "").toLowerCase().startsWith("hi");
  const isTargetEnglish = String(targetLang || "").toLowerCase().startsWith("en");

  if (isTargetHindi) {
    return `
- HINDI GRAMMAR & GENDER COMPLIANCE: Check for grammatical agreement in Hindi. Adjective/possessive agreement must match the noun gender.
  - "सहमति" (consent) is feminine, so "आपका सहमति" is grammatically incorrect (must be "आपकी सहमति").
  - "सहमति पत्र" (consent letter) is masculine, so "आपका सहमति पत्र" is correct.
  - HINDI GENITIVE AGREEMENT (CRITICAL): In Hindi possessive phrases (e.g., "X की Y" or "X का Y"), the genitive postposition ('का', 'की', 'के') agrees in gender/number with the POSSESSED noun 'Y', NOT the owner noun 'X'. Since 'अस्वीकृति' (dishonour) is FEMININE, it must always be "भुगतान निर्देशों की अस्वीकृति" (using the feminine 'की'). Do NOT flag 'की' as an error in this context and do NOT suggest changing it to 'का'.
- ACRONYM & TRANSLITERATION PRESERVATION: 
  * Only short-form uppercase English acronyms, abbreviations, and initialization codes (e.g., 'RBI', 'PDC', 'KYC', 'CIBIL', 'OTP', 'NACH', 'e-NACH', 'SPDC') must remain in their original English uppercase form. If the translation transliterates these (like 'आरबीआई' or 'पीडीसी'), flag it as a Terminology error.
  * Standard financial, technical, or banking terms (such as 'Margin Call', 'Flexi Loan', 'Loan Agreement', 'Lender', 'Borrower') MUST be transliterated into Devanagari script (e.g. 'मार्जिन कॉल', 'फ्लेक्सी लोन', 'लोन एग्रीमेंट', 'लेंडर'). Do NOT flag Devanagari transliterations of these terms as errors and do NOT suggest leaving them in English Latin characters.
- LIST INDEX MAPPING: Standard English list indices (like letters or numbers, e.g. "h.)") can be translated to corresponding Hindi listing characters (like "झ.)"). Do not flag standard Devanagari listing ordering as errors.
- CONJUNCTIONS: Verify if equivalent Hindi conjunctions (like 'और', 'लेकिन', 'या') are present before reporting missing English conjunctions (like 'and', 'but', 'or').
- DISSENT ON FORMALITY: Hindi banking/legal translations must be formal. Do NOT flag formal phrasing (e.g. "पुष्टि करता है", "अधीन", "प्रभारों") as "Too Formal" or suggest casual rewrites. For example, translate 'charges' as 'प्रभारों' rather than the transliterated 'चार्जों'.
- STRICT LEGAL PRECISION & ANTI-HALLUCINATION: 
  * Do NOT suggest stylistic changes that weaken legal precision. For example, "partnership firm" must remain "साझेदारी फर्म" (Firm), do NOT suggest changing it to "साझेदारी कंपनी" (Company) as they are distinct legal entities.
  * "duly represented" is formally translated as "उचित रूप से प्रतिनिधित्व". Do NOT recommend casual/informal phrases like "सही तरीके से" in formal agreements.
  * Do not invent or hallucinate errors. If the translation is grammatically correct, formal, and legally accurate, return an empty errors list.
`;
  } else if (isTargetEnglish) {
    return `
- ENGLISH GRAMMAR & SYNTAX: Ensure strict adherence to English grammar rules, including correct subject-verb agreement, verb tenses, preposition usage, and article placement ('a', 'an', 'the').
  - Note: Assertive sentences cannot use 'any' in place of 'a' or 'some' (e.g., "There is any material change" is grammatically incorrect; it must be "There is a material change").
- LEGAL/BANKING TERMINOLOGY: Standard banking and legal terms must use precise English equivalents. For example, 'प्रभारों' should be translated as 'charges', 'सहमति' as 'consent', 'सहमति पत्र' as 'consent letter' or 'consent form'.
- CAPITALIZATION: Ensure proper capitalization of standard acronyms (e.g., NRI, AMB, CIBIL, KYC, OTP, ATM, GST), proper nouns, and the start of sentences.
- PHRASING & FLOW: Phrasing must sound natural and professional. Avoid literal translations of Hindi idioms or sentence structures (e.g. "PCHFL की राय में" should be translated as "In the opinion of PCHFL" or "In PCHFL's opinion").
`;
  } else {
    return `
- GRAMMAR & SYNTAX: Ensure correct grammar, syntax, gender/plural agreement, and formatting in the target language (${targetLangName}).
- ACRONYM PRESERVATION: Keep standard alphanumeric acronyms and abbreviations in their original uppercase Latin form if standard in ${targetLangName} technical/banking documents.
- CONJUNCTIONS & PREPOSITIONS: Do not report false omissions of conjunctions/prepositions. Verify if the target language equivalent is present.
`;
  }
};

// ── Pass 1 Error Detection Prompt ────────────────────────────────────
const getPass1SystemPrompt = (targetLangName, sourceLangName, targetSpecificRules) => {
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

TECHNICAL MARKS & SYSTEM RULES:
- Ignore system-protected protected tags like "<5261>", "</5261>" or place-holders. Do NOT flag them as untranslated or spelling errors.
- Email addresses and phone numbers should remain untranslated; do not flag them.
- SUGGESTED CORRECTION REQUIREMENTS: For every error, you MUST provide a valid, grammatically correct replacement in the 'correction' field. The correction MUST be different from the offending 'span' and resolve the error (e.g., if 'span' is 'का अस्वीकृति', the 'correction' should be 'की अस्वीकृति'). Do NOT copy the offending span verbatim into the correction field.

Target Language: ${targetLangName} (from ${sourceLangName})`;
};

// ── Pass 2 & 3 Prompts for Verification ──────────────────────────────
const getPass2SystemPrompt = (targetLangName, sourceLangName) => {
  return `You are a professional translator and proofreader.
Your task is to take a translation, review the flagged errors, and output a single, corrected version of the translation text (post-edited text) that fixes all valid flagged errors. Keep the rest of the translation unchanged. Do not introduce new errors.

Target Language: ${targetLangName} (from ${sourceLangName})`;
};

const getPass3SystemPrompt = (targetLangName, sourceLangName) => {
  return `You are a translation quality assurance judge.
You will be shown:
1. The original translation.
2. A post-edited translation that attempts to fix flagged errors.
3. A list of flagged errors.

For each flagged error, compare the original translation with the post-edited translation.
Decide if the original text at that span had a genuine error that was correctly resolved in the post-edited translation.
Output "accept" if it was a genuine error.
Output "reject" if the error flag was false positive noise, and the original text was correct or preferred.

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
  const cleanText = (t) => String(t || "").replace(/[\s\u200b\u200c\u200d\u00a0]+/g, "").trim();
  const normalizedTarget = cleanText(targetText);

  for (const err of errors) {
    if (!err || typeof err !== "object") continue;
    const span = String(err.span || "").trim();
    if (!span) continue;

    const normalizedSpan = cleanText(span);
    if (!normalizedTarget.toLowerCase().includes(normalizedSpan.toLowerCase())) {
      console.log(`[MQM Filter] Discarded hallucinated error span (not found in target text): "${span}"`);
      continue;
    }

    // Capture exact casing from translation
    const exactIdx = targetText.toLowerCase().indexOf(span.toLowerCase());
    if (exactIdx !== -1) {
      err.span = targetText.substring(exactIdx, exactIdx + span.length);
    }
    verified.push(err);
  }
  return verified;
};

/**
 * Main MQM evaluation for a single segment.
 * Runs Pass 1 detection.
 * If isFullAudit === true or a critical error is flagged in Pass 1:
 *   Escalates and executes Pass 2 (Post-edit) and Pass 3 (Verdict Comparison).
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
  isFullAudit = false,
  documentId = null,
  glossaryVersion = "v1",
  onCriticalEscalate = null
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

  // 1. Caching Check
  const hash = calculateMqmHash(sourceText, translatedText, glossaryVersion, MQM_PROMPT_VERSION);
  if (documentId) {
    try {
      const { data: cachedSegs } = await supabase
        .from("document_segments")
        .select("mqm_accuracy_score, mqm_report")
        .eq("document_id", documentId)
        .not("mqm_report", "is", null);
      
      const hit = cachedSegs?.find(s => s.mqm_report && s.mqm_report.hash === hash);
      if (hit) {
        console.log(`[MQM Cache] Hit cached evaluation for: "${sourceText.substring(0, 35)}..."`);
        return hit.mqm_report;
      }
    } catch (e) {
      console.warn("[MQM Cache Check] Error checking Supabase MQM cache:", e.message);
    }
  }

  const sourceLangName = getLangName(sourceLang);
  const targetLangName = getLangName(targetLang);
  const targetSpecificRules = getTargetSpecificRules(targetLang, sourceLang);

  const wordCount = Math.max(1, sourceText.trim().split(/\s+/).filter(Boolean).length);

  try {
    // ── Pass 1: Error Detection ──
    const pass1Sys = getPass1SystemPrompt(targetLangName, sourceLangName, targetSpecificRules);
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

    const pass1Result = await callOpenAI(
      [
        { role: "system", content: pass1Sys },
        { role: "user", content: pass1User }
      ],
      { type: "json_schema", json_schema: mqmSchema }
    );

    let detectedErrors = pass1Result.errors || [];
    detectedErrors = verifyAndSanitizeSpans(detectedErrors, translatedText);

    // Run Acronym rules
    checkAcronymErrors(sourceText, translatedText, detectedErrors);
    resolveOverlappingErrors(detectedErrors, translatedText);

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
      const pass2Sys = getPass2SystemPrompt(targetLangName, sourceLangName);
      const pass2User = `Original Translation: "${translatedText}"
Flagged Errors:
${JSON.stringify(detectedErrors, null, 2)}

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
      const pass3Sys = getPass3SystemPrompt(targetLangName, sourceLangName);
      const pass3User = `Original Translation: "${translatedText}"
Post-Edited Translation: "${postEditedText}"
Flagged Errors:
${JSON.stringify(detectedErrors, null, 2)}

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
      improvementSuggestion: finalErrors.length > 0 ? "Corrected translation errors found in audit." : "",
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
  targetSpecificRules
}) => {
  const sourceLangName = getLangName(sourceLang);
  const targetLangName = getLangName(targetLang);

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
    "correction": "los detalles de su cuenta",
    "category": "fluency",
    "severity": "minor",
    "comment": "Grammar error: missing article before 'detalles'"
  }
]

TARGET-SPECIFIC LOCALIZATION & GRAMMAR RULES (CRITICAL):
${targetSpecificRules}

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
const auditDocumentMQM = async (documentId, jobId) => {
  const { getIo } = require("./socket");
  const io = getIo();

  try {
    console.log(`[Audit Job ${jobId}] Starting background audit...`);

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docErr || !doc) {
      throw new Error(`Document not found: ${documentId}`);
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

    console.log(`[Audit Job ${jobId}] Running Pass 1 Batch error detection in parallel...`);
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
              targetSpecificRules
            });

            for (const err of rawErrors) {
              const segIdx = err.segmentIndex;
              if (errorsMapBySegment[segIdx]) {
                errorsMapBySegment[segIdx].push(err);
              }
            }
          } catch (err) {
            console.error(`[Audit Job ${jobId}] Batch error detection failed for range.`, err.message);
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
      console.log(`[Audit Job ${jobId}] Cancelled before detailed checks.`);
      return;
    }

    console.log(`[Audit Job ${jobId}] Running detailed Phase 4 verification on segments with errors...`);
    const limit = pLimit(10);
    let completedCount = 0;
    let failedCount = 0;

    // Local duplication cache map to avoid evaluating identical translation pairs twice
    const evaluatedCacheMap = new Map();

    const processSegment = async (seg) => {
      // 1. Check cancellation loop
      const { data: job } = await supabase
        .from("audit_jobs")
        .select("status")
        .eq("id", jobId)
        .single();

      if (job?.status === "cancelled") {
        return;
      }

      // Check local cache
      const cacheKey = `${seg.source_text}|||${seg.target_text || ""}`;
      if (evaluatedCacheMap.has(cacheKey)) {
        const cachedReport = evaluatedCacheMap.get(cacheKey);
        await saveSegmentAuditResult(doc.id, seg, cachedReport, io);
        completedCount++;
        await updateHeartbeat(jobId, completedCount, failedCount);
        return;
      }

      const prevSegment = segments.find(s => s.segment_index === seg.segment_index - 1);
      const nextSegment = segments.find(s => s.segment_index === seg.segment_index + 1);

      const pass1Errors = errorsMapBySegment[seg.segment_index] || [];
      const hasErrors = pass1Errors.length > 0;
      const needsFullAudit = hasErrors || seg.needsIndividualPass1;

      try {
        let mqmReport = null;

        if (!needsFullAudit) {
          // No errors detected in Batch Pass 1, save instantly as clean
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
          // Run full 3-Pass evaluation pipeline
          mqmReport = await evaluateTranslationMQM({
            sourceText: seg.source_text,
            translatedText: seg.target_text || "",
            targetLang: doc.target_lang,
            sourceLang: doc.source_lang,
            contextJira: seg.context_jira || "",
            contextDescription: seg.context_description || "",
            contextSettings: null,
            prevSource: prevSegment?.source_text,
            prevTarget: prevSegment?.target_text,
            nextSource: nextSegment?.source_text,
            nextTarget: nextSegment?.target_text,
            isFullAudit: true,
            documentId: doc.id
          });
        }

        if (mqmReport.evaluationFailed) {
          failedCount++;
        } else {
          // Cache successful result locally for identical translations
          evaluatedCacheMap.set(cacheKey, mqmReport);
        }

        await saveSegmentAuditResult(doc.id, seg, mqmReport, io);
        completedCount++;

      } catch (err) {
        console.error(`[Audit Job ${jobId}] Failed segment index ${seg.segment_index}:`, err.message);
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
  auditDocumentMQM
};
