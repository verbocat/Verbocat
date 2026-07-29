const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { supabase } = require("../src/config/supabase");
const htmlParser = require("../src/utils/parsers/htmlParser");

(async () => {
  const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_DIGITAL_LOAN_AGREEMENT_PROD.html';
  console.log('--- RE-PARSING AND UPDATING SUPABASE DB TEMPLATES ---');

  if (!fs.existsSync(srcPath)) {
    console.error('Source HTML file not found at:', srcPath);
    return;
  }

  // 1. Generate new clean template
  const { template: freshTemplate, segments } = await htmlParser.parseFile(srcPath);
  console.log(`Generated fresh template size: ${freshTemplate.length} bytes, extracted ${segments.length} segments.`);

  // 2. Fetch all document entries matching SCUBL_DIGITAL_LOAN_AGREEMENT_PROD
  const { data: docs, error: docErr } = await supabase
    .from("documents")
    .select("id, file_id, name")
    .ilike("name", "%SCUBL%");

  if (docErr) {
    console.error("Error fetching docs from Supabase:", docErr);
    return;
  }

  console.log(`Found ${docs ? docs.length : 0} matching document records in Supabase:`);
  if (docs && docs.length > 0) {
    for (const doc of docs) {
      console.log(`Updating html_files for doc: ${doc.name} (ID: ${doc.id}, FileID: ${doc.file_id})...`);
      
      // Update html_files for both doc.id and doc.file_id
      const targetIds = [doc.id, doc.file_id].filter(Boolean);
      for (const id of targetIds) {
        const { error: updateErr } = await supabase
          .from("html_files")
          .upsert([{ id: id, content: freshTemplate }]);
        if (updateErr) {
          console.error(`Failed to update html_files id ${id}:`, updateErr);
        } else {
          console.log(`  Successfully updated html_files entry for ID: ${id}`);
        }
      }
    }
  }

  console.log('--- DB TEMPLATE UPDATE COMPLETE ---');
})();
