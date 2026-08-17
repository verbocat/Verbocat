/**
 * srtPolishPipeline.js
 * Two-pass "Cinematic Polish" pipeline for SRT subtitle translation.
 * Pass 1: Individual cue translation with sliding window.
 * Pass 2: Conversational dialogue smoothing over consecutive subtitle blocks.
 */

const { isScriptValidForLanguage } = require("../services/translationProviders");

/**
 * Runs Pass 2 (Cinematic Polish) over a block of draft-translated subtitle segments.
 * Smooths dialogue flow across consecutive cues while preserving inline tags.
 * 
 * @param {Array} segments Array of [{ id, source, target }]
 * @param {Object} srtContextSettings UI settings
 * @param {string} targetLang Target language code (e.g., 'hi')
 * @param {Function} aiCaller Function to execute AI prompt completion
 */
async function runTwoPassSrtPolish(segments, srtContextSettings = {}, targetLang = "hi", aiCaller = null) {
  if (!segments || segments.length === 0 || typeof aiCaller !== "function") {
    return segments;
  }

  console.log(`[SRT_POLISH_PIPELINE] Running Pass 2 (Cinematic Dialogue Polish) on ${segments.length} segments for target '${targetLang}'...`);

  // Process segments in conversational blocks of 6-8 cues
  const POLISH_BLOCK_SIZE = 6;
  const polishedSegments = [...segments];

  for (let i = 0; i < segments.length; i += POLISH_BLOCK_SIZE) {
    const block = segments.slice(i, i + POLISH_BLOCK_SIZE);
    
    // Construct block string for Pass 2 refinement
    let blockInput = "";
    block.forEach((seg, idx) => {
      blockInput += `Cue #${i + idx + 1}:\nSource: ${seg.source}\nDraft Target: ${seg.target}\n\n`;
    });

    const polishSystemPrompt = `You are an Award-Winning Senior Screenwriter, Dubbing Director, and Lead Subtitle Localizer for major feature films and Netflix series in target language: ${targetLang}.

YOUR TASK:
Review and REWRITE the draft translated subtitle sequence below into 100% natural, expressive, conversational movie dialogue.

CRITICAL REWRITE DIRECTIVES:
1. ELIMINATE LITERAL STIFFNESS: The draft translations below were generated line-by-line and sound like rigid, robotic AI machine translation. REWRITE THEM so actors would naturally speak them on camera in a blockbuster film.
2. SPOKEN DUBBING REGISTER: Use modern conversational phrasing, spoken idioms, and authentic sentence structures native to real film/series dubbing.
3. CONVERSATIONAL SCENE FLOW: Ensure the dialogue flows smoothly from cue to cue across the conversation.
4. FORMATTING & TIMING TAGS: Preserve ALL inline tags (<b>, <i>, <u>, <font color="...">, {\\an8}, etc.) intact around the matching target words.
5. SCRIPT PURITY: Write strictly in the native script of ${targetLang} (for Hindi 'hi', strictly Devanagari script without Perso-Arabic / Urdu character leakage).

INPUT FORMAT:
List of subtitle cues with Source and Draft Target.

OUTPUT FORMAT:
Return ONLY a valid JSON array of strings containing the final polished target text for each cue in exact order:
["Polished Subtitle Cue 1", "Polished Subtitle Cue 2", ...]
Do NOT include any markdown text, explanations, or labels outside the JSON array. Output JSON array only.`;

    try {
      const responseText = await aiCaller(polishSystemPrompt, blockInput);
      if (!responseText) continue;

      // Extract JSON array from response
      const jsonMatch = responseText.match(/\[\s*[\s\S]*\s*\]/);
      if (jsonMatch) {
        const polishedList = JSON.parse(jsonMatch[0]);
        if (Array.isArray(polishedList) && polishedList.length === block.length) {
          block.forEach((seg, idx) => {
            const polishedText = String(polishedList[idx] || "").trim();
            // Validate script purity before applying polished version
            if (polishedText && isScriptValidForLanguage(polishedText, targetLang, seg.source)) {
              polishedSegments[i + idx] = {
                ...seg,
                target: polishedText,
                polished: true
              };
            }
          });
        }
      }
    } catch (err) {
      console.warn(`[SRT_POLISH_WARN] Pass 2 polish failed for block starting at index ${i}:`, err.message);
    }
  }

  console.log(`[SRT_POLISH_PIPELINE] Pass 2 (Cinematic Dialogue Polish) complete.`);
  return polishedSegments;
}

module.exports = {
  runTwoPassSrtPolish
};
