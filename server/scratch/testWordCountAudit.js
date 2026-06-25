const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { evaluatePartMQM } = require("../src/services/mqmService");

async function testWordCountPartMQM() {
  console.log("Starting Word-Count Part MQM Audit Test...");

  // Let's create a list of segments representing a document part.
  // Segment 0 is correct.
  // Segment 1 has a gender mismatch error: "आपका सहमति" instead of "आपकी सहमति" or "आपका सहमति पत्र".
  // Segment 2 has a transliterated acronym error: "एनआरआई" instead of "NRI".
  // Segment 3 has no translation yet (to test context inclusion).
  const segments = [
    {
      segment_index: 0,
      source_text: "Welcome to Piramal Capital and Housing Finance Limited.",
      target_text: "पिरामल कैपिटल एंड हाउसिंग फाइनेंस लिमिटेड में आपका स्वागत है।",
      context_jira: "Welcome banner text"
    },
    {
      segment_index: 1,
      source_text: "Please note your Consent is mandatory for opening of Account.",
      target_text: "कृपया ध्यान दें कि आपका सहमति खाता खोलने के लिए अनिवार्य है",
      context_jira: "Consent page description",
      context_description: "Consent should be translated as सहमति पत्र"
    },
    {
      segment_index: 2,
      source_text: "This option is only available for NRI customers.",
      target_text: "यह विकल्प केवल एनआरआई ग्राहकों के लिए उपलब्ध है।",
      context_jira: "Eligibility guidelines"
    },
    {
      segment_index: 3,
      source_text: "Please contact our customer support for any further queries.",
      target_text: "",
      context_jira: "Support section"
    }
  ];

  try {
    console.log("\n--- Calling evaluatePartMQM with 4 segments ---");
    const result = await evaluatePartMQM({
      segments,
      targetLang: "hi",
      sourceLang: "en",
      contextSettings: { tone: "Formal", formality: "Formal" },
      model: "gpt-4o"
    });

    console.log("\nRaw Part Evaluation Result:");
    console.log(JSON.stringify(result, null, 2));

    // Verify mapping back to segments (simulating auditDocumentByWordCount's mapping logic)
    const segmentErrorsMap = {};
    for (const seg of segments) {
      segmentErrorsMap[seg.segment_index] = [];
    }

    const cleanText = (t) => String(t || "").replace(/[\s\u200b\u200c\u200d\u00a0]+/g, "").trim();

    console.log("\n--- Mapping Errors Back to Segments ---");
    for (const err of result.errors) {
      const snippet = String(err.snippet || "").trim();
      const correction = String(err.correction || "").trim();
      if (!snippet || !correction || snippet === correction) continue;

      const normalizedSnippet = cleanText(snippet);
      let mappedSegment = null;

      // 1. Try LLM suggested segmentIndex
      const suggestedSeg = segments.find(s => s.segment_index === parseInt(err.segmentIndex, 10));
      if (suggestedSeg && suggestedSeg.target_text) {
        const normTarget = cleanText(suggestedSeg.target_text);
        if (normTarget.toLowerCase().includes(normalizedSnippet.toLowerCase())) {
          mappedSegment = suggestedSeg;
        }
      }

      // 2. Scan all segments in the part
      if (!mappedSegment) {
        for (const seg of segments) {
          if (!seg.target_text) continue;
          const normTarget = cleanText(seg.target_text);
          if (normTarget.toLowerCase().includes(normalizedSnippet.toLowerCase())) {
            mappedSegment = seg;
            break;
          }
        }
      }

      if (mappedSegment) {
        console.log(`[PASS] Mapped error "${snippet}" -> Segment index ${mappedSegment.segment_index}`);
        const exactIdx = mappedSegment.target_text.toLowerCase().indexOf(snippet.toLowerCase());
        const verifiedSnippet = exactIdx !== -1 
          ? mappedSegment.target_text.substring(exactIdx, exactIdx + snippet.length)
          : snippet;

        segmentErrorsMap[mappedSegment.segment_index].push({
          category: err.category || "Accuracy / Mistranslation",
          severity: err.severity || "Minor",
          snippet: verifiedSnippet,
          correction: correction,
          explanation: err.explanation || ""
        });
      } else {
        console.log(`[FAIL/HALLUCINATION] Could not map error "${snippet}" to any segment target text.`);
      }
    }

    // Now check programmatic rules post-processing (acronym/overlapping corrections)
    // We can require it and run internal validation helper tests if needed.
    let score = 100;
    for (const seg of segments) {
      const verifiedErrors = segmentErrorsMap[seg.segment_index] || [];
      
      let score = 100;
      for (const e of verifiedErrors) {
        const severity = (e.severity || "").toLowerCase();
        if (severity === "minor") score -= 3;
        else if (severity === "major") score -= 10;
        else if (severity === "critical") score -= 25;
        else score -= 3;
      }
      score = Math.max(0, score);

      console.log(`Segment ${seg.segment_index}:`);
      console.log(`  Source: "${seg.source_text}"`);
      console.log(`  Target: "${seg.target_text || "(Not translated)"}"`);
      console.log(`  Mapped Errors:`, JSON.stringify(verifiedErrors, null, 2));
      console.log(`  Calculated Score: ${score}`);
    }

  } catch (error) {
    console.error("Test failed:", error);
  }
}

testWordCountPartMQM();
