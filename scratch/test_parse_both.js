const fs = require('fs');
const { parseFile } = require('../server/src/utils/parsers/htmlParser');

async function test() {
  try {
    const englishPath = 'C:\\Users\\divya\\Downloads\\Meet Our Leadership Team _ Airtel Payments Bank.html';
    const hindiPath = 'C:\\Users\\divya\\Downloads\\Meet Our Leadership Team _ Airtel Payments Bank_hi (1).html';

    console.log('Parsing English file...');
    const engResult = await parseFile(englishPath);
    console.log(`English segments count: ${engResult.segments.length}`);

    console.log('Parsing Hindi file...');
    const hinResult = await parseFile(hindiPath);
    console.log(`Hindi segments count: ${hinResult.segments.length}`);

    console.log('\n--- FIRST 5 ENGLISH SEGMENTS ---');
    engResult.segments.slice(0, 5).forEach(s => {
      console.log(`[${s.id}] Src: "${s.source}"`);
    });

    console.log('\n--- FIRST 5 HINDI SEGMENTS ---');
    hinResult.segments.slice(0, 5).forEach(s => {
      console.log(`[${s.id}] Src: "${s.source}"`);
    });

    console.log('\n--- LAST 5 HINDI SEGMENTS ---');
    hinResult.segments.slice(-5).forEach(s => {
      console.log(`[${s.id}] Src: "${s.source}"`);
    });
    
  } catch (err) {
    console.error('Error during parsing:', err);
  }
}

test();
