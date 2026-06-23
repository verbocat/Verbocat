const fs = require('fs');
const { parseFile } = require('../src/utils/parsers/htmlParser');

async function run() {
  const hindiPath = 'C:\\Users\\divya\\Downloads\\Meet Our Leadership Team _ Airtel Payments Bank_hi (1).html';
  const result = await parseFile(hindiPath);
  console.log(`Parsed ${result.segments.length} segments.`);
  fs.writeFileSync('scratch/hindi_segments.json', JSON.stringify(result.segments, null, 2), 'utf-8');
  console.log('Saved to scratch/hindi_segments.json');
}

run();
