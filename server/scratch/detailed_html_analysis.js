const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

// 1. Check stack of opening and closing tags in target HTML to identify unclosed / mis-nested tags
function checkTagBalance(html, filename) {
  const stack = [];
  const errors = [];
  // Regex to match tags
  const tagRegex = /<\/?([a-zA-Z0-9:-]+)(?:\s+[^>]*?)?(\/?)>/g;
  let match;
  const selfClosing = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

  let lineNum = 1;
  let lastIndex = 0;

  while ((match = tagRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = fullTag.startsWith('</');
    const isSelfClosingSlash = match[2] === '/';
    const isVoid = selfClosing.has(tagName) || isSelfClosingSlash;

    if (isVoid) continue;

    if (!isClosing) {
      stack.push({ tagName, fullTag, index: match.index });
    } else {
      if (stack.length === 0) {
        errors.push({ type: 'EXTRA_CLOSING', tagName, fullTag, index: match.index });
      } else {
        const last = stack[stack.length - 1];
        if (last.tagName === tagName) {
          stack.pop();
        } else {
          // Look back up stack
          let foundIdx = -1;
          for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].tagName === tagName) {
              foundIdx = i;
              break;
            }
          }
          if (foundIdx !== -1) {
            // Unclosed tags in between
            const unclosed = stack.slice(foundIdx + 1);
            errors.push({ type: 'MISNESTED_CLOSING', tagName, unclosedTags: unclosed.map(u => u.tagName), index: match.index });
            stack.length = foundIdx; // pop down to match
          } else {
            errors.push({ type: 'UNMATCHED_CLOSING', tagName, fullTag, index: match.index });
          }
        }
      }
    }
  }

  if (stack.length > 0) {
    errors.push({ type: 'UNCLOSED_TAGS_AT_END', unclosed: stack.map(s => s.tagName) });
  }

  console.log(`\n=== Tag Balance Check for ${filename} ===`);
  console.log(`Total errors/warnings found: ${errors.length}`);
  errors.slice(0, 30).forEach(e => console.log(e));
  return errors;
}

checkTagBalance(srcHtml, 'SOURCE');
checkTagBalance(tgtHtml, 'TARGET');
