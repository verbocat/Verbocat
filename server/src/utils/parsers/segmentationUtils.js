const cheerio = require("cheerio");

// Replaces all HTML tags in an element with numbered placeholders <1>...</1>
// Returns the placeholder string and populates the tagMap
const extractPlaceholders = (element, $, tagMap, tagCounter) => {
  let str = "";
  $(element)
    .contents()
    .each((_, child) => {
      if (child.type === "text") {
        str += $(child).text().replace(/\s+/g, " ");
      } else if (child.type === "tag") {
        const isTempWrapper = child.attribs && child.attribs.class && child.attribs.class.includes("__temp-leaf-block__");
        if (isTempWrapper) {
          str += extractPlaceholders(child, $, tagMap, tagCounter);
          return;
        }

        const id = tagCounter.value++;

        const clone = $(child).clone();
        clone.empty();
        const outer = $.html(clone); // e.g. <w:rPr/>
        
        const isOriginalEmpty = !child.children || child.children.length === 0;
        let openingTag = outer;
        let closingTag = "";

        if (isOriginalEmpty) {
          openingTag = outer;
          closingTag = "";
        } else {
          if (outer.endsWith("/>")) {
            openingTag = outer.slice(0, -2) + ">";
          } else {
            openingTag = outer.replace(/<\/[^>]+>$/, "");
          }
          closingTag = `</${child.name}>`;
        }

        tagMap.set(`<${id}>`, openingTag);
        tagMap.set(`</${id}>`, closingTag);

        str += `<${id}>`;
        str += extractPlaceholders(child, $, tagMap, tagCounter);
        if (closingTag !== "") {
          str += `</${id}>`;
        }
      } else if (child.type === "comment") {
        const id = tagCounter.value++;
        tagMap.set(`<${id}>`, `<!--${child.data}-->`);
        tagMap.set(`</${id}>`, "");
        str += `<${id}></${id}>`;
      }
    });
  return str;
};

// Splits a placeholder string into pure text segments by using every tag as a boundary
const splitByTags = (str) => {
  const regex = /(<\/?\d+>)|([^<]+)/g;
  const segments = [];
  let currentLeading = "";
  let currentBody = "";
  let currentTrailing = "";
  let match;
  let inBody = false;

  while ((match = regex.exec(str)) !== null) {
    if (match[1]) {
      const tag = match[1];
      if (!inBody) {
        currentLeading += tag;
      } else {
        currentTrailing += tag;
      }
    } else if (match[2]) {
      const text = match[2];
      if (text.trim().length === 0) {
        if (!inBody) {
          currentLeading += text;
        } else {
          currentTrailing += text;
        }
      } else {
        if (inBody) {
          segments.push(currentLeading + currentBody.trim() + currentTrailing);
          currentLeading = currentTrailing;
          currentBody = text;
          currentTrailing = "";
        } else {
          inBody = true;
          currentBody = text;
        }
      }
    }
  }

  if (inBody && currentBody.trim().length > 0) {
    segments.push(currentLeading + currentBody.trim() + currentTrailing);
  }

  return segments.length ? segments : (str && str.trim() ? [str] : []);
};

// Automatically balances active tag placeholders <1>...</1> within a segment
const balanceSegmentTags = (str, tagMap) => {
  if (!str || !str.includes("<")) return str;
  const tagRegex = /<\/?(\d+)>/g;
  const activeTags = [];
  const unopenedClosers = [];
  let match;

  while ((match = tagRegex.exec(str)) !== null) {
    const fullTag = match[0];
    const id = match[1];
    if (fullTag.startsWith("</")) {
      const idx = activeTags.lastIndexOf(id);
      if (idx !== -1) {
        activeTags.splice(idx, 1);
      } else {
        unopenedClosers.push(id);
      }
    } else {
      // Do not treat self-closing tags (closing tag is empty string in tagMap) as opening tags requiring closure
      if (tagMap && tagMap.get(`</${id}>`) === "") {
        continue;
      }
      activeTags.push(id);
    }
  }

  let balanced = str;
  unopenedClosers.reverse().forEach(id => {
    balanced = `<${id}>` + balanced;
  });
  activeTags.reverse().forEach(id => {
    balanced = balanced + `</${id}>`;
  });

  return balanced;
};

// Helper to check net active tag depth (unmatched open tags)
const getActiveTagDepth = (str, tagMap) => {
  if (!str || !str.includes("<")) return 0;
  const tagRegex = /<\/?(\d+)>/g;
  let depth = 0;
  let match;
  while ((match = tagRegex.exec(str)) !== null) {
    const fullTag = match[0];
    const id = match[1];
    if (fullTag.startsWith("</")) {
      depth = Math.max(0, depth - 1);
    } else {
      if (tagMap && tagMap.get(`</${id}>`) === "") {
        continue;
      }
      depth++;
    }
  }
  return depth;
};

// Splits a placeholder string into natural sentence segments.
// Uses Intl.Segmenter for language-aware, regex-free sentence detection.
// Works correctly for all languages and all file types without hanging.
const splitByPunctuation = (str, tagMap) => {
  if (!str || !str.trim()) return [];

  // Fast path: no sentence-boundary characters present
  if (!/[.!?।॥\r\n]/.test(str)) {
    return [balanceSegmentTags(str, tagMap)];
  }

  // Build a mapping from clean-text positions back to original string positions.
  // We strip placeholder tags (e.g. <1>, </2>) so the segmenter sees plain text.
  const cleanToOrig = []; // cleanToOrig[cleanIdx] = origIdx in str
  let cleanText = '';

  for (let i = 0; i < str.length; i++) {
    // Detect placeholder tag pattern <N> or </N>
    if (str[i] === '<') {
      let j = i + 1;
      if (j < str.length && str[j] === '/') j++;
      let numStr = '';
      while (j < str.length && str[j] >= '0' && str[j] <= '9') {
        numStr += str[j++];
      }
      if (numStr.length > 0 && j < str.length && str[j] === '>') {
        i = j; // skip the entire placeholder tag
        continue;
      }
    }
    cleanToOrig.push(i);
    cleanText += str[i];
  }

  // Use Intl.Segmenter for robust, language-aware sentence splitting.
  // It correctly handles abbreviations (No., Dr., Rs.), decimal numbers (3.14),
  // and works for all languages including Hindi, English, etc.
  let rawSegments;
  try {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
    rawSegments = [...segmenter.segment(cleanText)];
  } catch (_) {
    // If Intl.Segmenter is unavailable, treat entire block as one segment
    return [balanceSegmentTags(str, tagMap)];
  }

  const sentences = [];
  for (const { index, segment } of rawSegments) {
    if (!segment.trim()) continue;

    // Map clean-text boundaries back to original string positions
    const startOrig = cleanToOrig[index] ?? 0;
    const endCleanIdx = index + segment.length;
    const endOrig = endCleanIdx < cleanToOrig.length
      ? cleanToOrig[endCleanIdx]
      : str.length;

    const origSlice = str.slice(startOrig, endOrig);
    const balanced = balanceSegmentTags(origSlice, tagMap);
    if (balanced && balanced.replace(/<\/?[\d]+>/g, '').trim().length > 0) {
      sentences.push(balanced);
    }
  }

  return sentences.length ? sentences : [balanceSegmentTags(str, tagMap)];
};

// Replaces placeholders back with original HTML tags (handles both <N> and entity-encoded &lt;N&gt;)
const restorePlaceholders = (segmentedStr, tagMap) => {
  if (!segmentedStr) return "";
  return segmentedStr.replace(/(?:<|&lt;)\/?\d+(?:>|&gt;)/gi, (match) => {
    const canonicalTag = match.replace(/^&lt;/i, "<").replace(/&gt;$/i, ">");
    if (tagMap.has(canonicalTag)) return tagMap.get(canonicalTag);
    if (tagMap.has(match)) return tagMap.get(match);
    return match;
  });
};

// Separates a segment string into leading tags, clean body, and trailing tags
const extractSegmentTags = (str) => {
  if (!str) return { leading: "", body: "", trailing: "" };
  if (!str.includes("<")) return { leading: "", body: str, trailing: "" };

  let leading = "";
  let trailing = "";
  let body = str;

  // Match leading tags and whitespace (bullet points are translatable content and stay in the body)
  const leadingRegex = /^(\s*<\/?\d+>\s*|\s+)+/;
  const leadingMatch = body.match(leadingRegex);
  if (leadingMatch) {
    leading = leadingMatch[0];
    body = body.substring(leading.length);
  }

  // Match trailing tags and spaces
  const trailingRegex = /(\s*<\/?\d+>\s*|\s+)+$/;
  const trailingMatch = body.match(trailingRegex);
  if (trailingMatch) {
    trailing = trailingMatch[0];
    body = body.substring(0, body.length - trailing.length);
  }

  return { leading, body, trailing };
};

module.exports = {
  extractPlaceholders,
  splitByPunctuation,
  splitByTags,
  restorePlaceholders,
  extractSegmentTags,
  balanceSegmentTags,
};
