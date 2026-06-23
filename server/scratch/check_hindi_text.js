const fs = require("fs");

const filePath = "C:/Users/divya/Downloads/Meet Our Leadership Team _ Airtel Payments Bank_hi (1).html";
const content = fs.readFileSync(filePath, "utf8");

const hasText = content.includes("नियामक रिपोर्टिंग");
console.log(`File contains the Hindi text 'नियामक रिपोर्टिंग': ${hasText}`);
