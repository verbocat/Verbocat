const isCountableSourceText = (text) => {
  if (!text) return false;

  const clean = String(text)
    .replace(/__TAG_\d+__/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return false;
  if (!/[\p{L}\p{N}]/u.test(clean)) return false;
  if (/^\s*@(?:page|media|import|font-face)\s*\{/i.test(clean)) return false;
  if (/(?:margin|padding|position|text-align)\s*:\s*[^;]+;/i.test(clean) && clean.includes("{") && clean.includes("}")) {
    return false;
  }

  const lower = clean.toLowerCase();
  if (lower === "waiting for translation") return false;

  return true;
};

const calculateProgress = (segments) => {
  const countableSegments = (segments || []).filter((segment) => isCountableSourceText(segment.source_text));
  const completedSegments = countableSegments.filter((segment) => String(segment.target_text || "").trim() !== "").length;
  const progress = countableSegments.length > 0 ? Math.round((completedSegments / countableSegments.length) * 100) : 0;

  return {
    progress,
    totalSegments: countableSegments.length,
    completedSegments
  };
};

module.exports = {
  isCountableSourceText,
  calculateProgress
};
