const { supabase } = require("../src/config/supabase");
const JSZip = require("jszip");

async function inspectDemoTemplate() {
  const fileId = "67bf89ae-d485-48f4-8372-2fb059f7c43c";
  console.log("Inspecting template for file_id:", fileId);

  const { data, error } = await supabase
    .from("html_files")
    .select("content")
    .eq("id", fileId)
    .single();

  if (error || !data || !data.content) {
    console.error("Error fetching template:", error);
    return;
  }

  console.log("Template content length:", data.content.length);

  // Decode template Base64
  const rawBuffer = Buffer.from(data.content, "base64");
  console.log("Decoded buffer length:", rawBuffer.length);

  // Unzip template package
  let zip;
  if (rawBuffer[0] === 0x50 && rawBuffer[1] === 0x4b) {
    const packageZip = await JSZip.loadAsync(rawBuffer);
    if (packageZip.files["template.zip"]) {
      console.log("Found template.zip inside packageZip!");
      const templateBuffer = await packageZip.file("template.zip").async("nodebuffer");
      zip = await JSZip.loadAsync(templateBuffer);
    } else {
      zip = packageZip;
    }
  }

  if (!zip) {
    console.error("Could not load JSZip from rawBuffer.");
    return;
  }

  const docXml = await zip.file("word/document.xml").async("string");
  console.log("word/document.xml length:", docXml.length);

  // Search for all placeholders like __SEG_X__ in word/document.xml
  const matches = docXml.match(/__SEG_\d+__/g) || [];
  console.log("Found __SEG_X__ placeholders count in word/document.xml:", matches.length);
  console.log("Placeholders found:", matches);

  // Also log paragraphs in document.xml
  const paragraphs = docXml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi) || [];
  console.log("Total <w:p> paragraphs in word/document.xml:", paragraphs.length);
  paragraphs.forEach((p, idx) => {
    // Extract text content inside <w:t>
    const textMatches = Array.from(p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)).map(m => m[1]);
    console.log(`Paragraph ${idx + 1}:`, textMatches.join(""));
  });
}

inspectDemoTemplate();
