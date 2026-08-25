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

/**
 * Calculates the word count of natural text inside a placeholder string,
 * ignoring numbered tag placeholders (<N>, </N>) and XML/HTML tags.
 */
const getCleanWordCount = (str) => {
  if (!str) return 0;
  const clean = str
    .replace(/<\/?[a-zA-Z0-9_\-:]+[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return 0;
  return clean.split(/\s+/).filter(Boolean).length;
};

/**
 * Intelligent Paragraph-First Segmentation Engine.
 * 
 * Rules:
 * 1. Multi-line paragraphs and blocks stay intact as a single contextual segment
 *    if the clean word count is within maxWords (default: 150 words).
 * 2. If word count > maxWords, splits along valid sentence boundaries (. / ? / ! / ।)
 *    using Intl.Segmenter (ignoring abbreviations, decimals, and tags),
 *    and groups consecutive sentences together up to maxWords per segment.
 * 3. Never splits in the middle of tags (<1>...</1>) or unclosed tag regions.
 * 4. Automatically balances tags across any resulting sub-segments.
 */
const segmentParagraph = (str, tagMap, options = {}) => {
  if (!str || !str.trim()) return [];

  const maxWords = options.maxWords || 150;
  const wordCount = getCleanWordCount(str);

  // Fast path 1: Paragraph is within maxWords limit -> return intact paragraph as 1 balanced segment!
  if (wordCount <= maxWords) {
    return [balanceSegmentTags(str, tagMap)];
  }

  // Fast path 2: No sentence boundary punctuation present -> keep intact
  if (!/[.!?।॥]/.test(str)) {
    return [balanceSegmentTags(str, tagMap)];
  }

  // Build a mapping from clean-text positions back to original string positions,
  // skipping placeholder tags (<N>, </N>).
  const cleanToOrig = [];
  let cleanText = '';

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '<') {
      let j = i + 1;
      if (j < str.length && str[j] === '/') j++;
      let numStr = '';
      while (j < str.length && str[j] >= '0' && str[j] <= '9') {
        numStr += str[j++];
      }
      if (numStr.length > 0 && j < str.length && str[j] === '>') {
        i = j; // skip placeholder tag
        continue;
      }
    }
    cleanToOrig.push(i);
    cleanText += str[i];
  }

  let rawSegments;
  try {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
    rawSegments = [...segmenter.segment(cleanText)];
  } catch (_) {
    return [balanceSegmentTags(str, tagMap)];
  }

  // Extract individual valid sentence slices
  const sentences = [];
  for (const { index, segment } of rawSegments) {
    if (!segment.trim()) continue;

    const startOrig = cleanToOrig[index] ?? 0;
    const endCleanIdx = index + segment.length;
    const endOrig = endCleanIdx < cleanToOrig.length
      ? cleanToOrig[endCleanIdx]
      : str.length;

    const origSlice = str.slice(startOrig, endOrig);
    const words = getCleanWordCount(origSlice);
    sentences.push({ slice: origSlice, words });
  }

  if (sentences.length <= 1) {
    return [balanceSegmentTags(str, tagMap)];
  }

  // Group consecutive sentences into segments up to maxWords
  const resultSegments = [];
  let currentGroupSlices = [];
  let currentGroupWords = 0;

  for (const s of sentences) {
    if (currentGroupSlices.length > 0 && currentGroupWords + s.words > maxWords) {
      // Commit current group
      const groupedText = currentGroupSlices.join("");
      const balanced = balanceSegmentTags(groupedText, tagMap);
      if (balanced && balanced.replace(/<\/?[\d]+>/g, '').trim().length > 0) {
        resultSegments.push(balanced);
      }
      currentGroupSlices = [s.slice];
      currentGroupWords = s.words;
    } else {
      currentGroupSlices.push(s.slice);
      currentGroupWords += s.words;
    }
  }

  if (currentGroupSlices.length > 0) {
    const groupedText = currentGroupSlices.join("");
    const balanced = balanceSegmentTags(groupedText, tagMap);
    if (balanced && balanced.replace(/<\/?[\d]+>/g, '').trim().length > 0) {
      resultSegments.push(balanced);
    }
  }

  return resultSegments.length ? resultSegments : [balanceSegmentTags(str, tagMap)];
};

// Splits a placeholder string into natural sentence segments using paragraph-first logic
const splitByPunctuation = (str, tagMap, options = {}) => {
  return segmentParagraph(str, tagMap, options);
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
// Uses linear scanning to avoid catastrophic regex backtracking (ReDoS)
const extractSegmentTags = (str) => {
  if (!str) return { leading: "", body: "", trailing: "" };
  if (!str.includes("<")) return { leading: "", body: str, trailing: "" };

  let leading = "";
  let trailing = "";
  let body = str;

  // Linear scan leading tags and spaces
  let pos = 0;
  while (pos < body.length) {
    if (/\s/.test(body[pos])) {
      pos++;
      continue;
    }
    if (body[pos] === "<") {
      const match = body.slice(pos).match(/^<\/?\d+>/);
      if (match) {
        pos += match[0].length;
        continue;
      }
    }
    break;
  }

  if (pos > 0) {
    leading = body.slice(0, pos);
    body = body.slice(pos);
  }

  // Linear scan trailing tags and spaces
  let endPos = body.length;
  while (endPos > 0) {
    const lastChar = body[endPos - 1];
    if (/\s/.test(lastChar)) {
      endPos--;
      continue;
    }
    if (lastChar === ">") {
      const lastTagMatch = body.slice(0, endPos).match(/<\/?\d+>$/);
      if (lastTagMatch) {
        endPos -= lastTagMatch[0].length;
        continue;
      }
    }
    break;
  }

  if (endPos < body.length) {
    trailing = body.slice(endPos);
    body = body.slice(0, endPos);
  }

  // Absorb any additional leading/trailing whitespace from body into leading/trailing
  const bodyMatch = body.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (bodyMatch && bodyMatch[2]) {
    leading += bodyMatch[1];
    trailing = bodyMatch[3] + trailing;
    body = bodyMatch[2];
  }

  // Clean internal raw line breaks (\r\n or \n) into a single clean space
  body = body.replace(/[\r\n]+/g, " ").replace(/ +/g, " ");

  return { leading, body, trailing };
};

module.exports = {
  getCleanWordCount,
  segmentParagraph,
  extractPlaceholders,
  splitByPunctuation,
  splitByTags,
  restorePlaceholders,
  extractSegmentTags,
  balanceSegmentTags,
};
