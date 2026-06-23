const { parseFile } = require("../src/utils/parsers/htmlParser");

async function run() {
  const filePath = "c:/Users/divya/Desktop/matecat/server/uploads/5cf306a9d72070ab7993222592c81183";
  try {
    const result = await parseFile(filePath);
    console.log(`Successfully parsed 5cf306a9d72070ab7993222592c81183. Segments: ${result.segments.length}`);
    if (result.segments.length > 0) {
      console.log("Sample segment:", result.segments[0]);
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

run();
