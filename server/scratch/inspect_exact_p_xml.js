const { supabase } = require("../src/config/supabase");
const JSZip = require("jszip");

async function inspectDocxXml() {
  const fileId = "6eef2212-4bcd-4383-beab-a505fe8854c5";
  const { data: htmlData } = await supabase.from("html_files").select("content").eq("id", fileId).single();
  
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

  console.log("Total <w:p> paragraphs:", paragraphs.length);
  paragraphs.slice(0, 10).forEach((p, idx) => {
    console.log(`\n--- PARAGRAPH ${idx + 1} XML ---`);
    console.log(p[0]);
  });
}

inspectDocxXml();
