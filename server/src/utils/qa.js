const stringSimilarity = require("string-similarity");

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
  getFuzzyMatch
};

