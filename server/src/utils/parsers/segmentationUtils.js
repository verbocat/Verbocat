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

// Splits a placeholder string into natural sentence segments based on punctuation (. ! ? । ॥ \n)
// Automatically balances active tags across split segments
const splitByPunctuation = (str, tagMap) => {
  if (!str || !str.trim()) return [];

  // Match sentence punctuation followed by space, tag placeholder <N>, or end of string
  const regex = /([^.!?।॥\n\r]+[.!?।॥\n\r]+(?=\s+|<\d+>|<\/\d+>|$))|([^.!?।॥\n\r]+$)/g;
  const rawPieces = [];
  let match;
  while ((match = regex.exec(str)) !== null) {
    const piece = match[0];
    if (piece && piece.trim() && !/^(\s*<\/?\d+>\s*)+$/.test(piece)) {
      rawPieces.push(piece.trim());
    }
  }

  if (rawPieces.length === 0) {
    rawPieces.push(str.trim());
  }

  const sentences = [];
  let currentAcc = "";

  for (let i = 0; i < rawPieces.length; i++) {
    const p = rawPieces[i];
    if (currentAcc) {
      currentAcc += " " + p;
    } else {
      currentAcc = p;
    }

    const isDecimalOrAbbr = /(?:^|\s|\()([A-Za-z0-9]|\d+)\.$/.test(currentAcc) && i < rawPieces.length - 1 && /^\d/.test(rawPieces[i+1]);
    const isShortWord = /\b(sr|no|v|vol|sec|art|cin|inc|ltd|co|st|dr|mr|mrs|vs|e\.g|i\.e)\.$/i.test(currentAcc);

    if (!isDecimalOrAbbr && !isShortWord) {
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
  splitByTags,
  restorePlaceholders,
  extractSegmentTags,
  balanceSegmentTags,
};
