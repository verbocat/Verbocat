const { supabase } = require("../config/supabase");
const { getFuzzyMatch, runQaChecks } = require("../utils/qa");
const { translateChunk } = require("./translationProviders");

const translateSegments = async (segments, target) => {
  const results = [];

  const { data: allTmEntries } = await supabase
    .from("translation_memory")
    .select("*")
    .eq("target_lang", target);

  const sourceTexts = segments.map((segment) => segment.source);

  const { data: existingTranslations } = await supabase
    .from("translation_memory")
    .select("*")
    .in("source_text", sourceTexts)
    .eq("target_lang", target);

  const tmMap = {};
  (existingTranslations || []).forEach((item) => {
    tmMap[item.source_text] = item;
  });

  const missingSegments = [];

  segments.forEach((segment) => {
    const existing = tmMap[segment.source];

    if (existing) {
      results.push({
        id: segment.id,
        translated: existing.target_text,
        provider: "TM Database",
        qaIssues: runQaChecks(segment.source, existing.target_text)
      });
      return;
    }

    const fuzzy = getFuzzyMatch(segment.source, allTmEntries);
    if (fuzzy) {
      results.push({
        id: segment.id,
        translated: fuzzy.entry.target_text,
        provider: `Fuzzy ${fuzzy.score}%`,
        qaIssues: runQaChecks(segment.source, fuzzy.entry.target_text),
        fuzzyScore: fuzzy.score
      });
      return;
    }

    missingSegments.push(segment);
  });

  const chunkSize = 20;

  for (let index = 0; index < missingSegments.length; index += chunkSize) {
    const chunk = missingSegments.slice(index, index + chunkSize);
    const translatedChunk = await translateChunk(
      chunk.map((segment) => segment.source),
      target
    );

    const insertRows = [];

    for (let offset = 0; offset < chunk.length; offset += 1) {
      const segment = chunk[offset];
      const translated = translatedChunk[offset];

      results.push({
        id: segment.id,
        translated: translated.translated,
        provider: translated.provider,
        qaIssues: runQaChecks(segment.source, translated.translated)
      });

      insertRows.push({
        source_text: segment.source,
        target_text: translated.translated,
        source_lang: "en",
        target_lang: target,
        provider: translated.provider
      });
    }

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase
        .from("translation_memory")
        .insert(insertRows);

      if (insertError) {
        console.log("SUPABASE INSERT ERROR");
        console.log(insertError);
      }
    }
  }

  return {
    results
  };
};

module.exports = {
  translateSegments
};
