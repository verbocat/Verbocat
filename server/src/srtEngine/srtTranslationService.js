/**
 * srtTranslationService.js
 * Dedicated Translation Engine for SRT Subtitle Files.
 * Independent module completely separated from document translation pipelines.
 */

const { supabase } = require("../config/supabase");
const { buildSlidingWindowPayload } = require("./srtSlidingWindow");
const { buildSrtSystemPrompt } = require("./srtPrompts");
const { runTwoPassSrtPolish } = require("./srtPolishPipeline");
const { enqueue } = require("../services/queueManager");
const {
  createProviderState,
  isScriptValidForLanguage,
  isLegitimatelyIdentical
} = require("../services/translationProviders");

/**
 * Ensures line breaks (\n) strictly match the source subtitle cue:
 * - If source cue has NO line break (\n), target MUST NOT have line breaks (single line).
 * - If source cue HAS line breaks (\n), target MUST have matching line breaks (\n).
 */
function restoreSrtLineBreaks(sourceText, targetText) {
  if (!targetText || typeof targetText !== "string") return targetText;

  const cleanTarget = targetText.replace(/\r\n/g, "\n");
  const sourceHasLineBreak = String(sourceText || "").includes("\n");

  // 1. If source does NOT have a line break (single line cue):
  // Flatten target text into a single line (remove any unexpected \n from AI).
  if (!sourceHasLineBreak) {
    return cleanTarget.replace(/\n+/g, " ").trim();
  }

  // 2. If source DOES have line breaks:
  // If target already has line breaks, keep them as-is!
  if (cleanTarget.includes("\n")) {
    return cleanTarget.trim();
  }

  // If target missing line breaks, split target into matching lines around punctuation/midpoint
  const words = cleanTarget.trim().split(/\s+/);
  if (words.length >= 2) {
    let splitIndex = Math.floor(words.length / 2);
    for (let i = 1; i < words.length - 1; i++) {
      if (/[,\.\!;\?।|:]$/.test(words[i])) {
        splitIndex = i + 1;
        break;
      }
    }
    const line1 = words.slice(0, splitIndex).join(" ");
    const line2 = words.slice(splitIndex).join(" ");
    return `${line1}\n${line2}`;
  }

  return cleanTarget;
}

/**
 * Main translation handler for SRT subtitle files.
 */
async function translateSrtSegments(segments, targetLang, sourceLang = "en", srtContextSettings = {}, userId = null, organizationId = null) {
  if (!segments || segments.length === 0) {
    return { results: [], wordCount: 0 };
  }

  console.log(`\n========================================`);
  console.log(`[SRT_ENGINE_START] Processing ${segments.length} subtitle cues for target: "${targetLang}" | Genre: "${srtContextSettings.genre || 'Cinema & Drama'}" | Register: "${srtContextSettings.formality || 'Casual & Conversational'}"`);

  const actualSourceLang = sourceLang || "en";

  // 1. Fetch existing TM matches from database
  const uniqueSources = [...new Set(segments.map(s => s.source || s.source_text).filter(Boolean))];
  
  let existingTranslations = [];
  const CHUNK_SIZE = 50;
  for (let i = 0; i < uniqueSources.length; i += CHUNK_SIZE) {
    const chunk = uniqueSources.slice(i, i + CHUNK_SIZE);
    let tmQuery = supabase
      .from("translation_memory")
      .select("*")
      .in("source_text", chunk)
      .eq("target_lang", targetLang);
    if (organizationId) {
      tmQuery = tmQuery.eq("organization_id", organizationId);
    } else {
      tmQuery = tmQuery.is("organization_id", null);
    }
    const { data } = await tmQuery;
    if (data) existingTranslations.push(...data);
  }

  const tmMap = {};
  existingTranslations.forEach((item) => {
    const existing = tmMap[item.source_text];
    if (!existing || item.provider.startsWith("Linguist (ICE)") || item.created_at > existing.created_at) {
      tmMap[item.source_text] = item;
    }
  });

  // 2. Identify missing subtitle segments requiring AI translation
  const results = segments.map((seg, idx) => ({
    id: seg.id || (idx + 1),
    source: seg.source || seg.source_text || "",
    target: seg.target || seg.target_text || "",
    provider: "Draft",
    blockNum: seg.blockNum || seg.id || (idx + 1),
    timestamp: seg.timestamp || ""
  }));

  // Create provider state for model rotation
  const providerState = createProviderState();

  // Helper AI caller function for Pass 1 & Pass 2
  const callAiProvider = async (systemPrompt, userPromptText) => {
    const { callAiPrompt } = require("../services/translationProviders");
    try {
      const aiResponse = await callAiPrompt(systemPrompt, userPromptText, 0.65);
      return aiResponse ? aiResponse.trim() : "";
    } catch (err) {
      console.warn("[SRT_AI_CALL_WARN]", err.message);
      return "";
    }
  };

  // 3. Pass 1: Translate missing subtitle cues using Multi-Cue Sliding Context Windows
  let totalWordCount = 0;

  for (let i = 0; i < results.length; i++) {
    const seg = results[i];
    const sourceText = seg.source;
    if (!sourceText) continue;

    totalWordCount += sourceText.split(/\s+/).filter(Boolean).length;

    // Reuse human Linguist (ICE) matches for SRT files
    const tmMatch = tmMap[sourceText];
    if (tmMatch && tmMatch.provider && tmMatch.provider.startsWith("Linguist (ICE)") && tmMatch.target_text && isScriptValidForLanguage(tmMatch.target_text, targetLang, sourceText)) {
      seg.target = tmMatch.target_text;
      seg.provider = tmMatch.provider;
      continue;
    }

    // Build Multi-Cue Sliding Context Window
    const windowPayload = buildSlidingWindowPayload(results, i, 3, 2);
    const systemPrompt = buildSrtSystemPrompt(targetLang, actualSourceLang, srtContextSettings);

    try {
      const estimatedTokens = 800 + Math.round(windowPayload.fullPromptText.length / 4);
      
      const translatedText = await enqueue({
        type: "translation",
        estimatedTokens,
        userId,
        execute: () => callAiProvider(systemPrompt, windowPayload.fullPromptText)
      });

      const cleanTranslated = String(translatedText || "").trim();
      
      if (cleanTranslated && isScriptValidForLanguage(cleanTranslated, targetLang, sourceText)) {
        seg.target = cleanTranslated;
        seg.provider = "SRT AI Engine (Pass 1)";
      } else {
        seg.target = sourceText;
        seg.provider = "Fallback (Raw)";
      }
    } catch (err) {
      console.error(`[SRT_ENGINE_ERROR] Pass 1 translation failed for cue #${seg.id}:`, err.message);
      seg.target = sourceText;
      seg.provider = "Fallback (Error)";
    }
  }

  // 4. Pass 2: Run Cinematic Dialogue Polish over consecutive subtitle blocks
  try {
    const polishedResults = await runTwoPassSrtPolish(results, srtContextSettings, targetLang, callAiProvider);
    for (let i = 0; i < results.length; i++) {
      if (polishedResults[i] && polishedResults[i].target) {
        results[i].target = polishedResults[i].target;
        if (polishedResults[i].provider && polishedResults[i].provider !== "Fallback (Raw)") {
          results[i].provider = "SRT Cinematic Polish Engine";
        }
      }
    }
  } catch (polishErr) {
    console.warn("[SRT_ENGINE_WARN] Two-pass polish pass warning:", polishErr.message);
  }

  // 4b. Line Break Preservation & Subtitle Line Wrapping Sweep
  for (let i = 0; i < results.length; i++) {
    const seg = results[i];
    if (seg.target) {
      seg.target = restoreSrtLineBreaks(seg.source, seg.target);
    }
  }

  // 5. Save translated segments to translation_memory in background
  const memoryRows = results
    .filter(r => r.target && r.target !== r.source && r.provider && r.provider.includes("Engine"))
    .map(r => ({
      source_text: r.source,
      target_text: r.target,
      source_lang: actualSourceLang,
      target_lang: targetLang,
      provider: r.provider,
      organization_id: organizationId || null
    }));

  if (memoryRows.length > 0) {
    (async () => {
      for (const row of memoryRows) {
        let q = supabase
          .from("translation_memory")
          .select("id")
          .eq("source_text", row.source_text)
          .eq("source_lang", row.source_lang)
          .eq("target_lang", row.target_lang);
        if (row.organization_id) {
          q = q.eq("organization_id", row.organization_id);
        } else {
          q = q.is("organization_id", null);
        }
        const { data: ex } = await q.limit(1);
        if (ex && ex.length > 0) {
          await supabase.from("translation_memory").update({ target_text: row.target_text, provider: row.provider }).eq("id", ex[0].id);
        } else {
          await supabase.from("translation_memory").insert(row);
        }
      }
    })().catch(() => {});
  }

  console.log(`[SRT_ENGINE_SUCCESS] Finished processing ${results.length} subtitle cues!`);
  console.log(`========================================\n`);

  return {
    results,
    wordCount: totalWordCount
  };
}

module.exports = {
  translateSrtSegments
};
