const escapeRawAmpersands = (str) => {
  if (typeof str !== "string") return str;
  return str.replace(/&(?!(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/gi, "&amp;");
};

const testCases = [
  "Goods & Service Tax",
  "stamping & E-Signatures",
  "Piramal Finance Ltd. (Formerly Piramal Capital & Housing Finance Ltd.)",
  "This is a test &amp; it has existing entities like &lt;tag&gt; and &#39;quotes&#39;.",
  "Check this & invalid entity &wrong; and this &x12; and this &#x1a; and &#123;"
];

testCases.forEach((tc, idx) => {
  console.log(`\nTest Case ${idx + 1}:`);
  console.log("  Input: ", tc);
  console.log("  Output:", escapeRawAmpersands(tc));
});
