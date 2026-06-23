const { supabase } = require('../src/config/supabase');

async function run() {
  const documentId = 'b9a70420-ba8b-48ec-85ea-cc6665e78c37';
  try {
    const { data: segments, error } = await supabase
      .from('document_segments')
      .select('segment_index, source_text, target_text')
      .eq('document_id', documentId)
      .order('segment_index', { ascending: true });

    if (error) throw error;

    console.log(`Document ${documentId} has ${segments.length} segments in DB.`);
    
    const nonTrivial = segments.filter(s => s.source_text.trim().length > 0);
    console.log(`Non-empty segments in DB: ${nonTrivial.length}`);

    // Print first 5 and last 5
    console.log('\nFirst 5 segments in DB:');
    segments.slice(0, 5).forEach(s => {
      console.log(`[${s.segment_index}] "${s.source_text}"`);
    });

    console.log('\nLast 5 segments in DB:');
    segments.slice(-5).forEach(s => {
      console.log(`[${s.segment_index}] "${s.source_text}"`);
    });

  } catch (err) {
    console.error('Error:', err);
  }
}

run();
