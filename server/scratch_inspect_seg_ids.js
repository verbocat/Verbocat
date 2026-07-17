const { processRelinkDualFiles } = require('./src/utils/parsers/relinkEngine');
const { parseFile } = require('./src/utils/parsers/htmlParser');

async function checkSegIds() {
  const pf = await parseFile('../client/src/testing/source.html');
  const pr = await processRelinkDualFiles('../client/src/testing/source.html', '../client/src/testing/target.html');

  console.log('parseFile total segments:', pf.segments.length);
  console.log('processRelink total segments:', pr.segments.length);

  console.log('\nparseFile Segments for Block 10:');
  pf.segments.filter(s => s.blockIndex === 10).forEach(s => console.log(`  ID ${s.id}: ${JSON.stringify(s.source)}`));

  console.log('\nprocessRelink Segments for Block 10:');
  pr.segments.filter(s => s.blockIndex === 10).forEach(s => console.log(`  ID ${s.id}: ${JSON.stringify(s.source)} -> TGT: ${JSON.stringify(s.target)}`));
}

checkSegIds().catch(err => console.error(err));
