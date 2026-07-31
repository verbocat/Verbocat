require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { processUploadedFile } = require('./src/services/fileService');
const { supabase } = require('./src/config/supabase');

async function testUpload() {
  console.log("=== Testing File Processing Pipeline ===");

  // Create a sample HTML test file
  const testFilePath = path.join(__dirname, 'test_sample_doc.html');
  const sampleHtml = `<!DOCTYPE html>
<html>
<head><title>Test Upload Document</title></head>
<body>
  <h1>Sample Document Heading</h1>
  <p>This is a test paragraph for upload validation.</p>
</body>
</html>`;
  fs.writeFileSync(testFilePath, sampleHtml, 'utf-8');

  // Simulated multer file object
  const mockFile = {
    path: testFilePath,
    originalname: 'test_sample_doc.html',
    mimetype: 'text/html'
  };

  try {
    console.log("1. Running processUploadedFile...");
    const result = await processUploadedFile(mockFile);
    console.log("   Process result:", {
      type: result.type,
      fileId: result.fileId,
      segmentsCount: result.segments ? result.segments.length : 0,
      originalName: result.originalName
    });

    console.log("\n2. Verifying database insertion into `html_files`...");
    const { data: htmlFile, error: htmlErr } = await supabase
      .from('html_files')
      .select('id')
      .eq('id', result.fileId)
      .maybeSingle();

    if (htmlErr) {
      console.error("❌ `html_files` fetch error:", htmlErr);
    } else if (htmlFile) {
      console.log("   ✅ `html_files` record exists:", htmlFile.id);
    } else {
      console.error("❌ `html_files` record NOT found!");
    }

    console.log("\n3. Testing `documents` table insertion...");
    const testDocId = result.fileId;
    // Get a user ID from profiles or auth if available, or use a dummy uuid
    const { data: profile } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
    const userId = profile ? profile.id : '00000000-0000-0000-0000-000000000000';

    const { error: docError } = await supabase
      .from('documents')
      .insert({
        id: testDocId,
        name: result.originalName,
        owner_id: userId,
        file_id: result.fileId,
        source_lang: 'en',
        target_lang: 'hi'
      });

    if (docError) {
      console.error("❌ `documents` insert error:", docError);
    } else {
      console.log("   ✅ `documents` insert successful!");
    }

    console.log("\n4. Testing `document_segments` table insertion...");
    const segmentInserts = result.segments.map((seg, idx) => ({
      document_id: testDocId,
      segment_index: idx,
      source_text: seg.source || '',
      target_text: seg.target || '',
      status: 'draft'
    }));

    const { error: segError } = await supabase
      .from('document_segments')
      .insert(segmentInserts);

    if (segError) {
      console.error("❌ `document_segments` insert error:", segError);
    } else {
      console.log("   ✅ `document_segments` insert successful!");
    }

    // Cleanup test records
    console.log("\n5. Cleaning up test records from database...");
    await supabase.from('document_segments').delete().eq('document_id', testDocId);
    await supabase.from('documents').delete().eq('id', testDocId);
    await supabase.from('html_files').delete().eq('id', result.fileId);
    console.log("   ✅ Cleanup complete!");

  } catch (err) {
    console.error("❌ Exception during testUpload:", err);
  } finally {
    if (fs.existsSync(testFilePath)) {
      try { fs.unlinkSync(testFilePath); } catch (_) {}
    }
  }
}

testUpload();
