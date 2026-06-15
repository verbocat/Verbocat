const { generateXliff, generateTmx, parseXliff, parseTmx } = require("../server/src/utils/exporters");

const mockSegments = [
  { id: 1, source: "Safety & Security", target: "सुरक्षा और संरक्षा" },
  { id: 2, source: "Collection", target: "वसूली" },
  { id: 3, source: "Unfinished Segment", target: "" }
];

console.log("=== Testing XLIFF Generation ===");
const xliff = generateXliff(mockSegments, "en", "hi", "test_doc.html");
console.log(xliff);

console.log("=== Testing TMX Generation ===");
const tmx = generateTmx(mockSegments, "en", "hi");
console.log(tmx);

console.log("=== Testing XLIFF Parsing ===");
const parsedXliff = parseXliff(xliff);
console.log("Parsed XLIFF:", parsedXliff);

console.log("=== Testing TMX Parsing ===");
const parsedTmx = parseTmx(tmx);
console.log("Parsed TMX:", parsedTmx);

if (parsedXliff.length === 3 && parsedTmx.length === 2) {
  console.log("✅ All tests passed successfully!");
} else {
  console.error("❌ Test verification failed!");
  process.exit(1);
}
