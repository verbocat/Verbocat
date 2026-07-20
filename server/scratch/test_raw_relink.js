const cheerio = require("cheerio");

// Test HTML representing standard document with tags and formatting
const sampleHtml = `<!DOCTYPE html>
<html>
<HEAD>
  <META CharSet="utf-8">
  <TITLE>XHTML Test Page</TITLE>
</HEAD>
<body>
  <div class="container" data-relink-table-id="123">
    <H1>Title of the page</H1>
    <p>This is a paragraph with <br /> a line break, and <img src="image.png" />. Second sentence.</p>
    <div id="footer">
      <span>Footer text</span>
    </div>
  </div>
</body>
</html>`;

const BLOCK_TAGS = [
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "blockquote", 
  "section", "article", "nav", "header", "footer", "figcaption", "address", "main",
  "ul", "ol", "table", "tbody", "thead", "tr", "dl", "dt", "dd", "form", "fieldset",
  "body", "html"
];

function getBlockContentIndices(node, sourceHtml) {
  if (node.startIndex === null || node.startIndex === undefined) return null;

  // Find the end of the opening tag
  let openTagEnd = -1;
  let insideQuotes = false;
  let quoteChar = null;
  const len = sourceHtml.length;
  for (let k = node.startIndex + 1; k < len; k++) {
    const char = sourceHtml[k];
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
  const openingTag = sourceHtml.substring(node.startIndex, openTagEnd + 1);
  const isSelfClosing = openingTag.trim().endsWith("/>");

  if (!isSelfClosing && node.endIndex !== null && node.endIndex !== undefined) {
    const lastOpenIndex = sourceHtml.lastIndexOf("</", node.endIndex);
    if (lastOpenIndex !== -1 && lastOpenIndex >= openTagEnd) {
      endTagStart = lastOpenIndex;
    }
  }

  return {
    start: openTagEnd + 1,
    end: endTagStart === -1 ? openTagEnd + 1 : endTagStart
  };
}

function getRawTags(node, sourceHtml) {
  if (node.startIndex === null || node.startIndex === undefined) return null;

  let openTagEnd = -1;
  let insideQuotes = false;
  let quoteChar = null;
  const len = sourceHtml.length;
  for (let k = node.startIndex + 1; k < len; k++) {
    const char = sourceHtml[k];
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

  const openingTag = sourceHtml.substring(node.startIndex, openTagEnd + 1);
  const isSelfClosing = openingTag.trim().endsWith("/>");

  let closingTag = "";
  if (!isSelfClosing && node.endIndex !== null && node.endIndex !== undefined) {
    const lastOpenIndex = sourceHtml.lastIndexOf("</", node.endIndex);
    if (lastOpenIndex !== -1 && lastOpenIndex >= openTagEnd) {
      closingTag = sourceHtml.substring(lastOpenIndex, node.endIndex + 1);
    }
  }

  return { openingTag, closingTag };
}

// Extract placeholders and populate tagMap using raw tags from source
const extractPlaceholdersRaw = (element, $, tagMap, tagCounter, sourceHtml) => {
  let str = "";
  $(element)
    .contents()
    .each((_, child) => {
      if (child.type === "text") {
        str += $(child).text().replace(/\s+/g, " ");
      } else if (child.type === "tag") {
        const id = tagCounter.value++;
        const raw = getRawTags(child, sourceHtml);
        const openingTag = raw ? raw.openingTag : "";
        const closingTag = raw ? raw.closingTag : "";

        tagMap.set(`<${id}>`, openingTag);
        tagMap.set(`</${id}>`, closingTag);

        str += `<${id}>`;
        str += extractPlaceholdersRaw(child, $, tagMap, tagCounter, sourceHtml);
        if (closingTag !== "") {
          str += `</${id}>`;
        }
      } else if (child.type === "comment") {
        const id = tagCounter.value++;
        if (child.startIndex !== null && child.endIndex !== null) {
          const rawComment = sourceHtml.substring(child.startIndex, child.endIndex + 1);
          tagMap.set(`<${id}>`, rawComment);
        } else {
          tagMap.set(`<${id}>`, `<!--${child.data}-->`);
        }
        tagMap.set(`</${id}>`, "");
        str += `<${id}></${id}>`;
      }
    });
  return str;
};

// Replaces placeholders back with original tags
const restorePlaceholders = (segmentedStr, tagMap) => {
  return segmentedStr.replace(/<\/?\d+>/g, (match) => {
    return tagMap.has(match) ? tagMap.get(match) : match;
  });
};

const splitByPunctuation = (str) => {
  // Simple segmentation split
  return [str];
};

function parseFileRaw(html) {
  const $ = cheerio.load(html, { _useHtmlParser2: true, withStartIndices: true, withEndIndices: true });
  const segments = [];
  let segmentIndex = 0;

  const tagMapGlobal = new Map();
  const tagCounter = { value: 1 };

  // 1. Identify leaf blocks in DOM tree
  const leafTextBlocks = [];
  const traverse = (node) => {
    if (!node) return false;
    if (node.type === "tag") {
      const tagName = node.name.toLowerCase();
      if (["script", "style", "noscript", "svg", "canvas"].includes(tagName)) {
        return false;
      }
    }
    if (node.type === "text") {
      return node.data.trim().length > 0;
    }
    let hasText = false;
    let hasDescendantBlock = false;
    if (node.children) {
      node.children.forEach(child => {
        const isChildBlock = child.type === "tag" && BLOCK_TAGS.includes(child.name.toLowerCase());
        const childHasText = traverse(child);
        if (childHasText) hasText = true;
        if (isChildBlock && childHasText) hasDescendantBlock = true;
      });
    }
    const isThisBlock = node.type === "tag" && BLOCK_TAGS.includes(node.name.toLowerCase());
    if (isThisBlock && hasText && !hasDescendantBlock) {
      leafTextBlocks.push(node);
    }
    return hasText;
  };

  traverse($.root()[0]);

  // 2. We sort blocks in reverse order of their start index to replace them in-place in raw html string
  let templateHtml = html;
  const blocksToReplace = [];

  leafTextBlocks.forEach((blockNode) => {
    const indices = getBlockContentIndices(blockNode, html);
    if (indices) {
      blocksToReplace.push({
        node: blockNode,
        start: indices.start,
        end: indices.end
      });
    }
  });

  // Sort descending
  blocksToReplace.sort((a, b) => b.start - a.start);

  blocksToReplace.forEach((item) => {
    const placeholderStr = extractPlaceholdersRaw(item.node, $, tagMapGlobal, tagCounter, html);
    const subSegments = splitByPunctuation(placeholderStr);

    let replacement = "";
    subSegments.forEach((subSeg) => {
      const segmentId = segmentIndex++;
      replacement += `__SEG_${segmentId}__`;
      
      segments.push({
        id: segmentId,
        source: subSeg,
        target: "",
        leading: "",
        trailing: ""
      });
    });

    templateHtml = templateHtml.substring(0, item.start) + replacement + templateHtml.substring(item.end);
  });

  return { templateHtml, segments, tagMapGlobal };
}

function exportFileRaw(templateHtml, segments, tagMapGlobal) {
  const segmentMap = new Map();
  segments.forEach((segment) => {
    const targetText = segment.target || segment.source;
    const restoredText = restorePlaceholders(targetText, tagMapGlobal);
    segmentMap.set(segment.id, restoredText);
  });

  const outputHtml = templateHtml.replace(/__SEG_(\d+)__/g, (match, idStr) => {
    const id = parseInt(idStr, 10);
    if (segmentMap.has(id)) return segmentMap.get(id);
    return match;
  });

  return outputHtml;
}

const parseResult = parseFileRaw(sampleHtml);
console.log("Template HTML with Segments:");
console.log(parseResult.templateHtml);

// Translate segments
parseResult.segments.forEach(seg => {
  seg.target = seg.source + " [TRANSLATED]";
});

const exported = exportFileRaw(parseResult.templateHtml, parseResult.segments, parseResult.tagMapGlobal);
console.log("\nExported HTML:");
console.log(exported);

// Check if exactly identical outside of translation
const originalStripped = sampleHtml.replace(/Title of the page|This is a paragraph with <br \/> a line break, and <img src="image.png" \/>. Second sentence.|Footer text/g, "TEXT");
const exportedStripped = exported.replace(/Title of the page \[TRANSLATED\]|This is a paragraph with <br \/> a line break, and <img src="image.png" \/>. Second sentence. \[TRANSLATED\]|Footer text \[TRANSLATED\]/g, "TEXT");

console.log("\nByte-for-byte identical outside translation?", originalStripped === exportedStripped);
