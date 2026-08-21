const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { parseFile: parseDocx } = require('./parsers/docxParser');
const { parseFile: parseHtml } = require('./parsers/htmlParser');
const { parseFile: parsePdf } = require('./parsers/pdfParser');

const DOMAINS = ["General", "Marketing", "Legal", "Medical", "Pharmaceutical", "Financial", "Banking", "Insurance", "Technical", "Software", "IT & Cybersecurity", "E-commerce", "Automotive", "Manufacturing", "Engineering", "Telecommunications", "Gaming", "Education", "Government", "HR & Recruitment", "Travel & Tourism", "Hospitality", "Retail", "Energy & Utilities", "Real Estate", "Life Sciences", "Healthcare", "Aerospace", "Agriculture", "Media & Entertainment"];
const CONTENT_TYPES = ["General", "Landing Page", "Product Page", "Advertisement", "Email Campaign", "Sales Brochure", "Social Media Post", "UI Strings", "Help Center", "User Guide", "Documentation", "Release Notes", "Knowledge Base", "Contract", "NDA", "Terms of Service", "Privacy Policy", "Compliance Document", "Clinical Trial", "IFU", "Patient Information", "Medical Report", "Website", "Blog", "Article", "Presentation", "Training Material", "Internal Communication"];
const AUDIENCES = ["General", "Consumers", "Small Business Owners", "Enterprise Buyers", "Patients", "Caregivers", "End Users", "Developers", "Administrators"];
const PURPOSES = ["General", "Generate Leads", "Drive Purchases", "Build Trust", "Increase Signups", "Inform", "Educate", "Train", "Comply", "Protect Rights", "Resolve Issues", "Reduce Support Tickets", "SEO"];
const TONES = ["General", "Persuasive", "Professional", "Friendly", "Formal", "Precise", "Reassuring", "Clear", "Concise", "Casual", "Engaging"];
const FORMALITIES = ["Very Formal", "Formal", "Neutral", "Informal", "Very Informal"];
const STRICTNESS = ["Flexible", "Balanced", "Strict"];

/**
 * Low-Cost Intelligent Content Sampler
 * Extracts ~1400 characters from beginning, random middle sections, and end of document.
 * Total token budget: ~350-400 tokens max!
 */
function extractLowCostSample(text) {
  if (!text || typeof text !== 'string') return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 1500) return clean;

  const totalLen = clean.length;
  const head = clean.substring(0, 500);
  const pos1 = Math.floor(totalLen * 0.25);
  const mid1 = clean.substring(pos1, pos1 + 300);
  const pos2 = Math.floor(totalLen * 0.75);
  const mid2 = clean.substring(pos2, pos2 + 300);
  const tail = clean.substring(totalLen - 300);

  return `[DOCUMENT START]\n${head}\n\n[SAMPLE SECTION 1]\n${mid1}\n\n[SAMPLE SECTION 2]\n${mid2}\n\n[DOCUMENT END]\n${tail}`;
}

/**
 * Reads text content from a reference file (.docx, .pdf, .html, .txt, .md, .csv)
 */
async function extractTextFromReferenceFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let fullText = '';

  try {
    if (ext === '.docx') {
      const parsed = await parseDocx(filePath);
      fullText = (parsed.segments || []).map(s => s.source).join(' ');
    } else if (ext === '.pdf') {
      const parsed = await parsePdf(filePath);
      fullText = (parsed.segments || []).map(s => s.source).join(' ');
    } else if (['.html', '.htm'].includes(ext)) {
      const parsed = await parseHtml(filePath);
      fullText = (parsed.segments || []).map(s => s.source).join(' ');
    } else {
      fullText = fs.readFileSync(filePath, 'utf-8');
    }
  } catch (err) {
    console.error('Failed to parse reference file for sampling:', err);
    try {
      fullText = fs.readFileSync(filePath, 'utf-8');
    } catch (_) {}
  }

  return fullText;
}

/**
 * Heuristic fallback for domain detection if LLM API is unavailable
 */
function heuristicDomainDetect(sampledText) {
  const text = sampledText.toLowerCase();
  if (/interest|bank|loan|sanction|mortgage|credit|debit|borrower|repayment/.test(text)) {
    return "Banking";
  }
  if (/contract|agreement|clause|indemnify|jurisdiction|whereas|party|pursuant/.test(text)) {
    return "Legal";
  }
  if (/patient|clinical|trial|medical|diagnosis|doctor|hospital|symptom/.test(text)) {
    return "Medical";
  }
  if (/software|ui|button|api|database|user|login|code|component/.test(text)) {
    return "Software";
  }
  if (/sale|discount|buy|product|shop|offer|brand|marketing/.test(text)) {
    return "Marketing";
  }
  return "General";
}

/**
 * Extracts AI Reference Context and ALL Context Variables at ultra-low API token cost.
 */
async function analyzeReferenceContext(filePath, filename = '') {
  const rawText = await extractTextFromReferenceFile(filePath);
  const sampledText = extractLowCostSample(rawText);
  const detectedHeuristicDomain = heuristicDomainDetect(sampledText);

  const defaultRes = {
    domain: detectedHeuristicDomain,
    contentType: "General",
    audience: "General",
    purpose: "General",
    tone: "Formal",
    formality: "Formal",
    terminologyStrictness: "Strict",
    referenceContext: `Domain: ${detectedHeuristicDomain}. Tone: Formal. Document: ${filename}`,
    customPrompt: `Maintain formal ${detectedHeuristicDomain.toLowerCase()} terminology and binding professional tone.`
  };

  if (!rawText || rawText.trim().length === 0) return defaultRes;

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
  if (!OPENAI_API_KEY) {
    console.log("[REFERENCE SAMPLER] OpenAI API key missing, using heuristic detection:", detectedHeuristicDomain);
    return defaultRes;
  }

  const prompt = `Analyze this sampled text from a translation reference document/style guide ("${filename}"):
---
${sampledText}
---
Classify the document into context variables. Respond ONLY with a valid JSON object matching this schema:
{
  "domain": (select best match from ${JSON.stringify(DOMAINS)}),
  "contentType": (select best match from ${JSON.stringify(CONTENT_TYPES)}),
  "audience": (select best match from ${JSON.stringify(AUDIENCES)}),
  "purpose": (select best match from ${JSON.stringify(PURPOSES)}),
  "tone": (select best match from ${JSON.stringify(TONES)}),
  "formality": (select best match from ${JSON.stringify(FORMALITIES)}),
  "terminologyStrictness": (select best match from ${JSON.stringify(STRICTNESS)}),
  "referenceContext": "3 bullet point summary of Domain, Tone, and Key Terminology",
  "customPrompt": "2-3 sentence style and translation instruction prompt for translators"
}`;

  try {
    const openAiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a translation context detection system. Output strictly raw JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 25000
      }
    );

    const content = openAiResponse.data?.choices?.[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      const domainVal = DOMAINS.includes(parsed.domain) ? parsed.domain : detectedHeuristicDomain;
      return {
        domain: domainVal,
        contentType: CONTENT_TYPES.includes(parsed.contentType) ? parsed.contentType : "General",
        audience: AUDIENCES.includes(parsed.audience) ? parsed.audience : "General",
        purpose: PURPOSES.includes(parsed.purpose) ? parsed.purpose : "General",
        tone: TONES.includes(parsed.tone) ? parsed.tone : "Formal",
        formality: FORMALITIES.includes(parsed.formality || parsed.formalities) ? (parsed.formality || parsed.formalities) : "Formal",
        terminologyStrictness: STRICTNESS.includes(parsed.terminologyStrictness) ? parsed.terminologyStrictness : "Strict",
        referenceContext: parsed.referenceContext || parsed.customPrompt || `Domain: ${domainVal}. Tone: Formal.`,
        customPrompt: parsed.customPrompt || parsed.referenceContext || `Maintain formal ${domainVal.toLowerCase()} terminology.`
      };
    }
  } catch (err) {
    console.error('[REFERENCE SAMPLER ERROR] OpenAI call failed:', err.message);
  }

  return defaultRes;
}

/**
 * Analyzes raw document text/segments directly to detect context variables
 */
async function analyzeDocumentTextContext(rawText, docName = '') {
  const sampledText = extractLowCostSample(rawText);
  const detectedHeuristicDomain = heuristicDomainDetect(sampledText);

  const defaultRes = {
    domain: detectedHeuristicDomain,
    contentType: "General",
    audience: "General",
    purpose: "General",
    tone: "Formal",
    formality: "Formal",
    terminologyStrictness: "Strict",
    referenceContext: `Domain: ${detectedHeuristicDomain}. Tone: Formal. Document: ${docName}`,
    customPrompt: `Maintain formal ${detectedHeuristicDomain.toLowerCase()} terminology and binding professional tone.`
  };

  if (!rawText || rawText.trim().length === 0) return defaultRes;

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
  if (!OPENAI_API_KEY) {
    console.log("[REFERENCE SAMPLER] OpenAI API key missing, using heuristic detection:", detectedHeuristicDomain);
    return defaultRes;
  }

  const prompt = `Analyze this sampled text from a document ("${docName}"):
---
${sampledText}
---
Classify the document into translation context settings. Respond ONLY with a valid JSON object matching this schema:
{
  "domain": (select best match from ${JSON.stringify(DOMAINS)}),
  "contentType": (select best match from ${JSON.stringify(CONTENT_TYPES)}),
  "audience": (select best match from ${JSON.stringify(AUDIENCES)}),
  "purpose": (select best match from ${JSON.stringify(PURPOSES)}),
  "tone": (select best match from ${JSON.stringify(TONES)}),
  "formality": (select best match from ${JSON.stringify(FORMALITIES)}),
  "terminologyStrictness": (select best match from ${JSON.stringify(STRICTNESS)}),
  "referenceContext": "3 bullet point summary of Domain, Tone, and Key Terminology",
  "customPrompt": "2-3 sentence style and translation instruction prompt for translators"
}`;

  try {
    const openAiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a translation context detection system. Output strictly raw JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 25000
      }
    );

    const content = openAiResponse.data?.choices?.[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      const domainVal = DOMAINS.includes(parsed.domain) ? parsed.domain : detectedHeuristicDomain;
      return {
        domain: domainVal,
        contentType: CONTENT_TYPES.includes(parsed.contentType) ? parsed.contentType : "General",
        audience: AUDIENCES.includes(parsed.audience) ? parsed.audience : "General",
        purpose: PURPOSES.includes(parsed.purpose) ? parsed.purpose : "General",
        tone: TONES.includes(parsed.tone) ? parsed.tone : "Formal",
        formality: FORMALITIES.includes(parsed.formality || parsed.formalities) ? (parsed.formality || parsed.formalities) : "Formal",
        terminologyStrictness: STRICTNESS.includes(parsed.terminologyStrictness) ? parsed.terminologyStrictness : "Strict",
        referenceContext: parsed.referenceContext || parsed.customPrompt || `Domain: ${domainVal}. Tone: Formal.`,
        customPrompt: parsed.customPrompt || parsed.referenceContext || `Maintain formal ${domainVal.toLowerCase()} terminology.`
      };
    }
  } catch (err) {
    console.error('[REFERENCE SAMPLER ERROR] OpenAI call failed:', err.message);
  }

  return defaultRes;
}

module.exports = {
  extractLowCostSample,
  extractTextFromReferenceFile,
  analyzeReferenceContext,
  analyzeDocumentTextContext,
  heuristicDomainDetect
};
