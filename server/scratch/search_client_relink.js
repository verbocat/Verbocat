const fs = require("fs");
const path = require("path");

const appJsx = fs.readFileSync("C:\\Users\\Mohit\\Verbocat\\client\\src\\App.jsx", "utf-8");
const relinkPage = fs.readFileSync("C:\\Users\\Mohit\\Verbocat\\client\\src\\components\\RelinkingPage.jsx", "utf-8");

console.log("Searching App.jsx for relink document loading...");
const appLines = appJsx.split("\n");
appLines.forEach((line, i) => {
  if (line.includes("relink") || line.includes("Relink") || line.includes("onLoadRelinkedDocument")) {
    console.log(`App.jsx L${i+1}: ${line.trim()}`);
  }
});

console.log("\nSearching RelinkingPage.jsx for payload...");
const relinkLines = relinkPage.split("\n");
relinkLines.forEach((line, i) => {
  if (line.includes("onLoadRelinkedDocument") || line.includes("segments") || line.includes("relink")) {
    console.log(`RelinkingPage.jsx L${i+1}: ${line.trim()}`);
  }
});
