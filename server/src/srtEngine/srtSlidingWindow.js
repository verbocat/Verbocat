/**
 * srtSlidingWindow.js
 * Builds multi-cue sliding context windows for SRT subtitle translation.
 * Preserves strict 1-to-1 subtitle cue order and chronological timeline.
 */

const normalizeCueText = (text) => String(text || "").trim();

/**
 * Builds a sliding window payload for segment at targetIndex.
 * @param {Array} segments Array of subtitle segment objects [{ id, source, ... }]
 * @param {number} targetIndex Array index of the current subtitle cue being translated
 * @param {number} windowBefore Number of preceding cues to include as context (default 3)
 * @param {number} windowAfter Number of following cues to include as context (default 2)
 */
function buildSlidingWindowPayload(segments, targetIndex, windowBefore = 3, windowAfter = 2) {
  if (!segments || segments.length === 0 || targetIndex < 0 || targetIndex >= segments.length) {
    return {
      precedingContext: [],
      targetCue: "",
      followingContext: [],
      fullPromptText: ""
    };
  }

  const targetSeg = segments[targetIndex];
  const targetCue = normalizeCueText(targetSeg.source || targetSeg.source_text);

  // Extract preceding context cues
  const startBefore = Math.max(0, targetIndex - windowBefore);
  const precedingSegments = segments.slice(startBefore, targetIndex);
  const precedingContext = precedingSegments.map((seg, idx) => ({
    cueNum: seg.blockNum || seg.id || (startBefore + idx + 1),
    text: normalizeCueText(seg.source || seg.source_text)
  }));

  // Extract following context cues
  const endAfter = Math.min(segments.length, targetIndex + 1 + windowAfter);
  const followingSegments = segments.slice(targetIndex + 1, endAfter);
  const followingContext = followingSegments.map((seg, idx) => ({
    cueNum: seg.blockNum || seg.id || (targetIndex + 2 + idx),
    text: normalizeCueText(seg.source || seg.source_text)
  }));

  // Construct structured text format for AI prompt
  let fullPromptText = "";

  if (precedingContext.length > 0) {
    fullPromptText += "[PRECEDING DIALOGUE CONTEXT - DO NOT TRANSLATE THESE LINES]\n";
    precedingContext.forEach(c => {
      fullPromptText += `Cue #${c.cueNum}: ${c.text}\n`;
    });
    fullPromptText += "\n";
  }

  fullPromptText += "[TARGET SUBTITLE TO TRANSLATE - TRANSLATE ONLY THIS LINE]\n";
  fullPromptText += `Cue #${targetSeg.blockNum || targetSeg.id || (targetIndex + 1)}: ${targetCue}\n\n`;

  if (followingContext.length > 0) {
    fullPromptText += "[FOLLOWING DIALOGUE CONTEXT - DO NOT TRANSLATE THESE LINES]\n";
    followingContext.forEach(c => {
      fullPromptText += `Cue #${c.cueNum}: ${c.text}\n`;
    });
  }

  return {
    precedingContext,
    targetCue,
    followingContext,
    fullPromptText
  };
}

module.exports = {
  buildSlidingWindowPayload
};
