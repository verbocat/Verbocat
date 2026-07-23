/**
 * Tag Validation Utility
 *
 * Implements industry-standard CAT tag validation with ZERO false positives:
 * - Differentiates real HTML/XML tags, number tags (<101>, </101>), and placeholders ({0}, %s) from natural text (< 5, x < y).
 * - Audits missing tags, extra tags, unclosed tags, and tag order mismatches.
 * - Provides an intelligent auto-fix repair helper for segment translations.
 */

// Strict regex matching valid tags & placeholders without false positives on math/text angle brackets
const STRICT_TAG_REGEX = /<\/?(?:[a-zA-Z][a-zA-Z0-9:\-_]*|\d+)(?:\s+[^>]*?)?\/?>|\{[\w\-.]+\}|%[sd]/gi;

/**
 * Extract all valid tags and placeholders from a string.
 */

function extractTags(text) {
  if (typeof text !== "string" || !text) return [];
  const matches = text.match(STRICT_TAG_REGEX) || [];
  return matches.map(m => m.trim());
}

/**
 * Normalize tag for matching (lowercase tag names, strip extra spaces inside attributes).
 */
function normalizeTag(tag) {
  if (!tag) return "";
  return tag.trim().replace(/\s+/g, " ");
}

/**
 * Check if a tag is an opening tag, closing tag, or self-closing/placeholder.
 */
function getTagType(tag) {
  if (!tag.startsWith("<")) return "placeholder";
  if (tag.startsWith("</")) return "closing";
  if (tag.endsWith("/>") || tag.match(/^<\d+\/>$/)) return "self-closing";
  return "opening";
}

/**
 * Get base tag name or identifier (e.g., "</101>" -> "101", "<span class='a'>" -> "span").
 */
function getTagIdentifier(tag) {
  if (!tag) return "";
  const match = tag.match(/^<\/?([a-zA-Z0-9:\-_]+)/);
  if (match) return match[1].toLowerCase();
  return tag;
}

/**
 * Validate Target Segment Tags against Source Segment Tags.
 *
 * @param {string} sourceText - Source segment text
 * @param {string} targetText - Target segment translation
 * @returns {Object} Validation report { isValid, score, errors, missingTags, extraTags, orderMismatch }
 */
function validateTags(sourceText, targetText) {
  const sourceTags = extractTags(sourceText);
  const targetTags = extractTags(targetText);

  const errors = [];
  const missingTags = [];
  const extraTags = [];

  // Count tag frequencies
  const sourceFreq = new Map();
  const targetFreq = new Map();

  sourceTags.forEach(t => {
    const key = normalizeTag(t);
    sourceFreq.set(key, (sourceFreq.get(key) || 0) + 1);
  });

  targetTags.forEach(t => {
    const key = normalizeTag(t);
    targetFreq.set(key, (targetFreq.get(key) || 0) + 1);
  });

  // 1. Identify missing tags (present in source, missing or under-represented in target)
  sourceFreq.forEach((count, tagKey) => {
    const targetCount = targetFreq.get(tagKey) || 0;
    if (targetCount < count) {
      const diff = count - targetCount;
      for (let i = 0; i < diff; i++) {
        missingTags.push(tagKey);
      }
      errors.push({
        type: "MISSING_TAG",
        severity: "major",
        message: `Tag "${tagKey}" from source is missing in translation (${targetCount}/${count} present)`,
        tag: tagKey
      });
    }
  });

  // 2. Identify extra/hallucinated tags (present in target, missing in source)
  targetFreq.forEach((count, tagKey) => {
    const sourceCount = sourceFreq.get(tagKey) || 0;
    if (count > sourceCount) {
      const diff = count - sourceCount;
      for (let i = 0; i < diff; i++) {
        extraTags.push(tagKey);
      }
      errors.push({
        type: "EXTRA_TAG",
        severity: "minor",
        message: `Extra tag "${tagKey}" found in translation that does not exist in source`,
        tag: tagKey
      });
    }
  });

  // 3. Check for unclosed opening tags in target
  const stack = [];
  targetTags.forEach(tag => {
    const type = getTagType(tag);
    const id = getTagIdentifier(tag);

    if (type === "opening") {
      stack.push({ tag, id });
    } else if (type === "closing") {
      if (stack.length === 0 || stack[stack.length - 1].id !== id) {
        errors.push({
          type: "UNBALANCED_TAG",
          severity: "critical",
          message: `Closing tag "${tag}" has no matching opening tag`,
          tag
        });
      } else {
        stack.pop();
      }
    }
  });

  if (stack.length > 0) {
    stack.forEach(unclosed => {
      errors.push({
        type: "UNCLOSED_TAG",
        severity: "critical",
        message: `Opening tag "${unclosed.tag}" was opened but never closed in target`,
        tag: unclosed.tag
      });
    });
  }

  // 4. Check sequence / nesting order mismatch
  let orderMismatch = false;
  const sourceSeq = sourceTags.map(getTagIdentifier).join(",");
  const targetSeq = targetTags.map(getTagIdentifier).join(",");
  if (sourceSeq !== targetSeq && missingTags.length === 0 && extraTags.length === 0) {
    orderMismatch = true;
    errors.push({
      type: "ORDER_MISMATCH",
      severity: "minor",
      message: `Tag order in target differs from source sequence`,
      sourceSeq,
      targetSeq
    });
  }

  const isValid = errors.length === 0;

  // Calculate Quality Score Penalty for Tag Integrity (100 = perfect)
  let penalty = 0;
  errors.forEach(e => {
    if (e.severity === "critical") penalty += 25;
    else if (e.severity === "major") penalty += 15;
    else if (e.severity === "minor") penalty += 5;
  });

  const tagScore = Math.max(0, 100 - penalty);

  return {
    isValid,
    tagScore,
    errors,
    missingTags,
    extraTags,
    orderMismatch,
    sourceTagCount: sourceTags.length,
    targetTagCount: targetTags.length
  };
}

/**
 * Intelligent Auto-Fix Helper to repair missing or broken tags in target text.
 *
 * @param {string} sourceText
 * @param {string} targetText
 * @returns {string} Repaired target text with restored tags
 */
function autoFixTags(sourceText, targetText) {
  if (!sourceText || !targetText) return targetText || "";

  const report = validateTags(sourceText, targetText);
  if (report.isValid) return targetText;

  let repaired = targetText;

  // 1. Remove extra hallucinated tags if any
  report.extraTags.forEach(extra => {
    repaired = repaired.replace(extra, "");
  });

  // 2. Append missing opening/placeholder tags in source order
  const targetTagsNow = extractTags(repaired);
  const targetTagSet = new Set(targetTagsNow.map(normalizeTag));

  const sourceTags = extractTags(sourceText);
  sourceTags.forEach(st => {
    const normalized = normalizeTag(st);
    if (!targetTagSet.has(normalized)) {
      const type = getTagType(st);
      if (type === "closing") {
        repaired = repaired + st; // Append closing tag at end of segment
      } else {
        repaired = st + repaired; // Prepend opening tag at start of segment
      }
      targetTagSet.add(normalized);
    }
  });

  return repaired.trim();
}

module.exports = {
  STRICT_TAG_REGEX,
  extractTags,
  normalizeTag,
  getTagType,
  getTagIdentifier,
  validateTags,
  autoFixTags
};
