const fs = require("fs");
const zlib = require("zlib");
const util = require("util");
const gzipAsync = util.promisify(zlib.gzip);
const cheerio = require("cheerio");
const {
  splitByPunctuation,
  restorePlaceholders,
  extractSegmentTags,
} = require("./segmentationUtils");

// ─── Constants ──────────────────────────────────────────────────────────────────

const SKIP_TAGS = ["script", "style", "noscript", "svg", "canvas"];
const BLOCK_TAGS = [
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "blockquote",
  "section", "article", "aside", "figure", "figcaption", "details", "summary", "dialog", "hgroup",
  "nav", "header", "footer", "address", "main", "menu",
  "ul", "ol", "table", "tbody", "thead", "tfoot", "tr", "colgroup", "col", "caption",
  "dl", "dt", "dd", "form", "fieldset",
  "body", "html"
];

// ─── Node Classification ────────────────────────────────────────────────────────

function isBlockTag(node) {
  return node && node.type === "tag" && BLOCK_TAGS.includes(node.name.toLowerCase());
}

function isSkipTag(node) {
  return node && node.type === "tag" && SKIP_TAGS.includes(node.name.toLowerCase());
}

// ─── Position Utilities ─────────────────────────────────────────────────────────

/**
 * Scan forward from startIndex to find the '>' that closes the opening tag.
 * Respects quoted attribute values so that '>' inside attrs is not mis-detected.
 */
function findOpenTagEnd(html, startIndex) {
  let inQuote = false;
  let quoteChar = null;
  for (let i = startIndex + 1; i < html.length; i++) {
    const ch = html[i];
    if (inQuote) {
      if (ch === quoteChar) { inQuote = false; quoteChar = null; }
    } else {
      if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; }
      else if (ch === ">") return i;
    }
  }
  return -1;
}

/**
 * Compute the inner content range of a block element.
 *
 * Returns { innerStart, innerEnd } where:
 *   innerStart = first char position after the opening tag's '>'
 *   innerEnd   = first char position of the closing tag's '</'
 *
 * For self-closing or void elements returns null.
 *
 * The closing tag position is computed deterministically from
 * htmlparser2's endIndex: endIndex points at the '>' of '</tag>',
 * so the '<' of '</tag>' is at  endIndex - tagName.length - 2.
 * A verification check confirms the substring matches; if not,
 * a backward scan provides a reliable fallback.
 */
function getInnerRange(node, html) {
  if (node.startIndex == null || node.endIndex == null) return null;

  const openEnd = findOpenTagEnd(html, node.startIndex);
  if (openEnd === -1) return null;

  // Self-closing check (e.g. <br/>, <img ... />)
  if (html.substring(node.startIndex, openEnd + 1).trimEnd().endsWith("/>")) return null;

  const innerStart = openEnd + 1;

  // Deterministic closing-tag start:  </tagName>  has length tagName.length + 3
  const tagName = node.name;
  if (!tagName) return { innerStart, innerEnd: innerStart };

  const expectedStart = node.endIndex - tagName.length - 2;

  if (expectedStart >= innerStart) {
    const candidate = html.substring(expectedStart, node.endIndex + 1);
    if (candidate.toLowerCase() === `</${tagName.toLowerCase()}>`) {
      return { innerStart, innerEnd: expectedStart };
    }
  }

  // Fallback: search at most 150 chars backward from node.endIndex (never scan 1.6MB backward!)
  const searchLimit = Math.max(innerStart, node.endIndex - 150);
  const lastCloseIdx = html.lastIndexOf("</", node.endIndex);
  if (lastCloseIdx >= searchLimit) {
    return { innerStart, innerEnd: lastCloseIdx };
  }

  return { innerStart, innerEnd: innerStart };
}

/**
 * Extract the exact opening and closing tag strings from the original HTML
 * for a given inline element node. Used for building the tag placeholder map.
 */
function getRawTagStrings(node, html) {
  if (node.startIndex == null) return null;

  const openEnd = findOpenTagEnd(html, node.startIndex);
  if (openEnd === -1) return null;

  const openingTag = html.substring(node.startIndex, openEnd + 1);
  if (openingTag.trimEnd().endsWith("/>")) {
    return { openingTag, closingTag: "" };
  }

  if (node.endIndex == null) {
    return { openingTag, closingTag: `</${node.name}>` };
  }

  // Deterministic position
  const tagName = node.name;
  if (!tagName) return { openingTag, closingTag: "" };

  const expectedStart = node.endIndex - tagName.length - 2;
  if (expectedStart > openEnd) {
    const candidate = html.substring(expectedStart, node.endIndex + 1);
    if (candidate.toLowerCase() === `</${tagName.toLowerCase()}>`) {
      return { openingTag, closingTag: candidate };
    }
  }

  // Fallback scan bounded to max 150 chars before node.endIndex
  const searchLimit = Math.max(openEnd, node.endIndex - 150);
  const lastCloseIdx = html.lastIndexOf("</", node.endIndex);
  if (lastCloseIdx >= searchLimit && lastCloseIdx > openEnd) {
    return { openingTag, closingTag: html.substring(lastCloseIdx, node.endIndex + 1) };
  }

  return { openingTag, closingTag: `</${tagName}>` };
}

// ─── Inline Tag Placeholder Extraction ──────────────────────────────────────────

/**
 * Walk the children of a block element and convert inline HTML tags to
 * numbered placeholders  (<1>, </1>, <2>, …).
 *
 * Text node content is extracted directly from the original HTML string
 * via startIndex/endIndex to preserve exact whitespace and entities.
 *
 * Returns the placeholder string and populates tagMap.
 */
function extractInlinePlaceholders(element, $, tagMap, tagCounter, html) {
  // Iterative DFS using an explicit stack to avoid recursive call overhead for large DOM trees.
  let result = "";
  const stack = [];

  // Push all direct children of element in reverse order
  const rootChildren = element.children || [];
  for (let i = rootChildren.length - 1; i >= 0; i--) {
    stack.push({ type: "enter", node: rootChildren[i] });
  }

  while (stack.length > 0) {
    const frame = stack.pop();
    const child = frame.node;

    if (frame.type === "exit") {
      result += frame.closingPlaceholder;
      continue;
    }

    if (child.type === "text") {
      if (child.startIndex != null && child.endIndex != null) {
        result += html.substring(child.startIndex, child.endIndex + 1);
      } else {
        result += child.data || "";
      }
    } else if (child.type === "tag") {
      if (isSkipTag(child)) continue;

      const id = tagCounter.value++;
      const rawTags = getRawTagStrings(child, html);
      const openingTag = rawTags ? rawTags.openingTag : `<${child.name}>`;
      const closingTag = rawTags ? rawTags.closingTag : "";

      tagMap.set(`<${id}>`, openingTag);
      tagMap.set(`</${id}>`, closingTag);
      result += `<${id}>`;

      if (closingTag) {
        stack.push({ type: "exit", node: child, closingPlaceholder: `</${id}>` });
      }

      const children = child.children || [];
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({ type: "enter", node: children[i] });
      }
    } else if (child.type === "comment") {
      const id = tagCounter.value++;
      if (child.startIndex != null && child.endIndex != null) {
        tagMap.set(`<${id}>`, html.substring(child.startIndex, child.endIndex + 1));
      } else {
        tagMap.set(`<${id}>`, `<!--${child.data}-->`);
      }
      tagMap.set(`</${id}>`, "");
      result += `<${id}></${id}>`;
    }
  }

  return result;
}

/**
 * Extract inline placeholders from a flat list of sibling nodes
 * (used for orphan text runs in mixed-content blocks).
 */
function extractInlinePlaceholdersFromNodes(nodes, $, tagMap, tagCounter, html) {
  let str = "";
  for (const child of nodes) {
    if (child.type === "text") {
      if (child.startIndex != null && child.endIndex != null) {
        str += html.substring(child.startIndex, child.endIndex + 1);
      } else {
        str += child.data || "";
      }
    } else if (child.type === "tag") {
      if (isSkipTag(child)) continue;

      const id = tagCounter.value++;
      const rawTags = getRawTagStrings(child, html);
      const openingTag = rawTags ? rawTags.openingTag : `<${child.name}>`;
      const closingTag = rawTags ? rawTags.closingTag : "";

      tagMap.set(`<${id}>`, openingTag);
      tagMap.set(`</${id}>`, closingTag);

      str += `<${id}>`;
      str += extractInlinePlaceholders(child, $, tagMap, tagCounter, html);
      if (closingTag) {
        str += `</${id}>`;
      }
    } else if (child.type === "comment") {
      const id = tagCounter.value++;
      if (child.startIndex != null && child.endIndex != null) {
        tagMap.set(`<${id}>`, html.substring(child.startIndex, child.endIndex + 1));
      } else {
        tagMap.set(`<${id}>`, `<!--${child.data}-->`);
      }
      tagMap.set(`</${id}>`, "");
      str += `<${id}></${id}>`;
    }
  }
  return str;
}

// ─── Leaf Block & Orphan Run Detection ──────────────────────────────────────────

/**
 * Find all translatable text blocks in the document.
 *
 * Two kinds are detected:
 *
 * 1. **Leaf text blocks** — a block-level element that contains translatable
 *    text but has NO block-level descendants that also contain text.
 *    Example: <p>, <li>, <td>, <h1>, etc.
 *
 * 2. **Orphan text runs** — sequences of text/inline nodes that are direct
 *    children of a non-leaf block (siblings of child blocks).
 *    Example: in <div>orphan text<p>paragraph</p></div>,
 *    "orphan text" is an orphan run.
 *
 * CRITICAL: This function does NOT mutate the DOM.
 * All position data comes from htmlparser2's initial parse.
 */
function findAllTextBlocks($, html) {
  const blocks = [];

  // Build table-index map without mutating the DOM
  const tableIndexMap = new Map();
  $("table").each((idx, el) => { tableIndexMap.set(el, String(idx)); });

  function getStructuralMeta(node) {
    const $n = $(node);
    const tableEl = $n.closest("table");
    const trEl = $n.closest("tr");
    const cellEl = $n.closest("td, th");
    const liEl = $n.closest("li");
    const tagName = node.name ? node.name.toLowerCase() : "";
    return {
      headingTag: ["h1","h2","h3","h4","h5","h6"].includes(tagName) ? tagName : undefined,
      tableId: tableEl.length ? tableIndexMap.get(tableEl[0]) : undefined,
      rowId: trEl.length ? trEl.index() : undefined,
      cellId: cellEl.length ? cellEl.index() : undefined,
      itemId: liEl.length ? liEl.index() : undefined,
    };
  }

  function traverse(node) {
    if (!node) return false;
    if (node.type === "text") return (node.data || "").trim().length > 0;
    if (node.type !== "tag" && node.type !== "root") return false;
    if (isSkipTag(node)) return false;

    let hasText = false;
    let hasBlockDescendantWithText = false;

    for (const child of (node.children || [])) {
      const childHasText = traverse(child);
      if (childHasText) hasText = true;
      if (child.type === "tag" && isBlockTag(child) && childHasText) {
        hasBlockDescendantWithText = true;
      }
    }

    if (!isBlockTag(node)) return hasText;

    if (hasText && !hasBlockDescendantWithText) {
      // ── Leaf text block ───────────────────────────────────────────────
      const range = getInnerRange(node, html);
      if (range && range.innerEnd > range.innerStart) {
        blocks.push({
          type: "leaf",
          node,
          innerStart: range.innerStart,
          innerEnd: range.innerEnd,
          ...getStructuralMeta(node),
        });
      }
    } else if (hasText && hasBlockDescendantWithText) {
      // ── Non-leaf block → collect orphan text runs ─────────────────────
      collectOrphanRuns(node, $, html, blocks, getStructuralMeta);
    }

    return hasText;
  }

  const root = $("body").length > 0 ? $("body")[0] : $.root()[0];
  traverse(root);

  // Sort by document order
  blocks.sort((a, b) => a.innerStart - b.innerStart);
  return blocks;
}

/**
 * Collect orphan text runs — sequences of text/inline nodes that sit between
 * block-level children of a given parent element.
 */
function collectOrphanRuns(parentNode, $, html, blocks, getStructuralMeta) {
  const children = parentNode.children || [];
  let currentRun = [];

  function flushRun() {
    if (currentRun.length === 0) return;

    const hasText = currentRun.some((n) => {
      if (n.type === "text") return (n.data || "").trim().length > 0;
      if (n.type === "tag" && !isSkipTag(n)) return $(n).text().trim().length > 0;
      return false;
    });

    if (hasText) {
      let startIdx = null;
      let endIdx = null;
      for (const n of currentRun) {
        if (n.startIndex != null && (startIdx === null || n.startIndex < startIdx)) startIdx = n.startIndex;
        if (n.endIndex != null && (endIdx === null || n.endIndex > endIdx)) endIdx = n.endIndex;
      }
      if (startIdx != null && endIdx != null) {
        blocks.push({
          type: "orphan",
          nodes: [...currentRun],
          parentNode,
          innerStart: startIdx,
          innerEnd: endIdx + 1,
          ...getStructuralMeta(parentNode),
        });
      }
    }
    currentRun = [];
  }

  for (const child of children) {
    if (child.type === "tag" && (isBlockTag(child) || isSkipTag(child))) {
      flushRun();
      // Do not recurse here — child blocks are handled by the main traversal
    } else {
      currentRun.push(child);
    }
  }
  flushRun();
}

// ─── Parse  ─────────────────────────────────────────────────────────────────────

/**
 * Parse an HTML file into translation segments.
 *
 * Architecture (V2):
 *  1. Read the file and parse the HTML (position tracking enabled).
 *  2. Find leaf text blocks + orphan runs via pure read-only DOM traversal.
 *  3. For each block: extract inline tags as numbered placeholders.
 *  4. Split into sentence-level sub-segments.
 *  5. Store: original HTML + block positions + tag map + segment metadata.
 *
 * On export, the original HTML is restored and text is replaced ONLY at
 * the recorded block positions.  No synthetic template, no DOM mutation,
 * no regex cleanup.
 */
const parseFile = async (filePath) => {
  const html = fs.readFileSync(filePath, "utf-8");
  console.log(`\n========================================`);
  console.log(`[HTML_PARSER_START] Parsing HTML file: ${filePath} (${html.length} bytes / ${(html.length / 1024).toFixed(1)} KB)`);

  const $ = cheerio.load(html, {
    _useHtmlParser2: true,
    withStartIndices: true,
    withEndIndices: true,
    decodeEntities: false,
  });
  console.log(`[HTML_PARSER_DOM_LOADED] Loaded HTML DOM into Cheerio parser successfully.`);

  const segments = [];
  let segmentIndex = 1;
  const tagMapGlobal = new Map();
  const tagCounter = { value: 1 };

  const textBlocks = findAllTextBlocks($, html);
  console.log(`[HTML_PARSER_BLOCKS_FOUND] Found ${textBlocks.length} text block candidates in HTML structure.`);
  const blockMeta = [];

  textBlocks.forEach((block, blockIdx) => {
    // Extract inline tag placeholders
    let placeholderStr;
    if (block.type === "leaf") {
      placeholderStr = extractInlinePlaceholders(block.node, $, tagMapGlobal, tagCounter, html);
    } else if (block.type === "orphan") {
      placeholderStr = extractInlinePlaceholdersFromNodes(block.nodes, $, tagMapGlobal, tagCounter, html);
    } else {
      return;
    }

    // Skip blocks with no meaningful text content
    if (!placeholderStr || placeholderStr.replace(/<\/?[\d]+>/g, "").trim().length === 0) {
      return;
    }

    // Split into sentence-level sub-segments using Intl.Segmenter
    const subSegments = splitByPunctuation(placeholderStr, tagMapGlobal);

    const segmentIds = [];

    subSegments.forEach((subSeg) => {
      const segmentId = segmentIndex++;
      const { leading, body, trailing } = extractSegmentTags(subSeg);
      const cleanBody = body ? body.replace(/[\r\n]+/g, " ").replace(/^[\s\uFEFF\xA0]+/, "").replace(/ +/g, " ") : "";
      segments.push({
        id: segmentId,
        source: cleanBody,
        target: "",
        leading,
        trailing,
        blockIndex: blockIdx,
      });
      segmentIds.push(segmentId);
    });

    if ((blockIdx + 1) % 500 === 0 || blockIdx === textBlocks.length - 1) {
      console.log(`[HTML_PARSER_PROGRESS] Processed ${blockIdx + 1}/${textBlocks.length} text blocks -> Extracted ${segments.length} segments so far...`);
    }

    blockMeta.push({
      blockIndex: blockIdx,
      innerStart: block.innerStart,
      innerEnd: block.innerEnd,
      segmentIds,
    });
  });

  // ── Build template ─────────────────────────────────────────────────
  const templateData = {
    version: 2,
    originalHtml: html,
    blocks: blockMeta,
    tagMap: Array.from(tagMapGlobal.entries()),
    segmentTags: segments.map((seg) => ({
      id: seg.id,
      leading: seg.leading,
      trailing: seg.trailing,
    })),
    isXml: false,
  };

  const zippedBuf = await gzipAsync(Buffer.from(JSON.stringify(templateData), "utf-8"));
  const template = zippedBuf.toString("base64");

  console.log(`[HTML_PARSER_COMPLETE] Successfully extracted ${segments.length} segments from ${textBlocks.length} text blocks! Zipped Template Size: ${zippedBuf.length} bytes.`);
  console.log(`========================================\n`);

  return { segments, template };
};

// ─── Export ─────────────────────────────────────────────────────────────────────

/**
 * Escape raw ampersands that are not already part of an HTML entity reference.
 */
const escapeRawAmpersands = (str) => {
  if (typeof str !== "string") return str;
  return str.replace(/&(?!(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/gi, "&amp;");
};

/**
 * Export translated HTML.
 * Detects the template version and dispatches:
 *  - Version 2: position-based replacement on stored original HTML
 *  - Legacy: __SEG_N__ placeholder replacement
 */
const isRtlLang = (targetLang) => {
  if (!targetLang) return false;
  const clean = String(targetLang).toLowerCase().split("-")[0];
  return ["ar", "ur", "he", "fa", "ps", "sd", "ug", "yi"].includes(clean);
};

const applyRtlToHtml = (html, targetLang) => {
  if (!isRtlLang(targetLang) || !html) return html;

  let processed = html;

  // 1. Ensure <html dir="rtl" lang="...">
  if (processed.includes("<html")) {
    processed = processed.replace(/<html([^>]*)>/i, (match, attrs) => {
      let newAttrs = attrs;
      if (!/dir\s*=/i.test(newAttrs)) {
        newAttrs += ' dir="rtl"';
      } else {
        newAttrs = newAttrs.replace(/dir\s*=\s*["'][^"']*["']/i, 'dir="rtl"');
      }
      if (!/lang\s*=/i.test(newAttrs)) {
        newAttrs += ` lang="${targetLang}"`;
      }
      return `<html${newAttrs}>`;
    });
  } else {
    processed = `<html dir="rtl" lang="${targetLang}"><head><meta charset="utf-8"/></head><body dir="rtl">${processed}</body></html>`;
  }

  // 2. Ensure <body dir="rtl">
  if (processed.includes("<body")) {
    processed = processed.replace(/<body([^>]*)>/i, (match, attrs) => {
      let newAttrs = attrs;
      if (!/dir\s*=/i.test(newAttrs)) {
        newAttrs += ' dir="rtl"';
      } else {
        newAttrs = newAttrs.replace(/dir\s*=\s*["'][^"']*["']/i, 'dir="rtl"');
      }
      return `<body${newAttrs}>`;
    });
  }

  // 3. Inject Trados-compatible global RTL stylesheet with Center-Alignment Preservation
  const rtlCssBlock = `
<style type="text/css" id="centroid-rtl-override">
  html, body {
    direction: rtl;
    text-align: right;
    unicode-bidi: isolate;
  }
  /* Default text flow for RTL without overriding explicit center */
  p, div, span, h1, h2, h3, h4, h5, h6, li, td, th, label, blockquote, dd, dt, article, section, header, footer, main {
    direction: rtl;
    unicode-bidi: isolate;
  }
  /* Right-align content that is not explicitly centered */
  p:not([align="center"]):not(.text-center),
  div:not([align="center"]):not(.text-center),
  h1:not([align="center"]):not(.text-center),
  h2:not([align="center"]):not(.text-center),
  h3:not([align="center"]):not(.text-center),
  h4:not([align="center"]):not(.text-center),
  h5:not([align="center"]):not(.text-center),
  h6:not([align="center"]):not(.text-center),
  header:not([align="center"]):not(.text-center),
  th:not([align="center"]):not(.text-center),
  td:not([align="center"]):not(.text-center) {
    text-align: right;
  }

  /* Strictly preserve and enforce Center Alignment (Address, Titles, Logos) */
  center,
  [align="center"],
  .text-center,
  .center,
  *[style*="text-align: center"],
  *[style*="text-align:center"],
  *[style*="text-align: Center"],
  *[style*="TEXT-ALIGN: CENTER"] {
    text-align: center !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }

  /* Table positioning */
  table {
    direction: rtl !important;
    border-collapse: collapse;
  }
  table[align="center"],
  table[style*="margin: auto"],
  table[style*="margin:auto"],
  table[style*="margin: 0 auto"],
  table[style*="margin:0 auto"] {
    margin-left: auto !important;
    margin-right: auto !important;
  }
  table:not([align="center"]):not([style*="margin: auto"]):not([style*="margin:auto"]):not([style*="margin: 0 auto"]):not([style*="margin:0 auto"]) {
    margin-right: 0;
    margin-left: auto;
  }
</style>
`;

  if (processed.includes("</head>")) {
    processed = processed.replace("</head>", `${rtlCssBlock}</head>`);
  } else if (processed.includes("<head>")) {
    processed = processed.replace("<head>", `<head>${rtlCssBlock}`);
  } else if (processed.includes("<html")) {
    processed = processed.replace(/<html([^>]*)>/i, `<html$1><head>${rtlCssBlock}</head>`);
  } else {
    processed = `${rtlCssBlock}${processed}`;
  }

  // 4. Overwrite inline styling: text-align: left -> text-align: right & direction: ltr -> direction: rtl
  // Note: text-align: center is NEVER overwritten so centered headers/addresses stay in the center!
  processed = processed.replace(/style\s*=\s*["']([^"']*)["']/gi, (match, styleContent) => {
    let updatedStyle = styleContent
      .replace(/text-align\s*:\s*left/gi, "text-align: right")
      .replace(/direction\s*:\s*ltr/gi, "direction: rtl");
    return `style="${updatedStyle}"`;
  });

  // 5. Transform align="left" attributes to align="right" (leaving align="center" untouched)
  processed = processed.replace(/\balign\s*=\s*["']left["']/gi, 'align="right"');

  // 6. Ensure <table> tags have dir="rtl"
  processed = processed.replace(/<table\b([^>]*)>/gi, (match, attrs) => {
    if (!/dir\s*=/i.test(attrs)) {
      return `<table dir="rtl"${attrs}>`;
    }
    return match;
  });

  return processed;
};

const exportFile = async (templateBase64, segments, targetLang = "") => {
  let templateData;

  try {
    const buffer = Buffer.from(templateBase64, "base64");
    const unzipped = zlib.gunzipSync(buffer).toString("utf-8");
    try {
      templateData = JSON.parse(unzipped);
    } catch (_parseErr) {
      // Not JSON — treat as raw HTML template
      const processed = applyRtlToHtml(unzipped, targetLang);
      return Buffer.from(processed, "utf-8");
    }
  } catch (_zipErr) {
    // Not gzipped — treat as plain text
    const processed = applyRtlToHtml(templateBase64, targetLang);
    return Buffer.from(processed, "utf-8");
  }

  let resultBuffer;
  if (templateData.version === 2 && templateData.originalHtml) {
    resultBuffer = exportFileV2(templateData, segments);
  } else {
    resultBuffer = exportFileLegacy(templateData, segments);
  }

  if (isRtlLang(targetLang)) {
    const htmlStr = resultBuffer.toString("utf-8");
    const rtlHtml = applyRtlToHtml(htmlStr, targetLang);
    return Buffer.from(rtlHtml, "utf-8");
  }

  return resultBuffer;
};

// ─── V2 Export: position-based replacement ──────────────────────────────────────

/**
 * Export using the V2 template: load the original HTML and replace text
 * only at the recorded block positions.
 *
 * Key properties:
 *  - Blocks with NO translations are skipped entirely → original content
 *    is preserved byte-for-byte.
 *  - Replacement is done from the END of the document to the START so that
 *    earlier byte offsets remain valid after later replacements.
 *  - A verification check confirms the original content is still at the
 *    expected position before replacing (guards against template corruption).
 */
function exportFileV2(templateData, segments) {
  let html = templateData.originalHtml;
  const tagMapGlobal = new Map(templateData.tagMap || []);
  const segmentTagsMap = new Map(
    (templateData.segmentTags || []).map((t) => [t.id, t])
  );
  const blocks = templateData.blocks || [];

  // Build segment lookup (keyed by numeric ID)
  const segmentMap = new Map();
  segments.forEach((seg) => segmentMap.set(Number(seg.id), seg));

  // Process blocks from END to START to keep earlier positions valid
  const sorted = [...blocks].sort((a, b) => b.innerStart - a.innerStart);

  for (const block of sorted) {
    // ── Skip blocks where NO segment has a translation ──────────────
    const hasTranslation = block.segmentIds.some((segId) => {
      const seg = segmentMap.get(segId);
      return seg && seg.target != null && String(seg.target).trim() !== "";
    });
    if (!hasTranslation) continue;

    // ── Verify position integrity ───────────────────────────────────
    const currentContent = html.substring(block.innerStart, block.innerEnd);
    const expectedContent = block.originalContent || html.substring(block.innerStart, block.innerEnd);
    if (currentContent !== expectedContent) {
      console.warn(
        `[htmlParser v2] Block position mismatch at [${block.innerStart}:${block.innerEnd}], skipping to prevent corruption`
      );
      continue;
    }

    // ── Build replacement from segments ─────────────────────────────
    const parts = [];
    for (const segId of block.segmentIds) {
      const seg = segmentMap.get(segId);
      const savedTags = segmentTagsMap.get(segId) || {};
      const leading = savedTags.leading || (seg ? seg.leading : "") || "";
      const trailing = savedTags.trailing || (seg ? seg.trailing : "") || "";

      const hasTarget = seg && seg.target != null && String(seg.target).trim() !== "";
      let rawTarget = hasTarget ? seg.target : (seg ? seg.source || "" : "");

      // Strip leading/trailing newlines (not spaces — they may be separators)
      rawTarget = rawTarget.replace(/^[\r\n]+|[\r\n]+$/g, "");
      // Escape raw ampersands (excluding valid entity references)
      rawTarget = escapeRawAmpersands(rawTarget);

      // Guard against double-tagging: strip leading/trailing tags if
      // they already appear as prefix/suffix of rawTarget
      const leadingTrimmed = leading.trim();
      const trailingTrimmed = trailing.trim();
      if (leadingTrimmed && rawTarget.startsWith(leadingTrimmed)) {
        rawTarget = rawTarget.slice(leadingTrimmed.length);
      }
      if (trailingTrimmed && rawTarget.endsWith(trailingTrimmed)) {
        rawTarget = rawTarget.slice(0, -trailingTrimmed.length);
      }

      const fullTarget = leading + rawTarget + trailing;
      parts.push(restorePlaceholders(fullTarget, tagMapGlobal));
    }

    // Join sub-segments belonging to the exact same parent node cleanly
    let replacement = "";
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i === 0) {
        replacement = p;
      } else {
        if (replacement.endsWith(" ") || p.startsWith(" ")) {
          replacement += p;
        } else {
          replacement += " " + p;
        }
      }
    }

    // ── Perform the replacement ─────────────────────────────────────
    html = html.substring(0, block.innerStart) + replacement + html.substring(block.innerEnd);
  }

  return Buffer.from(html, "utf-8");
}

// ─── Legacy Export: __SEG_N__ placeholder replacement ────────────────────────────

/**
 * Backward-compatible export for templates created before V2.
 * These templates contain the HTML with __SEG_N__ placeholders
 * and use a tag map for inline tag restoration.
 */
function exportFileLegacy(templateData, segments) {
  let html = "";
  let tagMapGlobal = new Map();
  let segmentTagsMap = new Map();

  if (templateData && templateData.html !== undefined) {
    html = templateData.html;
    tagMapGlobal = new Map(templateData.tagMap || []);
    segmentTagsMap = new Map(
      (templateData.segmentTags || []).map((t) => [t.id, t])
    );
  } else if (typeof templateData === "string") {
    html = templateData;
  }

  // ── Build segment map ─────────────────────────────────────────────
  const segmentMap = new Map();
  segments.forEach((segment) => {
    const savedTags = segmentTagsMap.get(segment.id) || {};
    const leading = savedTags.leading || segment.leading || "";
    const trailing = savedTags.trailing || segment.trailing || "";

    const hasTarget =
      segment.target !== undefined &&
      segment.target !== null &&
      segment.target.trim() !== "";
    let rawTarget = hasTarget ? segment.target : segment.source || "";

    rawTarget = rawTarget.replace(/^[\r\n]+|[\r\n]+$/g, "");
    rawTarget = escapeRawAmpersands(rawTarget);

    const leadingTrimmed = leading.trim();
    const trailingTrimmed = trailing.trim();
    if (leadingTrimmed && rawTarget.startsWith(leadingTrimmed)) {
      rawTarget = rawTarget.slice(leadingTrimmed.length);
    }
    if (trailingTrimmed && rawTarget.endsWith(trailingTrimmed)) {
      rawTarget = rawTarget.slice(0, -trailingTrimmed.length);
    }

    const fullTarget = leading + rawTarget + trailing;
    const restoredText = restorePlaceholders(fullTarget, tagMapGlobal);
    segmentMap.set(segment.id, restoredText);
  });

  // ── Replace __SEG_N__ placeholders ────────────────────────────────
  html = html.replace(/__SEG_(\d+)__/g, (match, idStr) => {
    const id = parseInt(idStr, 10);
    return segmentMap.has(id) ? segmentMap.get(id) : match;
  });

  // ── Safe cleanup of legacy artefacts ──────────────────────────────

  // Remove data-relink-table-id attributes (added during legacy parsing)
  html = html.replace(/\s*data-relink-table-id="[^"]*"/g, "");

  // Unwrap __temp-leaf-block__ wrappers (targeted match, not greedy </div>)
  let prev;
  let guard = 0;
  do {
    prev = html;
    html = html.replace(
      /<div\s+class=["']__temp-leaf-block__["']\s*>([\s\S]*?)<\/div>/g,
      "$1"
    );
    guard++;
  } while (html !== prev && guard < 10);

  return Buffer.from(html, "utf-8");
}

module.exports = { parseFile, exportFile };
