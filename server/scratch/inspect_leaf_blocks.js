const fs = require('fs');
const cheerio = require('cheerio');
const { parseFile } = require('../src/utils/parsers/htmlParser');

async function debug() {
  const filePath = 'C:\\Users\\divya\\Downloads\\Meet Our Leadership Team _ Airtel Payments Bank_hi (1).html';
  const html = fs.readFileSync(filePath, 'utf-8');
  const $ = cheerio.load(html, { decodeEntities: false });

  const BLOCK_TAGS = [
    "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "blockquote", 
    "section", "article", "nav", "header", "footer", "figcaption", "address", "main",
    "ul", "ol", "table", "tbody", "thead", "tr", "dl", "dt", "dd", "form", "fieldset",
    "body", "html"
  ];

  const SKIP_SELECTOR = "script,style,noscript,svg,canvas";
  const isBlockNode = (node, $) => {
    if (node.type !== "tag") return false;
    const tagName = node.name.toLowerCase();
    if (BLOCK_TAGS.includes(tagName)) return true;
    
    let hasBlockDescendant = false;
    $(node).find("*").each((_, desc) => {
      if (BLOCK_TAGS.includes(desc.name.toLowerCase())) {
        hasBlockDescendant = true;
        return false;
      }
    });
    return hasBlockDescendant;
  };

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
        if (isBlockNode(child, $)) {
          hasBlock = true;
        } else if (!["script", "style", "noscript"].includes(child.name.toLowerCase())) {
          hasInline = true;
        }
      }
    });

    if (hasBlock && hasInline) {
      let currentGroup = [];
      children.each((_, child) => {
        const isBlock = child.type === "tag" && isBlockNode(child, $);
        const isWhitespaceText = child.type === "text" && !$(child).text().trim();
        const isIgnoredTag = child.type === "tag" && ["script", "style", "noscript"].includes(child.name.toLowerCase());

        if (isBlock || isIgnoredTag) {
          if (currentGroup.length > 0) {
            const wrapper = $("<div class='__temp-leaf-block__'></div>");
            $(currentGroup[0]).replaceWith(wrapper);
            currentGroup.forEach((node) => {
              wrapper.append(node);
            });
            currentGroup = [];
          }
        } else if (!isWhitespaceText) {
          currentGroup.push(child);
        }
      });

      if (currentGroup.length > 0) {
        const wrapper = $("<div class='__temp-leaf-block__'></div>");
        $(currentGroup[0]).replaceWith(wrapper);
        currentGroup.forEach((node) => {
          wrapper.append(node);
        });
      }
    }
  };

  if ($("body").length > 0) {
    wrapInlineSiblings($("body")[0], $);
  }

  const blocks = [];
  const selectors = [...BLOCK_TAGS, ".__temp-leaf-block__"].join(",");
  $(selectors).each((_, el) => {
    const clone = $(el).clone();
    clone.find(SKIP_SELECTOR).remove();
    const hasText = clone.text().trim().length > 0;
    if (hasText) {
      blocks.push(el);
    }
  });

  const leafTextBlocks = blocks.filter(block => {
    return !blocks.some(otherBlock => {
      if (otherBlock === block) return false;
      return $(block).find(otherBlock).length > 0;
    });
  });

  console.log('Total leafTextBlocks found:', leafTextBlocks.length);
  
  // Inspect the first few leafTextBlocks and show their tags and html
  leafTextBlocks.slice(0, 10).forEach((block, idx) => {
    console.log(`\nBlock #${idx}: Tag: <${block.name}>, Classes: "${$(block).attr('class') || ''}"`);
    console.log(`HTML: ${$(block).html() ? $(block).html().substring(0, 200) : ''}`);
  });
}

debug();
