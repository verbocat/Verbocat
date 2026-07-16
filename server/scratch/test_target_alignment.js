const assert = require("assert");
const { splitTargetBlockToN } = require("../src/utils/parsers/targetAligner");

console.log("Running comprehensive targetAligner unit tests...");

// Test Case 1: Single target segment matching single source segment
{
  const targetText = "This is a simple translated sentence with <1>bold text</1>.";
  const sourceSubSegments = [{ segment_index: 0, source_text: "This is a simple sentence with <1>bold text</1>." }];
  const result = splitTargetBlockToN(targetText, 1, sourceSubSegments, null, null);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0], targetText);
  console.log("✓ Test Case 1 passed: Single segment preservation");
}

// Test Case 2: Target block with 2 tagged sentences matching 2 source segments (Tag integrity test)
{
  const targetText = "<1>यह पहला वाक्य है।</1> <2>यह दूसरा वाक्य है जिसमें <3>टैग</3> है।</2>";
  const sourceSubSegments = [
    { segment_index: 0, source_text: "<1>This is the first sentence.</1>" },
    { segment_index: 1, source_text: "<2>This is the second sentence containing a <3>tag</3>.</2>" }
  ];
  const result = splitTargetBlockToN(targetText, 2, sourceSubSegments, null, null);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0], "<1>यह पहला वाक्य है।</1>");
  assert.strictEqual(result[1], "<2>यह दूसरा वाक्य है जिसमें <3>टैग</3> है।</2>");
  console.log("✓ Test Case 2 passed: Exact 2-sentence tagged split alignment");
}

// Test Case 3: 100-word block without internal punctuation in target, split into 2 50-word source segments
{
  const targetText = "<1>Word1 Word2 Word3 Word4 Word5</1> Word6 Word7 Word8 Word9 Word10";
  const sourceSubSegments = [
    { segment_index: 0, source_text: "Fifty percent of content here" }, // 29 chars
    { segment_index: 1, source_text: "The remaining fifty percent content" } // 35 chars
  ];
  const result = splitTargetBlockToN(targetText, 2, sourceSubSegments, null, null);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0], "<1>Word1 Word2 Word3 Word4 Word5</1>");
  assert.strictEqual(result[1], "Word6 Word7 Word8 Word9 Word10");
  console.log("✓ Test Case 3 passed: Word ratio split with inline tags preserved");
}

// Test Case 4: Target block with 3 sentences matching 2 source segments
{
  const targetText = "First sentence. Second sentence. Third sentence.";
  const sourceSubSegments = [
    { segment_index: 0, source_text: "First English segment sentence." },
    { segment_index: 1, source_text: "Second English segment sentence with more text included." }
  ];
  const result = splitTargetBlockToN(targetText, 2, sourceSubSegments, null, null);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0] + " " + result[1], targetText);
  console.log("✓ Test Case 4 passed: Multi-sentence bucketed split");
}

console.log("All comprehensive targetAligner unit tests passed successfully!");
