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

module.exports = {
  protectTags,
  restoreProtectedTags
};
