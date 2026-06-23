const fs = require('fs');
const { parseFile } = require('../src/utils/parsers/htmlParser');
const { exportHtml } = require('../src/services/fileService');
const { supabase } = require('../src/config/supabase');

async function test() {
  try {
    const englishPath = 'C:\\Users\\divya\\Downloads\\Meet Our Leadership Team _ Airtel Payments Bank.html';
    
    console.log('1. Parsing English file...');
    const parseResult = await parseFile(englishPath);
    console.log(`Parsed ${parseResult.segments.length} segments.`);

    // Simulate database saving and client formatting (1-indexed IDs)
    const clientSegments = parseResult.segments.map((seg, idx) => ({
      id: idx + 1, // 1-indexed just like client segments
      source: seg.source,
      target: seg.source + ' (HI)', // simulated translation
      leading: seg.leading,
      trailing: seg.trailing
    }));

    // In order to call exportHtml, we need to temporarily store the template in the database
    // under a dummy ID, or we can mock/override the database fetch.
    // Let's create a test document/template ID and save it.
    const testFileId = 'a1234567-b123-c123-d123-e1234567890a';
    console.log('2. Storing template in DB...');
    await supabase.from('html_files').delete().eq('id', testFileId);
    const { error: insertError } = await supabase
      .from('html_files')
      .insert([{ id: testFileId, content: parseResult.template }]);

    if (insertError) throw insertError;

    console.log('3. Exporting file using exportHtml service...');
    const exportedBuffer = await exportHtml(testFileId, clientSegments, '.html');
    const exportedHtml = exportedBuffer.toString('utf-8');

    // 4. Verify no placeholders are left
    const placeholdersLeft = exportedHtml.match(/__SEG_\d+__/g) || [];
    console.log(`Placeholders left in exported HTML: ${placeholdersLeft.length}`);
    if (placeholdersLeft.length > 0) {
      console.log('First 5 placeholders left:', placeholdersLeft.slice(0, 5));
    }

    // Clean up
    await supabase.from('html_files').delete().eq('id', testFileId);

    if (placeholdersLeft.length === 0) {
      console.log('✅ Export test passed successfully! No placeholders were leaked.');
    } else {
      console.error('❌ Export test failed! Some placeholders were not replaced.');
      process.exit(1);
    }

  } catch (err) {
    console.error('Error during test:', err);
    process.exit(1);
  }
}

test();
