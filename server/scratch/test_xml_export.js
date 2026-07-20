const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const cheerio = require("cheerio");

const { parseFile, exportFile } = require("../src/utils/parsers/htmlParser");

const sampleHtml = `<!DOCTYPE html>
<html>
<HEAD>
  <META CharSet="utf-8">
  <TITLE>XHTML Test Page</TITLE>
</HEAD>
<body>
  <div class="container" data-relink-table-id="123">
    Mixed text start
    <H1>Title of the page</H1>
    <p>This is a paragraph with <br /> a line break, and <img src="image.png" />. Second sentence.</p>
    Mixed text end
    <div id="footer">
      <span>Footer text</span>
    </div>
  </div>
</body>
</html>`;

async function runTest() {
  const tempFilePath = path.join(__dirname, "temp_test_xml.html");
  fs.writeFileSync(tempFilePath, sampleHtml, "utf-8");

  console.log("Parsing XML File...");
  const parseResult = await parseFile(tempFilePath);
  fs.unlinkSync(tempFilePath);

  console.log("Parsed Segments:", parseResult.segments);

  const translatedSegments = parseResult.segments.map(seg => ({
    ...seg,
    target: seg.source + " [TRANSLATED]"
  }));

  console.log("Exporting File...");
  const exportedBuffer = await exportFile(parseResult.template, translatedSegments);
  const exportedString = exportedBuffer.toString("utf-8");

  console.log("\n--- Exported Output ---");
  console.log(exportedString);
  console.log("-----------------------\n");

  // Verify non-whitespace characters preservation outside translation
  const originalStripped = sampleHtml
    .replace(/Mixed text start/g, "TEXT")
    .replace(/Title of the page/g, "TEXT")
    .replace(/This is a paragraph with <br \/> a line break, and <img src="image.png" \/>\./g, "TEXT")
    .replace(/Second sentence\./g, "TEXT")
    .replace(/Mixed text end/g, "TEXT")
    .replace(/Footer text/g, "TEXT");
  
  const exportedStripped = exportedString
    .replace(/Mixed text start \[TRANSLATED\]/g, "TEXT")
    .replace(/Title of the page \[TRANSLATED\]/g, "TEXT")
    .replace(/This is a paragraph with <br \/> a line break, and <img src="image.png" \/>\. \[TRANSLATED\]/g, "TEXT")
    .replace(/Second sentence\. \[TRANSLATED\]/g, "TEXT")
    .replace(/Mixed text end \[TRANSLATED\]/g, "TEXT")
    .replace(/Footer text \[TRANSLATED\]/g, "TEXT");

  const cleanOriginal = originalStripped.replace(/\s+/g, "");
  const cleanExported = exportedStripped.replace(/\s+/g, "");

  console.log("Are original and exported structurally identical outside translation?", cleanOriginal === cleanExported);
  if (cleanOriginal !== cleanExported) {
    console.log("Original clean:", cleanOriginal);
    console.log("Exported clean:", cleanExported);
    process.exit(1);
  }

  // Check if tags like <META CharSet="utf-8"> and <br /> are exactly preserved
  const hasMeta = exportedString.includes('<META CharSet="utf-8">');
  const hasBr = exportedString.includes('<br />');
  const hasImg = exportedString.includes('<img src="image.png" />');
  const hasHEAD = exportedString.includes('<HEAD>');

  console.log("Preserved <META CharSet=\"utf-8\">?", hasMeta);
  console.log("Preserved <br />?", hasBr);
  console.log("Preserved <img src=\"image.png\" />?", hasImg);
  console.log("Preserved <HEAD>?", hasHEAD);

  if (hasMeta && hasBr && hasImg && hasHEAD) {
    console.log("SUCCESS: Document formatting and exact tags are perfectly preserved!");
    process.exit(0);
  } else {
    console.error("FAILURE: Some tags were mutated or reformatted!");
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
