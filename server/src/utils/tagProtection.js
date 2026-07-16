const protectTags = (text) => {
  const tags = [];

  const protectedText = String(text || "").replace(/<[^>]+>/g, (match) => {
    const token = `__TAG_${tags.length}__`;
    tags.push(match);
    return token;
  });

  return {
    protectedText,
    tags
  };
};

const restoreProtectedTags = (translated, tags) => {
  let output = String(translated || "").trim();

  // Normalize spaces/casing around tag placeholders (e.g., "__tag_0__", "__TAG _ 1__", "__TAG_ 1 __")
  output = output.replace(/__\s*TAG\s*_\s*(\d+)\s*__/gi, '__TAG_$1__');

  const usedTags = new Set();

  // 1. Try exact matching by index first
  tags.forEach((tag, index) => {
    const placeholder = `__TAG_${index}__`;
    if (output.includes(placeholder)) {
      output = output.replace(placeholder, tag);
      usedTags.add(index);
    }
  });

  // 2. Fallback: If there are still __TAG_n__ placeholders in the output,
  // replace them with the unused tags in order.
  const remainingPlaceholderRegex = /__TAG_\d+__/g;
  
  const unusedIndices = [];
  for (let i = 0; i < tags.length; i++) {
    if (!usedTags.has(i)) {
      unusedIndices.push(i);
    }
  }

  let unusedPtr = 0;
  output = output.replace(remainingPlaceholderRegex, () => {
    if (unusedPtr < unusedIndices.length) {
      const idx = unusedIndices[unusedPtr];
      const tag = tags[idx];
      usedTags.add(idx);
      unusedPtr++;
      return tag;
    }
    return "";
  });

  // 3. Absolute safety fallback: If any tag index is still not used (e.g. model completely omitted it),
  // append it at the end of the string to ensure all tags are perfectly preserved.
  tags.forEach((tag, index) => {
    if (!usedTags.has(index)) {
      output = output + tag;
      usedTags.add(index);
    }
  });

  return output;
};

const getTagName = (tagString) => {
  if (!tagString) return "";
  const match = tagString.match(/^<\/?([a-zA-Z0-9:-]+)/);
  return match ? match[1].toLowerCase() : "";
};

const alignSegmentTags = (sourceText, targetText, sourceTagMap, targetTagMap) => {
  if (!sourceText || !targetText) return targetText || "";

  // Find all placeholders in targetText (e.g., <1>, <2>, etc.)
  const targetPlaceholders = targetText.match(/<\d+>/g) || [];
  if (targetPlaceholders.length === 0) {
    return targetText; // No placeholders to align
  }

  // Find all placeholders in sourceText
  const sourcePlaceholders = sourceText.match(/<\d+>/g) || [];

  // Map each source placeholder to its tag info
  const sourceTagsInfo = sourcePlaceholders.map(p => {
    const tag = sourceTagMap.get(p) || "";
    return {
      placeholder: p,
      tag,
      name: getTagName(tag),
      used: false
    };
  });

  let alignedText = targetText;

  // For each placeholder in targetText, try to find a matching placeholder in sourceText
  targetPlaceholders.forEach(tp => {
    const targetTag = targetTagMap.get(tp) || "";
    const targetTagName = getTagName(targetTag);

    // Find the first unused source tag with the same name
    const match = sourceTagsInfo.find(s => s.name === targetTagName && !s.used);
    if (match) {
      match.used = true;
      const sp = match.placeholder; // e.g., <2>
      const spClose = sp.replace("<", "</"); // e.g., </2>
      const tpClose = tp.replace("<", "</"); // e.g., </1>

      // Replace target placeholder and its closing counterpart
      alignedText = alignedText.split(tp).join(sp);
      alignedText = alignedText.split(tpClose).join(spClose);
    }
  });

  return alignedText;
};

module.exports = {
  protectTags,
  restoreProtectedTags,
  getTagName,
  alignSegmentTags
};
