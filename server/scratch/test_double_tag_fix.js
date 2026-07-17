const assert = require("assert");
const zlib = require("zlib");
const { exportFile } = require("../src/utils/parsers/htmlParser");

console.log("Running Double-Tagging & Tag ID Fix Verification...");

// Construct a mock template JSON with tagMap
const tagMap = [
  ["<1>", "<h1 class=\"main-title\">"],
  ["</1>", "</h1>"],
  ["<2>", "<b>"],
  ["</2>", "</b>"]
];

const templateObj = {
  html: "<div class=\"content\">__SEG_0__</div>",
  tagMap: tagMap,
  segmentTags: [
    { id: 0, leading: "<1>", trailing: "</1>" }
  ]
};

const templateBase64 = zlib.gzipSync(Buffer.from(JSON.stringify(templateObj), "utf-8")).toString("base64");

// Scenario A: Target already contains outer leading "<1>" and trailing "</1>"
{
  const segmentsWithOuterTags = [
    {
      id: 0,
      source: "Heading Text",
      target: "<1>शीर्षक पाठ</1>",
      leading: "<1>",
      trailing: "</1>"
    }
  ];

  exportFile(templateBase64, segmentsWithOuterTags).then(buffer => {
    const outputHtml = buffer.toString("utf-8");
    console.log("Output HTML A:", outputHtml);

    // Assert that <h1 class="main-title"> appears exactly ONCE (no double tagging)
    const occurrences = (outputHtml.match(/<h1 class="main-title">/g) || []).length;
    assert.strictEqual(occurrences, 1, "Should have exactly ONE <h1> tag");
    assert.ok(outputHtml.includes("<h1 class=\"main-title\">शीर्षक पाठ</h1>"), "Clean HTML output");
    console.log("✓ Test Scenario A passed: Duplicate outer tags stripped cleanly without double-tagging.");
  });
}

// Scenario B: Target contains internal tags (<2>bold</2>) + outer tags
{
  const segmentsWithInnerTags = [
    {
      id: 0,
      source: "Welcome <2>bold</2>",
      target: "<1>स्वागत <2>गहरे</2></1>",
      leading: "<1>",
      trailing: "</1>"
    }
  ];

  exportFile(templateBase64, segmentsWithInnerTags).then(buffer => {
    const outputHtml = buffer.toString("utf-8");
    console.log("Output HTML B:", outputHtml);

    const h1Occurrences = (outputHtml.match(/<h1 class="main-title">/g) || []).length;
    const boldOccurrences = (outputHtml.match(/<b>/g) || []).length;

    assert.strictEqual(h1Occurrences, 1, "Should have exactly ONE <h1> tag");
    assert.strictEqual(boldOccurrences, 1, "Should have exactly ONE <b> tag");
    assert.ok(outputHtml.includes("<h1 class=\"main-title\">स्वागत <b>गहरे</b></h1>"), "Inner tags preserved cleanly");
    console.log("✓ Test Scenario B passed: Inner tags and outer tags restored cleanly.");
  });
}
