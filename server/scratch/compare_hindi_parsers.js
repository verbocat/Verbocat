const fs = require('fs');
const cheerio = require('cheerio');
const { parseFile } = require('../src/utils/parsers/htmlParser');
const { extractPlaceholders, splitByPunctuation, extractSegmentTags } = require('../src/utils/parsers/segmentationUtils');

const BLOCK_TAGS = [
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th', 'blockquote', 
  'section', 'article', 'nav', 'header', 'footer', 'figcaption', 'address', 'main',
  'ul', 'ol', 'table', 'tbody', 'thead', 'tr', 'dl', 'dt', 'dd', 'form', 'fieldset'
];

async function originalParse(filePath) {
  const html = fs.readFileSync(filePath, 'utf-8');
  const $ = cheerio.load(html, { decodeEntities: false });
  const segments = [];
  let segmentIndex = 0;
  const processedBlocks = new Set();
  const tagMapGlobal = new Map();
  const tagCounter = { value: 1 };

  const isBlockNodeLocal = (node) => {
    if (node.type !== 'tag') return false;
    const tagName = node.name.toLowerCase();
    if (BLOCK_TAGS.includes(tagName)) return true;
    let hasBlockDescendant = false;
    $(node).find('*').each((_, desc) => {
      if (BLOCK_TAGS.includes(desc.name.toLowerCase())) {
        hasBlockDescendant = true;
        return false;
      }
    });
    return hasBlockDescendant;
  };

  const wrapInlineSiblingsLocal = (element) => {
    $(element).children().each((_, child) => {
      wrapInlineSiblingsLocal(child);
    });
    const children = $(element).contents();
    let hasBlock = false;
    let hasInline = false;
    children.each((_, child) => {
      if (child.type === 'text') {
        if ($(child).text().trim()) hasInline = true;
      } else if (child.type === 'tag') {
        if (isBlockNodeLocal(child)) hasBlock = true;
        else if (!['script', 'style', 'noscript'].includes(child.name.toLowerCase())) hasInline = true;
      }
    });
    if (hasBlock && hasInline) {
      let currentGroup = [];
      children.each((_, child) => {
        const isBlock = child.type === 'tag' && isBlockNodeLocal(child);
        const isWhitespaceText = child.type === 'text' && !$(child).text().trim();
        const isIgnoredTag = child.type === 'tag' && ['script', 'style', 'noscript'].includes(child.name.toLowerCase());
        if (isBlock || isIgnoredTag) {
          if (currentGroup.length > 0) {
            const wrapper = $('<div class="__temp-leaf-block__"></div>');
            $(currentGroup[0]).replaceWith(wrapper);
            currentGroup.forEach((node) => wrapper.append(node));
            currentGroup = [];
          }
        } else if (!isWhitespaceText) {
          currentGroup.push(child);
        }
      });
      if (currentGroup.length > 0) {
        const wrapper = $('<div class="__temp-leaf-block__"></div>');
        $(currentGroup[0]).replaceWith(wrapper);
        currentGroup.forEach((node) => wrapper.append(node));
      }
    }
  };

  if ($('body').length > 0) {
    wrapInlineSiblingsLocal($('body')[0]);
  }

  $('body').find('*').contents().each((_, element) => {
    if (element.type !== 'text') return;
    if ($(element).closest('script,style,noscript,svg,canvas').length > 0) return;
    if ($(element).parents('body').length === 0) return;

    const rawText = $(element).text().trim();
    if (!rawText) return;

    let $block = $(element).closest(BLOCK_TAGS.join(','));
    if ($block.length === 0) {
      $block = $(element).parent();
    }

    if ($block.closest('script,style,noscript,svg,canvas').length > 0) return;

    const blockNode = $block[0];
    if (processedBlocks.has(blockNode)) return;
    processedBlocks.add(blockNode);

    const placeholderStr = extractPlaceholders(blockNode, $, tagMapGlobal, tagCounter);
    const subSegments = splitByPunctuation(placeholderStr, tagMapGlobal);

    $block.empty();

    subSegments.forEach((subSeg) => {
      const segmentId = segmentIndex++;
      $block.append('__SEG_' + segmentId + '__');
      const { leading, body, trailing } = extractSegmentTags(subSeg);
      segments.push({ id: segmentId, source: body });
    });
  });

  return segments;
}

async function main() {
  const hinPath = 'C:\\Users\\divya\\Downloads\\Meet Our Leadership Team _ Airtel Payments Bank_hi (1).html';
  
  const origSegs = await originalParse(hinPath);
  console.log('Original Parser segments count on Hindi:', origSegs.length);

  const newRes = await parseFile(hinPath);
  console.log('New Parser segments count on Hindi:', newRes.segments.length);
}

main();
