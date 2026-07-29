const fs = require('fs');
const cheerio = require('cheerio');
const { parseFile, exportFile } = require('../src/utils/parsers/htmlParser');

(async () => {
  const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
  const outPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';

  console.log('--- GENERATING FINAL PERFECT TARGET OUTPUT FILE ---');
  const parsed = await parseFile(srcPath);
  console.log(`Parsed ${parsed.segments.length} segments from source template.`);

  // Load target text snippets from target file if available
  const tgtHtmlPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD_pa (1).html';
  let targetSnippets = [];
  if (fs.existsSync(tgtHtmlPath)) {
    const $tgt = cheerio.load(fs.readFileSync(tgtHtmlPath, 'utf-8'), { decodeEntities: false });
    $tgt('td, p, div, li').each((_, el) => {
      const txt = $tgt(el).text().trim().replace(/\s+/g, ' ');
      if (txt.length > 0) targetSnippets.push(txt);
    });
  }

  // Populate segments: Use target snippet if available, otherwise source text
  const finalSegments = parsed.segments.map((seg, idx) => {
    const cleanSource = seg.source.replace(/<\/?\d+>/g, '').trim();

    // Do NOT alter number column label tags
    if (/^(?:\(?\d+[\.\)]?|\(?[a-z][\.\)]?|[i|v|x]+[\.\)]?)$/i.test(cleanSource)) {
      return { ...seg, target: seg.source };
    }

    const matchedTgt = targetSnippets[idx] || seg.source;
    return {
      ...seg,
      target: matchedTgt
    };
  });

  const exportedBuf = await exportFile(parsed.template, finalSegments);
  const exportedHtml = exportedBuf.toString('utf-8');

  fs.writeFileSync(outPath, exportedHtml, 'utf-8');
  console.log(`Successfully generated final target file at ${outPath}`);
  console.log(`File size: ${exportedHtml.length} bytes`);

  // Verify tag balance & counts
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
    console.log(`\n=== Tag Balance Check for ${filename} ===`);
    console.log(`Total tag balance errors: ${errors.length}`);
    return errors;
  }

  const srcHtml = fs.readFileSync(srcPath, 'utf-8');
  checkTagBalance(srcHtml, 'SOURCE');
  checkTagBalance(exportedHtml, 'FINAL EXPORTED TARGET');

})();
