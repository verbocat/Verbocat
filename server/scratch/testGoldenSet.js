require("dotenv").config({ path: "./.env" });
const fs = require("fs");
const path = require("path");
const { evaluateTranslationMQM } = require("../src/services/mqmService");

async function runGoldenSet() {
  console.log("=========================================");
  console.log("Starting MQM Golden Set Validation Run");
  console.log("=========================================");

  const goldenSetPath = path.join(__dirname, "goldenSet.json");
  if (!fs.existsSync(goldenSetPath)) {
    console.error("goldenSet.json not found!");
    process.exit(1);
  }

  const segments = JSON.parse(fs.readFileSync(goldenSetPath, "utf8"));
  console.log(`Loaded ${segments.length} test segments.`);

  const results = [];
  let tp = 0, fp = 0, fn = 0;

  for (const seg of segments) {
    console.log(`\nAuditing Segment #${seg.id} (${seg.sourceLang} -> ${seg.targetLang})...`);
    console.log(`Source: "${seg.sourceText}"`);
    console.log(`Target: "${seg.translatedText}"`);

    try {
      const evaluation = await evaluateTranslationMQM({
        sourceText: seg.sourceText,
        translatedText: seg.translatedText,
        targetLang: seg.targetLang,
        sourceLang: seg.sourceLang,
        isFullAudit: true
      });

      const flaggedErrors = evaluation.errors || [];
      const expectedErrors = seg.expectedErrors || [];

      console.log(`Expected errors count: ${expectedErrors.length}`);
      console.log(`Flagged errors count: ${flaggedErrors.length}`);

      // Match errors by span substring match (case-insensitive)
      const matchedExpected = new Set();
      const matchedFlagged = new Set();

      for (let fIdx = 0; fIdx < flaggedErrors.length; fIdx++) {
        const fErr = flaggedErrors[fIdx];
        let foundMatch = false;

        for (let eIdx = 0; eIdx < expectedErrors.length; eIdx++) {
          const eErr = expectedErrors[eIdx];
          if (matchedExpected.has(eIdx)) continue;

          const fSpan = String(fErr.snippet || "").toLowerCase();
          const eSpan = String(eErr.span || "").toLowerCase();

          if (fSpan.includes(eSpan) || eSpan.includes(fSpan)) {
            // Check category match if categories align
            foundMatch = true;
            matchedExpected.add(eIdx);
            matchedFlagged.add(fIdx);
            tp++;
            console.log(`  [Match] True Positive: span "${fErr.snippet}" (Expected category: ${eErr.category}, Flagged category: ${fErr.category})`);
            break;
          }
        }

        if (!foundMatch) {
          fp++;
          console.log(`  [Excess] False Positive: span "${fErr.snippet}" flagged but not expected.`);
        }
      }

      // Check for missed expected errors
      for (let eIdx = 0; eIdx < expectedErrors.length; eIdx++) {
        if (!matchedExpected.has(eIdx)) {
          fn++;
          const eErr = expectedErrors[eIdx];
          console.log(`  [Miss] False Negative: span "${eErr.span}" expected but not flagged.`);
        }
      }

      results.push({
        id: seg.id,
        sourceText: seg.sourceText,
        translatedText: seg.translatedText,
        expectedErrors,
        flaggedErrors,
        evaluationScore: evaluation.accuracyScore
      });

    } catch (err) {
      console.error(`Error auditing segment #${seg.id}:`, err.message);
      results.push({
        id: seg.id,
        error: err.message
      });
    }
  }

  // Calculate precision / recall
  const precision = tp + fp > 0 ? (tp / (tp + fp)) * 100 : 100;
  const recall = tp + fn > 0 ? (tp / (tp + fn)) * 100 : 100;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 100;

  console.log("\n=========================================");
  console.log("Validation Run Summary Results");
  console.log("=========================================");
  console.log(`True Positives (TP):  ${tp}`);
  console.log(`False Positives (FP): ${fp}`);
  console.log(`False Negatives (FN): ${fn}`);
  console.log(`Precision:            ${precision.toFixed(2)}%`);
  console.log(`Recall:               ${recall.toFixed(2)}%`);
  console.log(`F1-Score:             ${f1Score.toFixed(2)}%`);
  console.log("=========================================");

  // Save report to disk
  const reportDir = path.join(__dirname, "reports");
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `golden_report_${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    metrics: { tp, fp, fn, precision, recall, f1Score },
    results
  }, null, 2));

  console.log(`Saved detailed validation report to: ${reportPath}`);
}

runGoldenSet();
