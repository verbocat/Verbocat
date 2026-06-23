const fs = require("fs");
const { parseFile } = require("../src/utils/parsers/htmlParser");

async function run() {
  const filePath = "C:/Users/divya/Downloads/Meet Our Leadership Team _ Airtel Payments Bank_hi (1).html";
  const result = await parseFile(filePath);
  
  console.log("Searching segments for keywords...");
  result.segments.forEach(seg => {
    if (seg.source.includes("अमर") || seg.source.includes("नियामक") || seg.source.includes("हनी") || seg.source.includes("पूजा")) {
      console.log(`Segment ${seg.id}: ${seg.source}`);
    }
  });
}

run();
