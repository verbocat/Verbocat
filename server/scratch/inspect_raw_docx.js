const { supabase } = require("../src/config/supabase");
const JSZip = require("jszip");

async function inspectRawDocx() {
  const docId = "189bde3b-53a3-4764-8617-6a029bc19592";
  const { data: doc } = await supabase.from("documents").select("*").eq("id", docId).single();

  const { data: htmlData } = await supabase.from("html_files").select("content").eq("id", doc.file_id).single();
  const rawBuffer = Buffer.from(htmlData.content, "base64");

  let zip;
  if (rawBuffer[0] === 0x50 && rawBuffer[1] === 0x4b) {
    const packageZip = await JSZip.loadAsync(rawBuffer);
    if (packageZip.files["template.zip"]) {
      const templateBuffer = await packageZip.file("template.zip").async("nodebuffer");
      zip = await JSZip.loadAsync(templateBuffer);
    } else {
      zip = packageZip;
    }
  }

  const docXml = await zip.file("word/document.xml").async("string");

  console.log("\n--- Chars 2800 to 3600 of document.xml ---");
  console.log(docXml.substring(2800, 3600));
}

inspectRawDocx();
