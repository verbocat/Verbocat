# Translation Quality and Script Purity Rules

- When performing translations or audits, never permit character or script leakages from other languages (e.g. Devanagari script must not contain any Perso-Arabic / Urdu characters like `[\u0600-\u06FF]`).
- The generated translation output must strictly match the target language script and vocabulary.
- If a translation contains foreign characters of a script that does not match the target language (e.g. Cyrillic in Spanish, Devanagari in English, or Arabic in Hindi), the translation must be discarded/rejected and fallback to the original source text.
