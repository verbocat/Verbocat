const { processRelinkDualFiles } = require('./src/utils/parsers/relinkEngine');

processRelinkDualFiles('../client/src/testing/source.html', '../client/src/testing/target.html')
  .then(res => {
    const segs1259 = res.segments.filter(s => s.blockIndex === 1259);
    console.log('=== SOURCE SEGMENTS FOR BLOCK 1259 ===');
    segs1259.forEach(s => {
      console.log(`Seg ID ${s.id}:`, JSON.stringify(s.source));
    });

    const segsAll = res.segments.filter(s => s.blockIndex >= 1255 && s.blockIndex <= 1265);
    console.log('\n=== ALL SEGMENTS FOR BLOCKS 1255-1265 ===');
    segsAll.forEach(s => {
      console.log(`Block #${s.blockIndex} (ID ${s.id}):`, JSON.stringify(s.source));
    });
  });
