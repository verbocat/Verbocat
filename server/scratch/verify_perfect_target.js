const fs = require('fs');
const cheerio = require('cheerio');

const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
const tgtPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

const srcHtml = fs.readFileSync(srcPath, 'utf-8');
const tgtHtml = fs.readFileSync(tgtPath, 'utf-8');

function checkTagBalance(html, filename) {
  const stack = [];
  const errors = [];
  const tagRegex = /<\/?([a-zA-Z0-9:-]+)(?:\s+[^>]*?)?(\/?)>/g;
  let match;
  const selfClosing = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

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
          let foundIdx = -1;
          for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].tagName === tagName) {
              foundIdx = i;
              break;
            }
          }
          if (foundIdx !== -1) {
            const unclosed = stack.slice(foundIdx + 1);
            errors.push({ type: 'MISNESTED_CLOSING', tagName, unclosedTags: unclosed.map(u => u.tagName), index: match.index });
            stack.length = foundIdx;
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
  console.log(`Total tag balance errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log('Errors:', errors);
  }
  return errors;
}

const tagsToCompare = ['html', 'head', 'body', 'style', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'div', 'p', 'span', 'b', 'i', 'strong', 'em', 'img', 'br', 'hr', 'ul', 'ol', 'li'];

function compareCounts(srcHtml, tgtHtml) {
  const $src = cheerio.load(srcHtml);
  const $tgt = cheerio.load(tgtHtml);
  console.log(`\n--- TAG COUNT COMPARISON: SOURCE vs UPDATED TARGET ---`);
  let mismatches = 0;
  tagsToCompare.forEach(tag => {
    const srcCount = $src(tag).length;
    const tgtCount = $tgt(tag).length;
    if (srcCount !== tgtCount) {
      console.log(`  MISMATCH: <${tag}> Source=${srcCount}, Target=${tgtCount}`);
      mismatches++;
    } else {
      console.log(`  MATCH: <${tag}> count=${srcCount}`);
    }
  });
  console.log(`Total tag count mismatches: ${mismatches}`);
}

checkTagBalance(srcHtml, 'SOURCE');
checkTagBalance(tgtHtml, 'UPDATED TARGET (pa (1).html)');

compareCounts(srcHtml, tgtHtml);
