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
const balanceSegmentTags = (str) => {
  if (!str) return str;
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
const getActiveTagDepth = (str) => {
  if (!str) return 0;
  const tagRegex = /<\/?(\d+)>/g;
  let depth = 0;
  let match;
  while ((match = tagRegex.exec(str)) !== null) {
    if (match[0].startsWith("</")) {
      depth = Math.max(0, depth - 1);
    } else {
      depth++;
    }
  }
  return depth;
};

// Splits a placeholder string into natural sentence segments based on punctuation (. ! ? । ॥ \n)
// Automatically balances active tags across split segments without dropping any prefix text or characters
const splitByPunctuation = (str, tagMap) => {
  if (!str || !str.trim()) return [];

  // Match sentence boundary positions (. ! ? । ॥ \n) followed by whitespace, tag, or end of string
  const regex = /(?<=[.!?।॥\r\n])(?=\s+|<\/?\d+>|$)/g;
  const rawPieces = str.split(regex);

  const sentences = [];
  let currentAcc = "";

  for (let i = 0; i < rawPieces.length; i++) {
    const piece = rawPieces[i];
    if (!piece) continue;

    if (currentAcc) {
      currentAcc += piece;
    } else {
      currentAcc = piece;
    }

    const trimmed = currentAcc.trim();
    // Do NOT split across decimal points, version numbers (v.2, 3.1a), or common abbreviations (Mr., Dr., Jan_26/v.2, No. 2)
    const isDecimalOrVersion = /(?:^|\s|\/|\()([A-Za-z0-9]|\d+|v)\.$/i.test(trimmed) && i < rawPieces.length - 1 && /^[a-zA-Z0-9]/.test(rawPieces[i + 1].trim());
    const isShortAbbr = /(?:\b(?:sr|no|nos|v|vol|sec|art|cin|inc|ltd|pvt|corp|co|st|dr|mr|mrs|ms|prof|vs|e\.?\s*g|i\.?\s*e|etc|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|approx|max|min|fig|paras?|dept|assn|bldg|rs|re|inr|opp|ref|par|cl|ch|ver|sub|cl|para)\.|\b[a-z]\.)$/i.test(trimmed);
    const isInsideTag = getActiveTagDepth(currentAcc) > 0;

    if (!isDecimalOrVersion && !isShortAbbr && !isInsideTag) {
      const balanced = balanceSegmentTags(currentAcc);
      if (balanced && balanced.replace(/<\/?\d+>/g, "").trim().length > 0) {
        sentences.push(balanced);
        currentAcc = "";
      }
    }
  }

  if (currentAcc) {
    const balanced = balanceSegmentTags(currentAcc);
    if (balanced && balanced.replace(/<\/?\d+>/g, "").trim().length > 0) {
      sentences.push(balanced);
    }
  }

  return sentences.length ? sentences : [balanceSegmentTags(str)];
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

  let leading = "";
  let trailing = "";
  let body = str;

  // Match leading tags, spaces, and bullet points
  const leadingRegex = /^(\s*<\/?\d+>\s*|\s+|[•\-*]\s*)+/;
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
