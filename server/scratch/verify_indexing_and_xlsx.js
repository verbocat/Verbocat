const xlsxParser = require('../src/utils/parsers/xlsxParser');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

async function testXlsx() {
  console.log("=========================================");
  console.log("TESTING XLSX PARSER & EXPORTER (1-BASED INDEXING & CELL MAPPING)");
  console.log("=========================================\n");

  const zip = new JSZip();
  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">
  <si><t>Header Cell 1</t></si>
  <si><r><rPr><b/></rPr><t>Rich Text </t></r><r><t>Run 2</t></r></si>
  <si><t>Row Data 3</t></si>
</sst>`;

  zip.file('xl/sharedStrings.xml', sharedStringsXml);
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const sampleXlsxPath = path.join(__dirname, 'test_sample.xlsx');
  fs.writeFileSync(sampleXlsxPath, zipBuffer);

  // 1. Parse File
  const parseResult = await xlsxParser.parseFile(sampleXlsxPath);
  console.log("Parsed Segments Count:", parseResult.segments.length);
  console.log("Segment IDs:", parseResult.segments.map(s => s.id));
  console.log("Segment Sources:", parseResult.segments.map(s => s.source));

  const hasSeg0 = parseResult.segments.some(s => s.id === 0);
  console.log("Contains Segment ID 0?", hasSeg0, "(Must be false)");
  console.log("First Segment ID:", parseResult.segments[0]?.id, "(Must be 1)");

  // 2. Export File
  const translatedSegments = parseResult.segments.map(s => ({
    ...s,
    target: `[HI] ${s.source}`
  }));

  const exportedBuffer = await xlsxParser.exportFile(parseResult.template, translatedSegments);
  const exportedZip = await JSZip.loadAsync(exportedBuffer);
  const exportedXml = await exportedZip.file('xl/sharedStrings.xml').async('string');

  console.log("\nExported XML:\n", exportedXml);
  console.log("Has __SEG_0__?", exportedXml.includes('__SEG_0__'));
  console.log("Has Any Unreplaced __SEG_N__?", /__SEG_\d+__/.test(exportedXml));

  fs.unlinkSync(sampleXlsxPath);

  if (!hasSeg0 && parseResult.segments[0]?.id === 1 && !/__SEG_\d+__/.test(exportedXml)) {
    console.log("\n✅ XLSX PARSER & EXPORTER VERIFIED 100% SUCCESSFUL!");
  } else {
    console.error("\n❌ XLSX VERIFICATION FAILED!");
  }
}

testXlsx().catch(console.error);
