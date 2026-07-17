const fs = require('fs');
const cheerio = require('cheerio');
const { parseFile } = require('./src/utils/parsers/htmlParser');
const { getLeafTextBlocks } = require('./src/utils/parsers/relinkEngine');

async function checkBlockCount() {
  const srcPath = '../client/src/testing/source.html';
  const tgtPath = '../client/src/testing/target.html';

  const parseResult = await parseFile(srcPath);

  const $src = cheerio.load(fs.readFileSync(srcPath, 'utf-8'), { decodeEntities: false });
  const $tgt = cheerio.load(fs.readFileSync(tgtPath, 'utf-8'), { decodeEntities: false });

  const srcLeafBlocks = getLeafTextBlocks($src);
  const tgtLeafBlocks = getLeafTextBlocks($tgt);

  const maxBlockInSegs = Math.max(...parseResult.segments.map(s => s.blockIndex));

  console.log(`parseFile segments max blockIndex: ${maxBlockInSegs}`);
  console.log(`getLeafTextBlocks($src) count: ${srcLeafBlocks.length}`);
  console.log(`getLeafTextBlocks($tgt) count: ${tgtLeafBlocks.length}`);

  // Find where blockIndex diverges
  const segBlockMap = {};
  parseResult.segments.forEach(s => {
    if (!segBlockMap[s.blockIndex]) segBlockMap[s.blockIndex] = [];
    segBlockMap[s.blockIndex].push(s.source);
  });

  for (let i = 0; i < Math.max(maxBlockInSegs, srcLeafBlocks.length); i++) {
    const segText = (segBlockMap[i] || []).join(' ').replace(/<\/?\d+>/g, ' ').replace(/\s+/g, ' ').trim();
    const nodeText = srcLeafBlocks[i] ? $src(srcLeafBlocks[i]).text().trim().replace(/\s+/g, ' ') : 'N/A';

    if (segText !== nodeText) {
      console.log(`\nFIRST DIVERGENCE AT Block #${i}:`);
      console.log('  parseFile segText:', JSON.stringify(segText));
      console.log('  getLeafTextBlocks nodeText:', JSON.stringify(nodeText));
      break;
    }
  }
}

checkBlockCount().catch(err => console.error(err));
