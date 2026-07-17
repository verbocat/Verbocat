const { processRelinkDualFiles } = require('./src/utils/parsers/relinkEngine');

processRelinkDualFiles('../client/src/testing/source.html', '../client/src/testing/target.html')
  .then(res => {
    console.log('Total segments:', res.segments.length);

    const segs = res.segments.filter(s => s.source.includes('untimely death') || s.source.includes('Termination or expiration'));
    console.log('\nSegments for Block 137:');
    segs.forEach(s => {
      console.log('--- Segment ID:', s.id, 'BlockIndex:', s.blockIndex);
      console.log('SRC:', JSON.stringify(s.source));
      console.log('TGT:', JSON.stringify(s.target));
    });
  });
