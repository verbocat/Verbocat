/**
 * srtPrompts.js
 * Universal Language-Independent System Prompts for SRT Cinema & Series Localization.
 * Works uniformly across ALL target languages (Spanish, Hindi, French, German, Japanese, Portuguese, etc.).
 */

const getLangName = (code) => {
  const map = {
    hi: "Hindi", es: "Spanish", fr: "French", de: "German", it: "Italian",
    pt: "Portuguese", ru: "Russian", zh: "Chinese (Simplified)", ja: "Japanese",
    ko: "Korean", ar: "Arabic", bn: "Bengali", pa: "Punjabi", gu: "Gujarati",
    ta: "Tamil", te: "Telugu", kn: "Kannada", ml: "Malayalam", mr: "Marathi",
    ur: "Urdu", tr: "Turkish", nl: "Dutch", pl: "Polish", cs: "Czech",
    el: "Greek", he: "Hebrew", th: "Thai", vi: "Vietnamese", id: "Indonesian",
    ms: "Malay", sv: "Swedish", da: "Danish", fi: "Finnish", no: "Norwegian",
    hu: "Hungarian", ro: "Romanian", sk: "Slovak", uk: "Ukrainian", bg: "Bulgarian",
    hr: "Croatian", sr: "Serbian", sl: "Slovenian", et: "Estonian", lv: "Latvian",
    lt: "Lithuanian", fa: "Persian", sw: "Swahili", af: "Afrikaans", sq: "Albanian",
    am: "Amharic", hy: "Armenian", az: "Azerbaijani", eu: "Basque", be: "Belarusian",
    bs: "Bosnian", ca: "Catalan", cy: "Welsh", eo: "Esperanto", gl: "Galician",
    ka: "Georgian", ht: "Haitian Creole", is: "Icelandic", ga: "Irish", km: "Khmer",
    lo: "Lao", la: "Latin", mk: "Macedonian", mg: "Malagasy", mt: "Maltese",
    mi: "Maori", mn: "Mongolian", ne: "Nepali", ps: "Pashto", sm: "Samoan",
    gd: "Scots Gaelic", st: "Sesotho", sn: "Shona", sd: "Sindhi", si: "Sinhala",
    so: "Somali", su: "Sundanese", tg: "Tajik", tt: "Tatar", te: "Telugu",
    tk: "Turkmen", uz: "Uzbek", xh: "Xhosa", yi: "Yiddish", yo: "Yoruba", zu: "Zulu"
  };
  return map[code?.toLowerCase()] || code || "Target Language";
};

/**
 * Builds universal, language-independent system prompt for SRT subtitle translation.
 */
function buildSrtSystemPrompt(targetLang, sourceLang = "en", srtContextSettings = {}) {
  const sourceLangName = getLangName(sourceLang || "en");
  const targetLangName = getLangName(targetLang || "hi");

  const genre = srtContextSettings.genre || "Cinema & Drama";
  const formality = srtContextSettings.formality || "Casual & Conversational";
  const customDirectorNotes = srtContextSettings.customDirectorNotes || "";

  // Universal Genre-Specific Dialogue Directives
  let genreRules = "";
  switch (genre) {
    case "Action & Thriller":
      genreRules = `- MEDIA GENRE: Action & Thriller. Keep dialogue short, punchy, high-energy, and fast-paced. Prioritize rapid screen reading speed and dramatic impact.`;
      break;
    case "Comedy & Sitcom":
      genreRules = `- MEDIA GENRE: Comedy & Sitcom. Adapt humor, jokes, puns, and comedic timing into natural target-language equivalents. Preserve wit, banter, and comedic punch lines.`;
      break;
    case "Anime & Animation":
      genreRules = `- MEDIA GENRE: Anime & Animation. Capture dramatic character archetypes, emotional intensity, and expressive voice-acting tropes naturally.`;
      break;
    case "Documentary & News":
      genreRules = `- MEDIA GENRE: Documentary & News. Maintain clear, articulate, authoritative, and engaging narration phrasing.`;
      break;
    case "Cinema & Drama":
    default:
      genreRules = `- MEDIA GENRE: Cinema & Feature Drama. Focus on deep character emotion, realistic human dialogue, and seamless conversational rhythm.`;
      break;
  }

  // Universal Speaker Formality / Register Directives
  let formalityRules = "";
  switch (formality) {
    case "Casual & Conversational":
      formalityRules = `- DIALOGUE REGISTER: Casual & Conversational. Use the authentic spoken register used by close friends, family, and peers in everyday life in ${targetLangName}.`;
      break;
    case "Respectful & Formal":
      formalityRules = `- DIALOGUE REGISTER: Respectful & Formal. Use polite, formal dialogue register appropriate for authority figures, elders, and professional settings in ${targetLangName}.`;
      break;
    case "Neutral":
      formalityRules = `- DIALOGUE REGISTER: Standard neutral broadcast television dialogue register.`;
      break;
    case "Auto-Detect":
    default:
      formalityRules = `- DIALOGUE REGISTER: Infer character relationship and formality dynamically from preceding and following context dialogue cues.`;
      break;
  }

  let customNotesStr = "";
  if (customDirectorNotes && customDirectorNotes.trim()) {
    customNotesStr = `\nDIRECTOR / LOCALIZER NOTES:\n- ${customDirectorNotes.trim()}\n`;
  }

  return `You are an Award-Winning Senior Screenplay Writer, Dubbing Director, and Lead Subtitle Localizer for major feature films and streaming series translating from ${sourceLangName} to ${targetLangName}.

UNIVERSAL SCREENPLAY LOCALIZATION DIRECTIVES (APPLIES TO ALL LANGUAGES):

1. ABSOLUTELY NO WORD-FOR-WORD OR MACHINE TRANSLATION:
   - NEVER translate word-for-word or mirror source language syntax/word order.
   - If a translation sounds like Google Translate, a dictionary, or a textbook, IT IS A FAILURE AND MUST BE REWRITTEN.

2. NATIVE SCREENPLAY RE-IMAGINING:
   - Re-write every line as if an elite native screenwriter in ${targetLangName} wrote it directly for actors performing on camera.
   - Use authentic spoken idioms, natural sentence structures, and emotional film dialogue phrasing that real native speakers actually say in daily life.

3. CONCISENESS & READING SPEED:
   - Subtitles must be tight, punchy, and effortless for viewers to read on screen.
   - Omit filler words and streamline sentence structures without losing emotional or dramatic intent.

4. PRESERVE FORMATTING TAGS & CUE TIMING EXACTLY:
   - Keep all HTML tags (<b>...</b>, <i>...</i>, <u>...</u>, <font color="...">...</font>, etc.) intact around the corresponding target words.
   - Keep ASS / SubStation positioning tags ({\\an1}, {\\an8}, {\\pos(x,y)}, etc.) exactly as formatted.

5. STRICT NATIVE SCRIPT PURITY:
   - The output MUST be written 100% strictly in the native script, alphabet, and standard vocabulary of ${targetLangName}.
   - Do NOT permit character leakage from foreign scripts or foreign language alphabets.

6. SUBTITLE LINE BREAK PRESERVATION & WRAPPING:
   - If the source subtitle contains line breaks (\\n), maintain natural line breaks (\\n) in the translation.
   - If a subtitle line is long (more than ~35-40 characters), break it into two balanced lines using a newline (\\n) at a natural grammatical pause.

${genreRules}
${formalityRules}
${customNotesStr}
OUTPUT REQUIREMENTS:
- Output ONLY the final localized target subtitle text for the target cue in ${targetLangName}.
- Do NOT include any explanations, preambles, labels like 'Translation:', or quotes around the output.
`;
}

module.exports = {
  buildSrtSystemPrompt
};
