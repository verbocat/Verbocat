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

// Splits a placeholder string into segments based on punctuation
// Automatically balances active tags across segments
const splitByPunctuation = (str, tagMap) => {
  const MIN_LENGTH = 250;
  const segments = [];
  let currentSegment = "";
  let activeTags = []; // Stack of active tag IDs
  let currentTextLength = 0;

  const regex = /(<\/?\d+>)|([^<]+)/g;
  let match;

  while ((match = regex.exec(str)) !== null) {
    if (match[1]) {
      const tagStr = match[1];
      const isClosing = tagStr.startsWith("</");
      const id = parseInt(tagStr.replace(/\D/g, ""), 10);

      if (isClosing) {
        const index = activeTags.lastIndexOf(id);
        if (index !== -1) {
          activeTags.splice(index, 1);
        }
      } else {
        let isVoid = false;
        if (tagMap) {
          const closingPlaceholder = `</${id}>`;
          if (tagMap.get(closingPlaceholder) === "") {
            isVoid = true;
          }
        }
        if (!isVoid) {
          activeTags.push(id);
        }
      }
      currentSegment += tagStr;
    } else if (match[2]) {
      const text = match[2];
      const splitRegex = /([!?।॥]+[\s]*|[\n]+[\s]*|\.+)/g;

      let lastIndex = 0;
      let splitMatch;
      while ((splitMatch = splitRegex.exec(text)) !== null) {
        const punctuation = splitMatch[0];
        const before = text.substring(lastIndex, splitMatch.index);

        const postPunctIndex = match.index + splitMatch.index + punctuation.length;
        const remainder = str.substring(postPunctIndex);
        const remainderNoTags = remainder.replace(/<\/?\d+>/g, "");
        const isNonSpacePunct = /[।॥。]/.test(punctuation);
        const isValidBoundary = isNonSpacePunct || remainderNoTags.length === 0 || /^\s/.test(remainderNoTags);
        const hasTextRemainder = remainderNoTags.trim().length > 0;

        if (isValidBoundary && hasTextRemainder && (currentTextLength + before.length + punctuation.length >= MIN_LENGTH)) {
          currentSegment += before + punctuation;

          let closedTagsStr = "";
          for (let i = activeTags.length - 1; i >= 0; i--) {
            closedTagsStr += `</${activeTags[i]}>`;
          }

          segments.push(currentSegment + closedTagsStr);

          let openedTagsStr = "";
          for (let i = 0; i < activeTags.length; i++) {
            openedTagsStr += `<${activeTags[i]}>`;
          }

          currentSegment = openedTagsStr;
          currentTextLength = 0;
        } else {
          currentSegment += before + punctuation;
          currentTextLength += before.length + punctuation.length;
        }
        
        lastIndex = splitMatch.index + punctuation.length;
      }

      const remainder = text.substring(lastIndex);
      currentSegment += remainder;
      currentTextLength += remainder.length;
    }
  }

  if (currentSegment.trim() !== "") {
    let closedTagsStr = "";
    for (let i = activeTags.length - 1; i >= 0; i--) {
      closedTagsStr += `</${activeTags[i]}>`;
    }
    segments.push(currentSegment + closedTagsStr);
  }

  const finalSegments = [];
  let pendingTags = "";

  segments.forEach((s) => {
    const textOnly = s.replace(/<\/?\d+>/g, "").trim();
    if (textOnly.length > 0) {
      if (pendingTags) {
        finalSegments.push(pendingTags + " " + s);
        pendingTags = "";
      } else {
        finalSegments.push(s);
      }
    } else {
      if (finalSegments.length > 0) {
        finalSegments[finalSegments.length - 1] += " " + s;
      } else {
        pendingTags += (pendingTags ? " " : "") + s;
      }
    }
  });

  if (pendingTags) {
    finalSegments.push(pendingTags);
  }

  return finalSegments.filter(s => s.trim().length > 0);
};

// Replaces placeholders back with original HTML tags
const restorePlaceholders = (segmentedStr, tagMap) => {
  return segmentedStr.replace(/<\/?\d+>/g, (match) => {
    return tagMap.has(match) ? tagMap.get(match) : match;
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
  restorePlaceholders,
  extractSegmentTags,
};
