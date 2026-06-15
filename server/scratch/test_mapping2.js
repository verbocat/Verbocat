const fs = require("fs");
const path = require("path");
const { parseXliff } = require("../src/utils/exporters");

const xlfPath = "C:\\Users\\divya\\Downloads\\ML_SANCTION_LETTER.html_en-US_pa-IN.sdlxliff";

const xml = fs.readFileSync(xlfPath, "utf-8");
const xlfSegmentsRaw = parseXliff(xml);

const targets = xlfSegmentsRaw.map(s => s.target).filter(t => t && (t.includes("<") || t.includes("&lt;")));
console.log("Sample XLF Targets:");
targets.slice(0, 10).forEach(t => console.log(t));
