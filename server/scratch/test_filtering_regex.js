const fs = require('fs');
const { parseFile } = require('../src/utils/parsers/htmlParser');

async function run() {
  const res = await parseFile('C:\\Users\\divya\\Downloads\\MFSA_SANCTION_LETTER_PROD (1)_hi.html');
  const segments = res.segments;

  const cleanText = (t) => (t || '').replace(/__TAG_\d+__/g, '').replace(/<[^>]+>/g, '').trim();

  const oldJunk = segments.filter(s => {
    const clean = cleanText(s.source);
    return /^[^a-zA-Z]*$/.test(clean);
  });

  const newJunk = segments.filter(s => {
    const clean = cleanText(s.source);
    return /^\P{L}*$/u.test(clean);
  });

  console.log('Total segments parsed:', segments.length);
  console.log('Filtered out by OLD regex:', oldJunk.length, '-> Remaining shown:', segments.length - oldJunk.length);
  console.log('Filtered out by NEW regex:', newJunk.length, '-> Remaining shown:', segments.length - newJunk.length);

  // Let's print some segments that were filtered out by the old regex but kept by the new regex.
  console.log('\nSegments kept by NEW regex but filtered out by OLD regex (first 10):');
  let count = 0;
  for (const s of segments) {
    const clean = cleanText(s.source);
    const isOldJunk = /^[^a-zA-Z]*$/.test(clean);
    const isNewJunk = /^\P{L}*$/u.test(clean);
    if (isOldJunk && !isNewJunk) {
      console.log(`- "${s.source}"`);
      count++;
      if (count >= 10) break;
    }
  }
}

run();
