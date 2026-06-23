const { supabase } = require('../src/config/supabase');

async function run() {
  try {
    console.log('Querying documents...');
    const { data: docs, error: docError } = await supabase
      .from('documents')
      .select('id, name, created_at, source_lang, target_lang')
      .order('created_at', { ascending: false })
      .limit(10);

    if (docError) throw docError;

    console.log(`Found ${docs.length} documents:`);
    for (const doc of docs) {
      const { count, error: countError } = await supabase
        .from('document_segments')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', doc.id);
      
      console.log(`Document: "${doc.name}" | ID: ${doc.id} | Created: ${doc.created_at} | Langs: ${doc.source_lang} -> ${doc.target_lang} | Segments in DB: ${countError ? 'error' : count}`);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
