const fs = require('fs');
const cheerio = require('cheerio');

const srcHtml = fs.readFileSync('../client/src/testing/source.html', 'utf-8');
const tgtHtml = fs.readFileSync('../client/src/testing/target.html', 'utf-8');
const outHtml = fs.readFileSync('../client/src/testing/letest file we got from tool.html', 'utf-8');

const $src = cheerio.load(srcHtml);
const $tgt = cheerio.load(tgtHtml);
const $out = cheerio.load(outHtml);

function searchAll($, term, label) {
  console.log(`\n=== ${label} SEARCH FOR "${term}" ===`);
  $('*').each((i, el) => {
    const text = $(el).text().trim();
    if (text.includes(term)) {
      // Find deepest element containing term
      let hasChildWithTerm = false;
      $(el).children().each((_, child) => {
        if ($(child).text().includes(term)) hasChildWithTerm = true;
      });
      if (!hasChildWithTerm) {
        console.log(`Node <${el.tagName}>:`, text);
      }
    }
  });
}

searchAll($src, 'Subject to', 'SOURCE.HTML');
searchAll($tgt, 'Subject to', 'TARGET.HTML');
searchAll($tgt, 'ऋणदाता द्वारा तय किए गए', 'TARGET.HTML');
searchAll($out, 'ऋणदाता द्वारा तय किए गए', 'LETEST FILE WE GOT FROM TOOL.HTML');
