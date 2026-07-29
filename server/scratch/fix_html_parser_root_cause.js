const fs = require('fs');
const cheerio = require('cheerio');
const zlib = require('zlib');
const { extractPlaceholders, splitByPunctuation, restorePlaceholders, extractSegmentTags } = require('../src/utils/parsers/segmentationUtils');

const BLOCK_TAGS = [
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "blockquote", 
  "section", "article", "nav", "header", "footer", "figcaption", "address", "main",
  "caption", "dt", "dd"
];

// Clean leaf text block extractor: Every td, th, p, li, h1-h6 is an atomic leaf block without splitting on <br>
function getCleanLeafTextBlocks($) {
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
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const isChildBlock = child.type === "tag" && BLOCK_TAGS.includes(child.name.toLowerCase());
        const childHasText = traverse(child);
        if (childHasText) hasText = true;
        if (isChildBlock && childHasText) hasDescendantBlock = true;
      }
    }
    const isThisBlock = node.type === "tag" && BLOCK_TAGS.includes(node.name.toLowerCase());
    if (isThisBlock && hasText && !hasDescendantBlock) {
      leafTextBlocks.push(node);
    }
    return hasText;
  };

  if ($("body").length > 0) {
    traverse($("body")[0]);
  } else {
    traverse($.root()[0]);
  }
  return leafTextBlocks;
}

(async () => {
  const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
  const srcHtml = fs.readFileSync(srcPath, 'utf-8');

  const $src = cheerio.load(srcHtml, { decodeEntities: false });
  const srcBlocks = getCleanLeafTextBlocks($src);

  console.log(`--- CLEAN ATOMIC LEAF BLOCKS COUNT ---`);
  console.log(`Source atomic leaf blocks count: ${srcBlocks.length}`);

  // Inspect first 15 leaf blocks
  for (let i = 0; i < 15; i++) {
    const txt = $src(srcBlocks[i]).text().trim().replace(/\s+/g, ' ').substring(0, 80);
    console.log(`Leaf #${i} (${srcBlocks[i].name}): "${txt}"`);
  }

})();
