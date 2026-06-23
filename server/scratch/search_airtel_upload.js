const fs = require("fs");
const path = require("path");

const uploadsDir = "c:/Users/divya/Desktop/matecat/server/uploads";
const files = fs.readdirSync(uploadsDir);

files.forEach(file => {
  const filePath = path.join(uploadsDir, file);
  try {
    const content = fs.readFileSync(filePath, "utf8");
    if (content.includes("Airtel") || content.includes("Anubrata")) {
      console.log(`File ${file} contains Airtel/Anubrata! Size: ${fs.statSync(filePath).size} bytes`);
    }
  } catch (e) {
    // skip directories or binary files
  }
});
