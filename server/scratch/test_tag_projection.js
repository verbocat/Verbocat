const assert = require("assert");
const { projectSourceTagsOntoTarget } = require("../src/utils/parsers/relinkEngine");

console.log("Running Source-Tag Projection Unit Tests...");

// Test Case 1: Target text completely missing tags -> English Source tags projected 100%
{
  const sourceText = "Welcome to <1>our official</1> website with <2>great deals</2>.";
  const targetText = "हमारी आधिकारिक वेबसाइट पर उत्कृष्ट सौदों के साथ स्वागत है।";
  const result = projectSourceTagsOntoTarget(sourceText, targetText);

  assert.ok(result.includes("<1>") && result.includes("</1>"), "Tag <1> projected");
  assert.ok(result.includes("<2>") && result.includes("</2>"), "Tag <2> projected");
  console.log("✓ Test 1 Passed: Missing tags projected 100% onto target text.");
  console.log("   Result:", result);
}

// Test Case 2: Target text already has matching tags -> Intact tags preserved
{
  const sourceText = "Please <1>click here</1> to continue.";
  const targetText = "कृपया जारी रखने के लिए <1>यहाँ क्लिक करें</1>।";
  const result = projectSourceTagsOntoTarget(sourceText, targetText);

  assert.strictEqual(result, targetText);
  console.log("✓ Test 2 Passed: Intact target tags preserved cleanly.");
}

// Test Case 3: Target text has 1 tag missing -> Missing tag projected while keeping existing tag
{
  const sourceText = "Read <1>terms</1> and <2>privacy policy</2>.";
  const targetText = "शर्तें และ <2>गोपनीयता नीति</2> पढ़ें।"; // missing <1>
  const result = projectSourceTagsOntoTarget(sourceText, targetText);

  assert.ok(result.includes("<1>") && result.includes("</1>"), "Missing tag <1> projected");
  assert.ok(result.includes("<2>") && result.includes("</2>"), "Existing tag <2> retained");
  console.log("✓ Test 3 Passed: Partial missing tag projected.");
  console.log("   Result:", result);
}

console.log("All Source-Tag Projection Unit Tests Passed Successfully!");
