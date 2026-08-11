const fs = require('fs');
const JSZip = require('jszip');
const cheerio = require('cheerio');

const normalizeSegmentText = (text) => 
  (text || "").replace(/\u00a0/g, " ").replace(/[ \t\r\f\v]+/g, " ").replace(/\n\s*/g, "\n").trim();

const escapeXml = (text) => 
  String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/**
 * Robust XLSX Parser & Exporter (Strict 1-Based Indexing & Cell Block Preservation)
 *
 * 1. Shared Strings (xl/sharedStrings.xml):
 *    - Iterates over each <si> (String Item) block.
 *    - Extracts intact inner text (combining rich text runs <r> cleanly).
 *    - Replaces <si> content with `<t xml:space="preserve">__SEG_${segmentId}__</t>`.
 *    - Indexing starts strictly at 1 (`__SEG_1__`).
 *
 * 2. Inline String Cells in Worksheets (xl/worksheets/sheet*.xml):
 *    - Scans all worksheet XMLs for inline strings (<c t="inlineStr"><is><t>Text</t></is></c>).
 *    - Replaces inline text with `__SEG_${segmentId}__`.
 *
 * 3. Export:
 *    - Maps target translations back to __SEG_N__ placeholders in all XML files.
 *    - Ensures exact 1-based indexing alignment with DB segment_index.
 */

const parseFile = async (filePath) => {
  const fileData = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(fileData);
  const segments = [];
  let segmentIndex = 1; // STRICT 1-BASED INDEXING (__SEG_1__, __SEG_2__, ...)

  // 1. Process Shared Strings (xl/sharedStrings.xml)
  if (zip.file('xl/sharedStrings.xml')) {
    const xmlContent = await zip.file('xl/sharedStrings.xml').async('string');
    const $ = cheerio.load(xmlContent, { xmlMode: true });

    $('si').each((_, siElem) => {
      // Extract combined text from all <t> tags inside this <si> item
      const tElements = $(siElem).find('t');
      let combinedRawText = "";
      if (tElements.length > 0) {
        tElements.each((_, t) => {
          combinedRawText += $(t).text();
        });
      } else {
        combinedRawText = $(siElem).text();
      }

      const source = normalizeSegmentText(combinedRawText);
      if (!source) return;

      const leading = combinedRawText.match(/^\s*/)?.[0] || "";
      const trailing = combinedRawText.match(/\s*$/)?.[0] || "";
      const segmentId = segmentIndex++;

      // Replace <si> contents with single preserved <t> tag containing placeholder __SEG_N__
      $(siElem).empty();
      $(siElem).append(`<t xml:space="preserve">__SEG_${segmentId}__</t>`);

      segments.push({ id: segmentId, source, target: "", leading, trailing });
    });

    zip.file('xl/sharedStrings.xml', $.xml());
  }

  // 2. Process Inline Strings in Worksheet XMLs (sheet1.xml, sheet2.xml, etc.)
  const sheetFiles = Object.keys(zip.files).filter(name => 
    name.startsWith('xl/worksheets/sheet') && name.endsWith('.xml')
  );

  for (const sheetFile of sheetFiles) {
    const xmlContent = await zip.file(sheetFile).async('string');
    const $ = cheerio.load(xmlContent, { xmlMode: true });
    let modified = false;

    $('c[t="inlineStr"] is t, c[t="str"] v').each((_, elem) => {
      const rawText = $(elem).text();
      const source = normalizeSegmentText(rawText);
      if (!source) return;

      const leading = rawText.match(/^\s*/)?.[0] || "";
      const trailing = rawText.match(/\s*$/)?.[0] || "";
      const segmentId = segmentIndex++;

      $(elem).text(`__SEG_${segmentId}__`);
      $(elem).attr('xml:space', 'preserve');

      segments.push({ id: segmentId, source, target: "", leading, trailing });
      modified = true;
    });

    if (modified) {
      zip.file(sheetFile, $.xml());
    }
  }

  const modifiedZipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const templateData = {
    zipBase64: modifiedZipBuffer.toString('base64'),
    segmentTags: segments.map(seg => ({ id: seg.id, leading: seg.leading, trailing: seg.trailing }))
  };
  const template = Buffer.from(JSON.stringify(templateData)).toString('base64');
  return { segments, template };
};

const exportFile = async (templateBase64, segments) => {
  let zipBase64 = "";
  let segmentTagsMap = new Map();

  try {
    const templateData = JSON.parse(Buffer.from(templateBase64, 'base64').toString('utf-8'));
    zipBase64 = templateData.zipBase64;
    segmentTagsMap = new Map((templateData.segmentTags || []).map(t => [t.id, t]));
  } catch (e) {
    zipBase64 = templateBase64;
  }

  const zipBuffer = Buffer.from(zipBase64, 'base64');
  const zip = await JSZip.loadAsync(zipBuffer);

  const segmentMap = new Map();
  segments.forEach((segment, arrayIdx) => {
    const savedTags = segmentTagsMap.get(segment.id) || {};
    const leading = savedTags.leading || segment.leading || "";
    const trailing = savedTags.trailing || segment.trailing || "";
    const targetText = (segment.target !== undefined && segment.target !== null && segment.target !== "")
      ? segment.target
      : (segment.source || "");
    const replacement = escapeXml(leading) + escapeXml(targetText) + escapeXml(trailing);
    
    // Support matching by segment.id OR 1-based array index (arrayIdx + 1)
    const key = segment.id !== undefined && segment.id !== null ? Number(segment.id) : (arrayIdx + 1);
    segmentMap.set(key, replacement);
    if (segment.id) segmentMap.set(Number(segment.id), replacement);
  });

  const xmlFiles = Object.keys(zip.files).filter(name => 
    name === 'xl/sharedStrings.xml' || (name.startsWith('xl/worksheets/sheet') && name.endsWith('.xml'))
  );

  for (const xmlFile of xmlFiles) {
    let xmlContent = await zip.file(xmlFile).async('string');
    xmlContent = xmlContent.replace(/__SEG_(\d+)__/g, (match, idStr) => {
      const id = parseInt(idStr, 10);
      if (segmentMap.has(id)) return segmentMap.get(id);
      return match;
    });
    zip.file(xmlFile, xmlContent);
  }

  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};

module.exports = { parseFile, exportFile };
