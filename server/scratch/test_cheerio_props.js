const cheerio = require("cheerio");

const sampleHtml = `<div>  Text here\n  <p>Paragraph here</p>\n  More text here\n</div>`;

const BLOCK_TAGS = ["div", "p"];

const wrapInlineSiblings = (element, $) => {
  $(element).children().each((_, child) => {
    wrapInlineSiblings(child, $);
  });

  const children = $(element).contents();
  let hasBlock = false;
  let hasInline = false;

  children.each((_, child) => {
    if (child.type === "text") {
      if ($(child).text().trim()) {
        hasInline = true;
      }
    } else if (child.type === "tag") {
      if (BLOCK_TAGS.includes(child.name.toLowerCase()) || (child.attribs && child.attribs.class && child.attribs.class.includes("__temp-leaf-block__"))) {
        hasBlock = true;
      } else {
        hasInline = true;
      }
    }
  });

  if (hasBlock && hasInline) {
    let currentGroup = [];
    children.each((_, child) => {
      const isBlock = child.type === "tag" && (BLOCK_TAGS.includes(child.name.toLowerCase()) || (child.attribs && child.attribs.class && child.attribs.class.includes("__temp-leaf-block__")));
      const isWhitespaceText = child.type === "text" && !$(child).text().trim();
      if (isBlock) {
        if (currentGroup.length > 0) {
          const wrapper = $("<div class='__temp-leaf-block__'></div>");
          $(currentGroup[0]).replaceWith(wrapper);
          currentGroup.forEach((node) => wrapper.append(node));
          currentGroup = [];
        }
      } else if (!isWhitespaceText) {
        currentGroup.push(child);
      }
    });

    if (currentGroup.length > 0) {
      const wrapper = $("<div class='__temp-leaf-block__'></div>");
      $(currentGroup[0]).replaceWith(wrapper);
      currentGroup.forEach((node) => wrapper.append(node));
    }
  }
};

function getBlockRange(node, html) {
  let startIndex = node.startIndex;
  let endIndex = node.endIndex;

  if (node.attribs && node.attribs.class && node.attribs.class.includes("__temp-leaf-block__")) {
    if (node.children && node.children.length > 0) {
      let firstChild = null;
      let lastChild = null;
      for (let i = 0; i < node.children.length; i++) {
        if (node.children[i].startIndex !== null && node.children[i].startIndex !== undefined) {
          firstChild = node.children[i];
          break;
        }
      }
      for (let i = node.children.length - 1; i >= 0; i--) {
        if (node.children[i].endIndex !== null && node.children[i].endIndex !== undefined) {
          lastChild = node.children[i];
          break;
        }
      }
      if (firstChild && lastChild) {
        startIndex = firstChild.startIndex;
        endIndex = lastChild.endIndex;
      }
    }
  }

  if (startIndex === null || startIndex === undefined || endIndex === null || endIndex === undefined) {
    return null;
  }

  const isVirtual = node.attribs && node.attribs.class && node.attribs.class.includes("__temp-leaf-block__");
  if (isVirtual) {
    return {
      start: startIndex,
      end: endIndex + 1
    };
  }

  let openTagEnd = -1;
  let insideQuotes = false;
  let quoteChar = null;
  const len = html.length;
  for (let k = startIndex + 1; k < len; k++) {
    const char = html[k];
    if (insideQuotes) {
      if (char === quoteChar) {
        insideQuotes = false;
        quoteChar = null;
      }
    } else {
      if (char === '"' || char === "'") {
        insideQuotes = true;
        quoteChar = char;
      } else if (char === ">") {
        openTagEnd = k;
        break;
      }
    }
  }

  if (openTagEnd === -1) return null;

  let endTagStart = -1;
  const openingTag = html.substring(startIndex, openTagEnd + 1);
  const isSelfClosing = openingTag.trim().endsWith("/>");

  if (!isSelfClosing) {
    const lastOpenIndex = html.lastIndexOf("</", endIndex);
    if (lastOpenIndex !== -1 && lastOpenIndex >= openTagEnd) {
      endTagStart = lastOpenIndex;
    }
  }

  return {
    start: openTagEnd + 1,
    end: endTagStart === -1 ? openTagEnd + 1 : endTagStart
  };
}

const $ = cheerio.load(sampleHtml, { _useHtmlParser2: true, withStartIndices: true, withEndIndices: true });
wrapInlineSiblings($("div")[0], $);

const leafTextBlocks = [];
const traverse = (node) => {
  if (!node) return false;
  if (node.type === "tag") {
    const tagName = node.name.toLowerCase();
    if (["script", "style", "noscript", "svg", "canvas"].includes(tagName)) return false;
  }
  if (node.type === "text") return node.data.trim().length > 0;

  let hasText = false;
  let hasDescendantBlock = false;
  if (node.children) {
    node.children.forEach(child => {
      const isChildBlock = child.type === "tag" && (BLOCK_TAGS.includes(child.name.toLowerCase()) || (child.attribs && child.attribs.class && child.attribs.class.includes("__temp-leaf-block__")));
      const childHasText = traverse(child);
      if (childHasText) hasText = true;
      if (isChildBlock && childHasText) hasDescendantBlock = true;
    });
  }

  const isThisBlock = node.type === "tag" && (BLOCK_TAGS.includes(node.name.toLowerCase()) || (node.attribs && node.attribs.class && node.attribs.class.includes("__temp-leaf-block__")));
  if (isThisBlock && hasText && !hasDescendantBlock) {
    leafTextBlocks.push(node);
  }
  return hasText;
};

traverse($("div")[0]);

let modifiedHtml = sampleHtml;
leafTextBlocks.sort((a, b) => {
  const rA = getBlockRange(a, sampleHtml);
  const rB = getBlockRange(b, sampleHtml);
  return (rB ? rB.start : 0) - (rA ? rA.start : 0);
});

leafTextBlocks.forEach((block, idx) => {
  const range = getBlockRange(block, sampleHtml);
  if (range) {
    const originalText = sampleHtml.substring(range.start, range.end);
    console.log(`Block ${idx} range [${range.start}, ${range.end}]: ${JSON.stringify(originalText)}`);
    modifiedHtml = modifiedHtml.substring(0, range.start) + `__SEG_${idx}__` + modifiedHtml.substring(range.end);
  }
});

console.log("\n--- Modified HTML ---");
console.log(modifiedHtml);
