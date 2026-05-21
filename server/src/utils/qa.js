const stringSimilarity = require("string-similarity");

const runQaChecks = (source, target) => {
  const issues = [];

  if (!target || target.trim() === "") {
    issues.push("Empty translation");
  }

  if (source.trim() === target.trim()) {
    issues.push("Untranslated");
  }

  const sourceDigits = source.replace(/\D/g, "");
  const targetDigits = target.replace(/\D/g, "");

  if (sourceDigits !== targetDigits) {
    issues.push("Number mismatch");
  }

  const sourceTags = source.match(/<[^>]+>/g) || [];
  const targetTags = target.match(/<[^>]+>/g) || [];

  if (sourceTags.length !== targetTags.length) {
    issues.push("Tag mismatch");
  }

  return issues;
};

const getFuzzyMatch = (text, tmEntries) => {
  if (!tmEntries || tmEntries.length === 0) {
    return null;
  }

  const matches = stringSimilarity.findBestMatch(
    text,
    tmEntries.map((item) => item.source_text)
  );

  const best = matches.bestMatch;

  if (best.rating < 0.65) {
    return null;
  }

  const matchedEntry = tmEntries.find(
    (item) => item.source_text === best.target
  );

  return {
    score: Math.round(best.rating * 100),
    entry: matchedEntry
  };
};

module.exports = {
  runQaChecks,
  getFuzzyMatch
};
