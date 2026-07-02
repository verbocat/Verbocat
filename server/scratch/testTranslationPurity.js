const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { translateChunk } = require("../src/services/translationProviders");

async function run() {
  console.log("Testing translation providers with the new script purity logic...");
  try {
    const results = await translateChunk(
      ["Borrower must pay the fee.", "Welcome to our office."],
      "hi",
      "en",
      undefined,
      { tone: "Formal", formality: "Formal" }
    );
    console.log("Translation results:", JSON.stringify(results, null, 2));
  } catch (err) {
    console.error("Test failed:", err.message);
  }
}
run();
