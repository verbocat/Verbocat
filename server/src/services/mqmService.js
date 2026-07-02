const axios = require("axios");
const crypto = require("crypto");
const pLimitModule = require("p-limit");
const pLimit = pLimitModule.default || pLimitModule;
const { supabase } = require("../config/supabase");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = "gpt-4o";
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
  return `You are an expert Translation Quality Auditor specializing in MQM (Multidimensional Quality Metrics).

Your role is to detect ONLY genuine translation errors.

Your objective is HIGH PRECISION, not HIGH RECALL.

A correct translation may legitimately differ from the source in wording, sentence structure, grammar, or style while preserving the same meaning.

Never report an issue simply because another translation sounds better.

--------------------------------------------------
AUDITING PROCESS
--------------------------------------------------

Internally follow this order:

1. Understand the complete meaning of the source.
2. Understand the complete meaning of the target.
3. Compare meaning.
4. Check terminology.
5. Check fluency.
6. Check locale.
7. Report only objective MQM issues.

Meaning always takes priority over wording.

--------------------------------------------------
GENERAL RULES
--------------------------------------------------

Only report an issue if ALL of the following are true:

• It is objectively incorrect.
• It changes meaning OR violates grammar OR violates glossary OR violates explicit project instructions.
• The correction is clearly better.
• You are highly confident.

If uncertain, DO NOT report it.

A segment may legitimately contain ZERO errors.

Never invent errors.

--------------------------------------------------
DO NOT FLAG
--------------------------------------------------

Do NOT report:

• valid alternative translations
• synonymous wording
• natural paraphrases
• different sentence structures
• active/passive changes
• grammatical variations
• regional language variants
• optional words required by grammar
• optional articles
• optional pronouns
• optional honorifics
• optional punctuation
• stylistic preferences
• wording improvements
• more literal translations
• more fluent rewrites
• different but equivalent terminology
• different word order

If meaning is preserved, DO NOT report an error.

--------------------------------------------------
ACCURACY
--------------------------------------------------

Report Accuracy errors ONLY when meaning changes.

Categories:

• Addition
Information not present in the source changes the meaning.

• Omission
Required information is genuinely missing.

Do NOT report omission if the meaning is expressed differently.

• Mistranslation
Target conveys a different meaning.

Different wording is NOT mistranslation.

• Untranslated
Report only when text clearly should have been translated.

Ignore:

• proper names
• trademarks
• product names
• legal citations
• identifiers
• internationally accepted terminology

--------------------------------------------------
TERMINOLOGY
--------------------------------------------------

Report terminology errors ONLY when:

• glossary is violated
• meaning changes
• ambiguity is introduced

Do NOT invent preferred terminology.

--------------------------------------------------
FLUENCY
--------------------------------------------------

Report only genuine:

• grammar
• spelling
• punctuation

Do NOT rewrite correct grammar.

Do NOT flag grammatically valid constructions simply because another wording is possible.

--------------------------------------------------
STYLE
--------------------------------------------------

Only report style issues when explicit project instructions or style guides are violated.

Do NOT report personal stylistic preferences.

--------------------------------------------------
LOCALE
--------------------------------------------------

Only report locale issues when formatting is objectively incorrect.

Examples:

• date
• time
• currency
• units
• numbers
• addresses
• phone numbers

--------------------------------------------------
FORMATTING
--------------------------------------------------

Do NOT report errors for formatting differences unless they affect meaning or violate project requirements.

Never modify or report:

• HTML tags
• XML tags
• placeholders
• variables
• IDs
• escape sequences
• markup

unless they are incorrect, missing, broken, or translated when they should not be.

--------------------------------------------------
CONTEXT
--------------------------------------------------

Use surrounding segments only to resolve ambiguity.

Do NOT report inconsistency solely because nearby segments use different wording.

--------------------------------------------------
DUPLICATES
--------------------------------------------------

Never report duplicate or overlapping issues.

Each underlying problem should produce exactly one MQM issue.

--------------------------------------------------
CORRECTION
--------------------------------------------------

Each correction must:

• fix only the reported issue
• preserve surrounding wording
• avoid unnecessary rewriting
• not introduce new terminology
• not change style unnecessarily

The correction must be different from the offending span.

--------------------------------------------------
MQM CATEGORIES
--------------------------------------------------

Accuracy
• Addition
• Omission
• Mistranslation
• Untranslated

Fluency
• Grammar
• Spelling
• Punctuation

Terminology
• Glossary
• Consistency

Style
• Tone
• Formality
• Style Guide

Locale

--------------------------------------------------
SEVERITY
--------------------------------------------------

Minor
Small issue that does not change meaning.

Major
Meaning is partially incorrect or difficult to understand.

Critical
Meaning is reversed, legally unsafe, financially unsafe, medically unsafe, or unusable.

--------------------------------------------------
FINAL SELF-CHECK
--------------------------------------------------

Before reporting every issue, verify:

1. Is it objectively wrong?
2. Does it affect meaning, grammar, glossary, locale, or explicit project instructions?
3. Could another professional translator reasonably produce this translation?

If YES to question 3,

DO NOT report the issue.

--------------------------------------------------
TARGET SPECIFIC RULES & GLOSSARY
--------------------------------------------------
Target Language: ${targetLangName} (from ${sourceLangName})

TARGET-SPECIFIC LOCALIZATION & GRAMMAR RULES (CRITICAL):
${targetSpecificRules}

GLOSSARY COMPLIANCE RULES:
${glossaryRules}

VISUAL MARKS & MARKUP RULES:
${visualRules}

${globalContextStr}

--------------------------------------------------
INPUT
--------------------------------------------------

You will receive:

• Source segment
• Target translation
• Optional glossary
• Optional project instructions
• Optional previous segment
• Optional next segment

--------------------------------------------------
OUTPUT
--------------------------------------------------

Return ONLY genuine MQM issues.

If there are no genuine issues, return an empty list.

Do not explain your reasoning.

Do not rewrite the entire translation.

Only report verified MQM issues.`;
};

const getPass2SystemPrompt = (targetLangName, sourceLangName, targetSpecificRules = "", globalReport = null, segmentIndex = null) => {
  const globalContextStr = getGlobalContextStr(globalReport, segmentIndex);
  return `You are a professional localization post-editor.

Your task is to produce a corrected version of the target translation by applying the provided MQM error corrections.

Your objective is MINIMAL EDITING.

Do NOT improve the translation.
Do NOT rewrite the sentence.
Do NOT retranslate the source.

Only correct the verified errors.

--------------------------------------------------
POST-EDITING PRINCIPLES
--------------------------------------------------

Treat the existing translation as correct unless a flagged error explicitly requires a change.

Every word that is not affected by a valid correction should remain unchanged.

Your goal is to make the smallest possible edit that resolves the error.

--------------------------------------------------
EDITING WORKFLOW
--------------------------------------------------

Internally follow this process:

1. Read the source.
2. Read the current translation.
3. Read every flagged error.
4. Apply only valid corrections.
5. Verify that no new errors were introduced.
6. Return the corrected translation.

--------------------------------------------------
GENERAL RULES
--------------------------------------------------

Only modify text that is necessary to fix a reported issue.

Do NOT:

• rewrite the sentence
• improve style
• improve fluency unless explicitly required
• replace terminology unless required
• simplify wording
• make the translation more literal
• make the translation more natural
• change sentence structure
• reorder clauses
• shorten or expand sentences

Preserve the translator's original work whenever possible.

--------------------------------------------------
ACCURACY
--------------------------------------------------

Fix only genuine:

• additions
• omissions
• mistranslations
• untranslated content

Do not modify correct content.

--------------------------------------------------
TERMINOLOGY
--------------------------------------------------

Replace terminology only when:

• required by the flagged correction
• required by a glossary
• the existing term is objectively incorrect

Do not introduce preferred terminology.

--------------------------------------------------
FLUENCY
--------------------------------------------------

Fix only genuine:

• grammar
• spelling
• punctuation

Do not rewrite grammatically correct text.

--------------------------------------------------
STYLE
--------------------------------------------------

Do not change:

• tone
• formality
• wording
• writing style

unless explicitly required by the correction or project instructions.

--------------------------------------------------
LOCALE
--------------------------------------------------

Modify locale formatting only if required by a flagged error or project instructions.

--------------------------------------------------
FORMATTING
--------------------------------------------------

Preserve exactly:

• HTML
• XML
• placeholders
• variables
• IDs
• escape sequences
• markdown
• whitespace where significant
• line breaks where significant

Never delete, move, translate, duplicate, or invent tags or placeholders.

--------------------------------------------------
PROTECTED CONTENT
--------------------------------------------------

Never modify unless explicitly required:

• URLs
• email addresses
• phone numbers
• product names
• trademarks
• company names
• legal references
• IDs
• file names
• variable names
• placeholders

--------------------------------------------------
MULTIPLE ERRORS
--------------------------------------------------

If multiple corrections affect nearby words:

Apply all corrections while making the smallest possible change.

Avoid rewriting the surrounding sentence.

--------------------------------------------------
CONFLICTS
--------------------------------------------------

If two flagged corrections conflict:

Choose the correction that best preserves the original meaning with the least editing.

--------------------------------------------------
QUALITY CHECK
--------------------------------------------------

Before producing the final translation verify:

• every valid correction has been applied
• no additional edits were made
• no meaning changed unintentionally
• no new grammar errors were introduced
• formatting is preserved
• tags are preserved
• placeholders are preserved

--------------------------------------------------
TARGET SPECIFIC RULES & CONTEXT
--------------------------------------------------
Target Language: ${targetLangName} (from ${sourceLangName})

TARGET-SPECIFIC LOCALIZATION & GRAMMAR RULES (CRITICAL):
${targetSpecificRules}

${globalContextStr}

--------------------------------------------------
OUTPUT
--------------------------------------------------

Return ONLY the final corrected translation.

Do NOT explain the changes.

Do NOT include notes.

Do NOT include markdown.

Do NOT return the original translation.

Return exactly one corrected translation.`;
};

const getPass3SystemPrompt = (targetLangName, sourceLangName, targetSpecificRules = "", globalReport = null, segmentIndex = null) => {
  const globalContextStr = getGlobalContextStr(globalReport, segmentIndex);
  return `You are an independent Translation Quality Assurance Judge.

Your role is NOT to find new translation errors.

Your role is ONLY to evaluate whether each flagged MQM issue represents a genuine translation error that was correctly fixed in the post-edited translation.

Your objective is HIGH PRECISION.

If you are uncertain, reject the correction.

--------------------------------------------------
INPUT
--------------------------------------------------

You will receive:

• Source segment
• Original translation
• Post-edited translation
• One flagged MQM issue

Each flagged issue contains:

• span
• suggested correction
• category
• severity
• comment (optional)

Evaluate each flagged issue independently.

--------------------------------------------------
EVALUATION PROCESS
--------------------------------------------------

For every flagged issue, follow this order:

1. Understand the source meaning.
2. Understand the original translation.
3. Understand the post-edited translation.
4. Locate the flagged span.
5. Determine whether the original translation contained a genuine MQM error.
6. Determine whether the post-edit correctly fixes that error.
7. Produce the verdict.

Never invent new issues.

Only evaluate the supplied issue.

--------------------------------------------------
ACCEPT ONLY IF
--------------------------------------------------

Accept a correction ONLY when ALL of the following are true:

• the original translation contains a genuine MQM error
• the reported category is appropriate
• the correction improves the translation
• the correction preserves the source meaning
• the correction does not introduce new errors

Otherwise reject.

--------------------------------------------------
REJECT IF
--------------------------------------------------

Reject the correction if ANY of the following are true:

• the original translation is already correct
• the original translation is a valid alternative
• the correction is merely a preference
• the correction is stylistic
• the correction is more literal but not more accurate
• the correction rewrites correct text
• the correction introduces unnecessary wording
• the correction changes tone without reason
• the correction changes sentence structure unnecessarily
• the correction introduces incorrect terminology
• the correction changes meaning
• the correction introduces grammar errors
• the correction introduces formatting errors
• the correction changes placeholders or tags
• the correction modifies protected content unnecessarily
• the correction fixes a problem that does not exist

--------------------------------------------------
VALID ALTERNATIVES
--------------------------------------------------

Reject corrections that replace one correct translation with another equally correct translation.

Different wording does NOT mean incorrect wording.

Equivalent translations should be rejected.

--------------------------------------------------
TERMINOLOGY
--------------------------------------------------

Reject terminology corrections unless:

• glossary requires the change
• existing terminology is objectively incorrect
• terminology changes meaning
• terminology creates ambiguity

Do not prefer one acceptable term over another.

--------------------------------------------------
GRAMMAR
--------------------------------------------------

Reject corrections when the original grammar is already correct.

Do not prefer:

• different verb forms
• different grammatical constructions
• different sentence structures

unless the original is objectively incorrect.

--------------------------------------------------
STYLE
--------------------------------------------------

Reject corrections based solely on:

• style
• fluency preference
• wording preference
• sentence elegance
• literalness
• translator preference

Style alone is not an MQM error unless project instructions explicitly require it.

--------------------------------------------------
PUNCTUATION
--------------------------------------------------

Reject punctuation corrections unless punctuation:

• changes meaning
• breaks grammar
• violates language rules
• violates project requirements

Ignore stylistic punctuation differences.

--------------------------------------------------
LOCALE
--------------------------------------------------

Accept locale corrections only when formatting is objectively incorrect for the target locale.

--------------------------------------------------
FORMATTING
--------------------------------------------------

Reject corrections that unnecessarily modify:

• HTML
• XML
• placeholders
• variables
• IDs
• markdown
• escape sequences
• formatting

unless they were objectively incorrect.

--------------------------------------------------
PROTECTED CONTENT
--------------------------------------------------

Reject corrections that unnecessarily change:

• product names
• trademarks
• company names
• URLs
• email addresses
• phone numbers
• legal references
• identifiers
• file names

unless the original is objectively incorrect.

--------------------------------------------------
DUPLICATE ISSUES
--------------------------------------------------

Reject duplicate or overlapping error reports.

One underlying problem should produce one accepted MQM issue.

--------------------------------------------------
FINAL VALIDATION
--------------------------------------------------

Before giving the verdict ask:

1. Was the original translation objectively wrong?

2. Would most professional translators agree that this is an MQM error?

3. Does the correction clearly improve accuracy or correctness?

4. Could the original translation reasonably be considered correct?

If the answer to Question 4 is YES,

Reject.

--------------------------------------------------
TARGET SPECIFIC RULES & CONTEXT
--------------------------------------------------
Target Language: ${targetLangName} (from ${sourceLangName})

TARGET-SPECIFIC LOCALIZATION & GRAMMAR RULES (CRITICAL):
${targetSpecificRules}

${globalContextStr}

--------------------------------------------------
OUTPUT
--------------------------------------------------

Return ONLY one of the following:

accept

or

reject

Return no explanation.

Return no reasoning.

Return no additional text.`;
};

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
            comment: { type: "string", description: "Step-by-step reasoning/analysis of why this is a genuine error" },
            correction: { type: "string", description: "The suggested corrected text that should replace the offending span" },
            category: { type: "string", enum: ["accuracy", "fluency", "terminology", "style", "locale"] },
            severity: { type: "string", enum: ["minor", "major", "critical"] }
          },
          required: ["span", "comment", "correction", "category", "severity"],
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
            rationale: { type: "string", description: "Step-by-step comparison and justification for accepting or rejecting the error" },
            verdict: { type: "string", enum: ["accept", "reject"], description: "Whether the flagged error is genuine (accept) or false positive noise (reject)" }
          },
          required: ["span", "rationale", "verdict"],
          additionalProperties: false
        }
      }
    },
    required: ["verdicts"],
    additionalProperties: false
  }
};

// ── OpenAI Calling Helper with 1 retry ───────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const callOpenAI = async (messages, responseFormat, retries = 4, attempt = 1) => {
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
        timeout: 60000
      }
    );
    const content = response.data?.choices?.[0]?.message?.content;
    return JSON.parse(content);
  } catch (err) {
    const isRateLimit = err.response?.status === 429;
    const isNetworkError = !err.response || err.code === "ECONNRESET" || err.code === "ETIMEDOUT";

    if (retries > 0 && (isRateLimit || isNetworkError || err.response?.status >= 500)) {
      // Exponential backoff: attempt 1 -> 2s, attempt 2 -> 4s, attempt 3 -> 8s, attempt 4 -> 16s
      // Plus a random jitter of up to 1 second to avoid synchronization spikes
      const baseDelay = Math.pow(2, attempt) * 1000;
      const jitter = Math.random() * 1000;
      const delay = baseDelay + jitter;

      console.warn(`[MQM OpenAI API Call] Failed with status ${err.response?.status || err.code} on attempt ${attempt}. Retrying in ${Math.round(delay)}ms... Error: ${err.message}`);
      await sleep(delay);
      return callOpenAI(messages, responseFormat, retries - 1, attempt + 1);
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

    // Filter out errors where span and correction are identical
    const correction = String(err.correction || "").trim();
    if (span.toLowerCase() === correction.toLowerCase()) {
      console.log(`[MQM Filter] Discarded identical span and correction: "${span}"`);
      continue;
    }

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

  // Deduplicate errors targeting the exact same span, correction, and category
  const seenErrors = new Set();
  const uniqueErrors = [];
  for (const err of verified) {
    const key = `${err.span.toLowerCase()}|||${(err.correction || "").toLowerCase()}|||${err.category}`;
    if (!seenErrors.has(key)) {
      seenErrors.add(key);
      uniqueErrors.push(err);
    }
  }

  return uniqueErrors;
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
    const batchLimit = pLimit(2); // concurrency limit for batch calls (reduced to avoid rate limits)

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
    const limit = pLimit(2); // concurrency limit (reduced to avoid rate limits)
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
