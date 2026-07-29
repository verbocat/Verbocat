const { supabase } = require("../src/config/supabase");
const JSZip = require("jszip");

async function inspectAllXmlFiles() {
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

  const docXmlFiles = Object.keys(zip.files).filter(name => 
    name === 'word/document.xml' || 
    name.match(/^word\/(header|footer)\d+\.xml$/)
  );

  console.log("All XML files found in ZIP:", docXmlFiles);

  for (const file of docXmlFiles) {
    const content = await zip.file(file).async("string");
    const matches = Array.from(content.matchAll(/__SEG_(\d+)__/g));
    console.log(`\n--- File: ${file} (length ${content.length}) ---`);
    console.log("Placeholders:", matches.map(m => m[0]));
    const textTags = Array.from(content.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)).map(m => m[1]);
    console.log("Text content preview:", textTags.slice(0, 5).join(" | "));
  }
}

inspectAllXmlFiles();
