/**
 * Universal Sentence Splitter for Centroid TMS
 * Splits multi-sentence paragraphs into clean, bite-sized sentence segments (~15-35 words max)
 * while preserving layout structure for DOCX, HTML, TXT, PPTX, XLSX, and PDF documents.
 */

function splitTextIntoSentences(text, maxWords = 35) {
  if (!text || typeof text !== "string") return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Short segments (<= 35 words or <= 150 chars) don't need splitting
  const wordTokens = trimmed.split(/\s+/).filter(Boolean);
  if (wordTokens.length <= maxWords || trimmed.length <= 150) {
    return [trimmed];
  }

  // 1. Primary sentence boundary splitting: . ! ? | \n
  const rawChunks = trimmed.split(/(?<=[.!?|])\s+|\n+/g).map(s => s.trim()).filter(Boolean);

  const finalSegments = [];

  for (const chunk of rawChunks) {
    const chunkWords = chunk.split(/\s+/).filter(Boolean);
    
    if (chunkWords.length <= maxWords) {
      finalSegments.push(chunk);
    } else {
      // Sub-split very long sentences by clause boundaries (commas, semicolons, dashes) or maxWords limit
      let currentAcc = [];
      for (const word of chunkWords) {
        currentAcc.push(word);
        if (currentAcc.length >= maxWords || (currentAcc.length >= 18 && /[,;:—–]$/.test(word))) {
          finalSegments.push(currentAcc.join(" "));
          currentAcc = [];
        }
      }
      if (currentAcc.length > 0) {
        finalSegments.push(currentAcc.join(" "));
      }
    }
  }

  return finalSegments.length > 0 ? finalSegments : [trimmed];
}

module.exports = {
  splitTextIntoSentences
};
