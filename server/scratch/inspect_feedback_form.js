const { supabase } = require("../src/config/supabase");
const JSZip = require("jszip");

async function inspectFeedbackForm() {
  const docId = "189bde3b-53a3-4764-8617-6a029bc19592";
  console.log("Inspecting docId:", docId);

  const { data: doc } = await supabase.from("documents").select("*").eq("id", docId).single();
  console.log("Doc details:", doc);

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
  console.log("word/document.xml length:", docXml.length);

  const matches = Array.from(docXml.matchAll(/__SEG_(\d+)__/g));
  console.log("Placeholders count in document.xml:", matches.length);
  matches.forEach(m => console.log("Placeholder found:", m[0], "ID:", m[1]));

  const paragraphs = Array.from(docXml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi));
  console.log("Total <w:p> paragraphs:", paragraphs.length);
  paragraphs.forEach((p, idx) => {
    const textMatches = Array.from(p[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)).map(m => m[1]);
    console.log(`P${idx + 1}:`, textMatches.join(""));
  });
}

inspectFeedbackForm();
