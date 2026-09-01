# Translation Quality and Script Purity Rules

- When performing translations or audits, never permit character or script leakages from other languages (e.g. Devanagari script must not contain any Perso-Arabic / Urdu characters like `[\u0600-\u06FF]`).
- The generated translation output must strictly match the target language script and vocabulary.
- If a translation contains foreign characters of a script that does not match the target language (e.g. Cyrillic in Spanish, Devanagari in English, or Arabic in Hindi), the translation must be discarded/rejected and fallback to the original source text.

# Critical AI Safety & Architecture Security Rules

> [!CRITICAL_CONSTRAINT_DO_NOT_REMOVE]
> ANY AI ASSISTANT WORKING ON THIS CODEBASE MUST STRICTLY OBSERVE THE FOLLOWING IMMUTABLE LAWS:

1. **Database Schema Constraint on `document_segments` (`source_text` is NOT NULL)**:
   - PostgreSQL table `document_segments` has `source_text TEXT NOT NULL`.
   - Every single `upsert` call in Node/Express routes (`translate-batch`, single segment update, bulk segment update) MUST include `source_text` in the insertion object. Omitting `source_text` causes PostgreSQL Error `23502 (null value in column "source_text" violates not-null constraint)` and silently drops all segment saves.
   - Always pre-fetch or supply `source_text` from the template segment map (`where target_lang IS NULL`) if missing.

2. **Multi-Tenancy Target Language Partitioning**:
   - Document upload creates template segments with `target_lang = NULL`.
   - Saving or translating segments for a specific target language (e.g., `ar`, `hi`, `es`) MUST insert/update distinct rows with `target_lang = '<language_code>'`.
   - NEVER alter or overwrite template rows where `target_lang IS NULL` when performing target language translations or edits.

3. **1-Based Indexing Standard**:
   - `segment_index` in `document_segments` and `segment.id` on client are 1-indexed (1, 2, ..., N).
   - NEVER subtract 1 from `segment_index` when writing or querying database segment rows.

4. **Client-Side Auto-Save & Document Resolution**:
   - In `client/src/App.jsx`, `flushPendingBulkSave` must always resolve `activeDocId` from `documentId || currentRoute.fileId` to prevent silent auto-save aborts during route navigation.
   - Post-translation batch completions MUST explicitly flush all translated segments via `persistBulkSegmentUpdates(segments, true)`.

5. **Strict Post-Content Scope & Skip-Link Exclusion**:
   - Global site template parts (headers, footers, navigation, theme credits) and accessibility skip-links (`Skip to content`, `.screen-reader-text`, `wp-block-skip-link`) must NEVER be extracted as translatable document segments.
   - Translatable document segments must strictly map 1-to-1 to the actual post content blocks and title (`post_title` + `post_content`). Any extraction of skip links or header/footer parts creates a 1+ row index shift between source and target columns and breaks CAT alignment.


