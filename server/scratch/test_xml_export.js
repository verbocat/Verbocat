const fs = require("fs");
const path = require("path");
const { parseFile, exportFile } = require("../src/utils/parsers/htmlParser");

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <header>
    <meta name="test" content="value" />
    <title>XHTML Valid XML Document</title>
  </header>
  <body>
    <h1>Strict XHTML Test</h1>
    <p>This is a paragraph with <br /> a line break, an image <img src="logo.png" /> and a <col width="100" /> column.</p>
    <p>Let's check if the tags are perfectly closed.</p>
  </body>
</document>`;

// Simple tag validator
function isValidXml(str) {
  if (!str || typeof str !== "string") return false;

  const stack = [];
  let i = 0;
  const len = str.length;

  while (i < len) {
    const nextTag = str.indexOf("<", i);
    if (nextTag === -1) {
      break;
    }
    i = nextTag;

    // CDATA
    if (str.startsWith("<![CDATA[", i)) {
      const closeCdata = str.indexOf("]]>", i + 9);
      if (closeCdata === -1) return false;
      i = closeCdata + 3;
      continue;
    }

    // Comment
    if (str.startsWith("<!--", i)) {
      const closeComment = str.indexOf("-->", i + 4);
      if (closeComment === -1) return false;
      i = closeComment + 3;
      continue;
    }

    // Processing instruction / XML declaration
    if (str.startsWith("<?", i)) {
      const closePI = str.indexOf("?>", i + 2);
      if (closePI === -1) return false;
      i = closePI + 2;
      continue;
    }

    // Doctype
    if (str.startsWith("<!", i)) {
      const closeDoc = str.indexOf(">", i + 2);
      if (closeDoc === -1) return false;
      i = closeDoc + 1;
      continue;
    }

    // Tag: find close tag, ignoring '>' inside quotes
    let closeTag = -1;
    let insideQuotes = false;
    let quoteChar = null;
    for (let k = i + 1; k < len; k++) {
      const char = str[k];
      if (insideQuotes) {
        if (char === quoteChar) {
          insideQuotes = false;
          quoteChar = null;
        }
      } else {
        if (char === '"' || char === "'") {
          insideQuotes = true;
          quoteChar = char;
        } else if (char === ">") {
          closeTag = k;
          break;
        }
      }
    }

    if (closeTag === -1) return false;

    let tagContent = str.slice(i + 1, closeTag).trim();
    i = closeTag + 1;

    // Self-closing tag
    if (tagContent.endsWith("/")) {
      tagContent = tagContent.slice(0, -1).trim();
      const tagNameMatch = tagContent.match(/^([a-zA-Z0-9:-]+)/);
      if (!tagNameMatch) return false;
      continue;
    }

    // End tag
    if (tagContent.startsWith("/")) {
      const tagName = tagContent.slice(1).trim();
      if (stack.length === 0) return false;
      const lastOpen = stack.pop();
      if (lastOpen !== tagName) return false;
      continue;
    }

    // Start tag
    const tagNameMatch = tagContent.match(/^([a-zA-Z0-9:-]+)/);
    if (!tagNameMatch) return false;
    const tagName = tagNameMatch[1];

    stack.push(tagName);
  }

  return stack.length === 0;
}

async function runTest() {
  const tempFilePath = path.join(__dirname, "temp_test_xml.xml");
  fs.writeFileSync(tempFilePath, sampleXml, "utf-8");

  console.log("Parsing XML File...");
  const parseResult = await parseFile(tempFilePath);
  
  // Clean up
  fs.unlinkSync(tempFilePath);

  console.log("Parsed Segments:", parseResult.segments);
  
  // Set some translated targets
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

  const valid = isValidXml(exportedString);
  console.log(`Validation result: is valid XML? ${valid}`);

  if (valid) {
    console.log("SUCCESS: Exported document remains perfectly valid XML!");
    process.exit(0);
  } else {
    console.error("FAILURE: Exported document contains XML tag mismatches!");
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
