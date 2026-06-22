const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { translateSegmentWithVision } = require("../src/services/translationProviders");

async function runTest() {
  try {
    console.log("Running context-aware translation test...");
    const result = await translateSegmentWithVision({
      sourceText: "Home",
      targetLang: "hi",
      sourceLang: "en",
      contextJira: "As a website visitor, I want to click the Home link in the main navigation menu to return to the main landing page.",
      contextDescription: "This is a website navigation menu item. Avoid literal translation 'घर' (Ghar). Translate it as standard website 'होम' or similar natural terminology.",
      screenshotBuffer: null, // Test text context first
      screenshotMimeType: null
    });

    console.log("Translation Result:", result);
    if (result === "होम") {
      console.log("Success! The AI used common sense to translate 'Home' as 'होम' instead of literal 'घर'.");
    } else {
      console.log("Result:", result);
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
}

runTest();
