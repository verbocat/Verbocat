const { supabase } = require("../src/config/supabase");
const JSZip = require("jszip");

async function inspectPXml() {
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
  const paragraphs = Array.from(docXml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi));

  console.log("--- Paragraph 1 XML ---");
  console.log(paragraphs[0] ? paragraphs[0][0] : "P1 missing");

  console.log("--- Paragraph 2 XML ---");
  console.log(paragraphs[1] ? paragraphs[1][0] : "P2 missing");

  console.log("--- Paragraph 3 XML ---");
  console.log(paragraphs[2] ? paragraphs[2][0] : "P3 missing");
}

inspectPXml();
