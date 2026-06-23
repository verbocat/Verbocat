const fs = require('fs');
const { parseFile } = require('../src/utils/parsers/htmlParser');

async function run() {
  const englishPath = 'C:\\Users\\divya\\Downloads\\Meet Our Leadership Team _ Airtel Payments Bank.html';
  const hindiPath = 'C:\\Users\\divya\\Downloads\\Meet Our Leadership Team _ Airtel Payments Bank_hi (1).html';

  const engResult = await parseFile(englishPath);
  const hinResult = await parseFile(hindiPath);

  console.log(`English segments: ${engResult.segments.length}`);
  console.log(`Hindi segments: ${hinResult.segments.length}`);

  const maxLen = Math.max(engResult.segments.length, hinResult.segments.length);
  const rows = [];
  for (let i = 0; i < maxLen; i++) {
    const engSeg = engResult.segments[i] ? engResult.segments[i].source : '---';
    const hinSeg = hinResult.segments[i] ? hinResult.segments[i].source : '---';
    rows.push({
      Index: i,
      English: engSeg.substring(0, 50),
      Hindi: hinSeg.substring(0, 50)
    });
  }

  fs.writeFileSync('scratch/compare_segments.json', JSON.stringify(rows, null, 2), 'utf-8');
  console.log('Saved comparison to scratch/compare_segments.json');
}

run();
