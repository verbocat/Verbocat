/**
 * Frontend Tag Validation Utility (Zero False Positives)
 *
 * Differentiates CAT tags (<101>, </101>, <b>, </b>, <span ...>) and placeholders ({0}, %s)
 * from natural math/text angle brackets (e.g. 5 < 10, x < y, price < $100).
 */

export const STRICT_TAG_REGEX = /<\/?(?:[a-zA-Z][a-zA-Z0-9:\-_]*|\d+)(?:\s+[^>]*?)?\/?>|\{[\w\-.]+\}|%[sd]/gi;

export function extractTags(text) {
  if (typeof text !== "string" || !text) return [];
  const matches = text.match(STRICT_TAG_REGEX) || [];
  return matches.map(m => m.trim());
}

export function normalizeTag(tag) {
  if (!tag) return "";
  return tag.trim().replace(/\s+/g, " ");
}

export function getTagType(tag) {
  if (!tag.startsWith("<")) return "placeholder";
  if (tag.startsWith("</")) return "closing";
  if (tag.endsWith("/>") || tag.match(/^<\d+\/>$/)) return "self-closing";
  return "opening";
}

export function getTagIdentifier(tag) {
  if (!tag) return "";
  const match = tag.match(/^<\/?([a-zA-Z0-9:\-_]+)/);
  if (match) return match[1].toLowerCase();
  return tag;
}

/**
 * Validate target segment tags against source segment tags.
 */
export function validateSegmentTags(sourceText, targetText) {
  const sourceTags = extractTags(sourceText);
  const targetTags = extractTags(targetText);

  const errors = [];
  const missingTags = [];
  const extraTags = [];

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

  // 1. Missing Tags
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
        message: `Tag "${tagKey}" from source is missing in target`,
        tag: tagKey
      });
    }
  });

  // 2. Extra Tags
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
        message: `Extra tag "${tagKey}" found in target`,
        tag: tagKey
      });
    }
  });

  // 3. Unclosed Tags
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
        message: `Opening tag "${unclosed.tag}" was not closed`,
        tag: unclosed.tag
      });
    });
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    missingTags,
    extraTags,
    sourceTagCount: sourceTags.length,
    targetTagCount: targetTags.length
  };
}

/**
 * Auto-fix missing or misplaced tags in target string.
 */
export function autoFixSegmentTags(sourceText, targetText) {
  if (!sourceText || !targetText) return targetText || "";

  const report = validateSegmentTags(sourceText, targetText);
  if (report.isValid) return targetText;

  let repaired = targetText;

  // Strip extra tags
  report.extraTags.forEach(extra => {
    repaired = repaired.replace(extra, "");
  });

  // Restore missing tags
  const targetTagsNow = extractTags(repaired);
  const targetTagSet = new Set(targetTagsNow.map(normalizeTag));

  const sourceTags = extractTags(sourceText);
  sourceTags.forEach(st => {
    const normalized = normalizeTag(st);
    if (!targetTagSet.has(normalized)) {
      const type = getTagType(st);
      if (type === "closing") {
        repaired = repaired + st;
      } else {
        repaired = st + repaired;
      }
      targetTagSet.add(normalized);
    }
  });

  return repaired.trim();
}
