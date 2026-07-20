const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const cheerio = require("cheerio");

const { parseFile, exportFile } = require("../src/utils/parsers/htmlParser");

const sampleHtml = `<!DOCTYPE html>
<html>
<HEAD>
  <link href="https://fonts.googleapis.com/css?family=Catamaran:400,700" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css?family=Nunito:400,700" rel="stylesheet" />
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <TITLE>XHTML Test Page</TITLE>
</HEAD>
<body>
  <div class="container">
    Mixed text start
    <H1>Title of the page</H1>
    <p>This is a paragraph with <br /> a line break, and <img src="image.png" />. Second sentence.</p>
    Mixed text end
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

  const hasLink1 = exportedString.includes('<link href="https://fonts.googleapis.com/css?family=Catamaran:400,700" rel="stylesheet" />');
  const hasLink2 = exportedString.includes('<link href="https://fonts.googleapis.com/css?family=Nunito:400,700" rel="stylesheet" />');
  const hasMeta1 = exportedString.includes('<meta charset="UTF-8" />');
  const hasMeta2 = exportedString.includes('<meta name="viewport" content="width=device-width,initial-scale=1" />');
  const hasMeta3 = exportedString.includes('<meta name="x-apple-disable-message-reformatting" />');

  console.log("Preserved Link 1?", hasLink1);
  console.log("Preserved Link 2?", hasLink2);
  console.log("Preserved Meta 1?", hasMeta1);
  console.log("Preserved Meta 2?", hasMeta2);
  console.log("Preserved Meta 3?", hasMeta3);

  if (hasLink1 && hasLink2 && hasMeta1 && hasMeta2 && hasMeta3) {
    console.log("SUCCESS: Self-closing link/meta tags are perfectly preserved on new upload!");
    process.exit(0);
  } else {
    console.error("FAILURE: Some self-closing tags were stripped!");
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
