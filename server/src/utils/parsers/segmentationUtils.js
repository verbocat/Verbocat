const cheerio = require("cheerio");

// Replaces all HTML tags in an element with numbered placeholders <1>...</1>
// Returns the placeholder string and populates the tagMap
const extractPlaceholders = (element, $, tagMap, tagCounter) => {
  let str = "";
  $(element)
    .contents()
    .each((_, child) => {
      if (child.type === "text") {
        str += $(child).text();
      } else if (child.type === "tag") {
        const id = tagCounter.value++;

        const clone = $(child).clone();
        clone.empty();
        const outer = $.html(clone); // e.g. <b class="x"></b>
        const openingTag = outer.replace(/<\/[^>]+>$/, ""); // <b class="x">
        const closingTag = `</${child.name}>`;

        tagMap.set(`<${id}>`, openingTag);
        tagMap.set(`</${id}>`, closingTag);

        str += `<${id}>`;
        str += extractPlaceholders(child, $, tagMap, tagCounter);
        str += `</${id}>`;
      }
    });
  return str;
};

// Splits a placeholder string into segments based on punctuation
// Automatically balances active tags across segments
const splitByPunctuation = (str) => {
  const segments = [];
  let currentSegment = "";
  let activeTags = []; // Stack of active tag IDs

  const regex = /(<\/?\d+>)|([^<]+)/g;
  let match;

  while ((match = regex.exec(str)) !== null) {
    if (match[1]) {
      // It's a tag placeholder
      const tagStr = match[1];
      const isClosing = tagStr.startsWith("</");
      const id = parseInt(tagStr.replace(/\D/g, ""), 10);

      if (isClosing) {
        // Pop from active tags
        const index = activeTags.lastIndexOf(id);
        if (index !== -1) {
          activeTags.splice(index, 1);
        }
      } else {
        activeTags.push(id);
      }
      currentSegment += tagStr;
    } else if (match[2]) {
      // It's text
      const text = match[2];
      // Split by punctuation: . , ! ? : ; and line breaks
      const splitRegex = /([.,!?;:\n]+[\s]*)/g;

      let lastIndex = 0;
      let splitMatch;
      while ((splitMatch = splitRegex.exec(text)) !== null) {
        const punctuation = splitMatch[0];
        const before = text.substring(lastIndex, splitMatch.index);

        currentSegment += before + punctuation;

        // Close all active tags before splitting
        let closedTagsStr = "";
        for (let i = activeTags.length - 1; i >= 0; i--) {
          closedTagsStr += `</${activeTags[i]}>`;
        }

        segments.push(currentSegment + closedTagsStr);

        // Start new segment and re-open active tags
        let openedTagsStr = "";
        for (let i = 0; i < activeTags.length; i++) {
          openedTagsStr += `<${activeTags[i]}>`;
        }

        currentSegment = openedTagsStr;
        lastIndex = splitMatch.index + punctuation.length;
      }

      currentSegment += text.substring(lastIndex);
    }
  }

  if (currentSegment.trim() !== "") {
    // Close any dangling tags in the last segment
    let closedTagsStr = "";
    for (let i = activeTags.length - 1; i >= 0; i--) {
      closedTagsStr += `</${activeTags[i]}>`;
    }
    segments.push(currentSegment + closedTagsStr);
  }

  // Filter out segments that contain only whitespace or tags with no text
  return segments
    .map((s) => s.trim())
    .filter((s) => {
      const textOnly = s.replace(/<\/?\d+>/g, "").trim();
      return textOnly.length > 0;
    });
};

// Replaces placeholders back with original HTML tags
const restorePlaceholders = (segmentedStr, tagMap) => {
  return segmentedStr.replace(/<\/?\d+>/g, (match) => {
    return tagMap.get(match) || match;
  });
};

module.exports = {
  extractPlaceholders,
  splitByPunctuation,
  restorePlaceholders,
};
