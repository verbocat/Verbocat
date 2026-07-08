const fs = require('fs');
const JSZip = require('jszip');
const cheerio = require('cheerio');

const normalizeSegmentText = (text) => 
  (text || "").replace(/\u00a0/g, " ").replace(/[ \t\r\f\v]+/g, " ").replace(/\n\s*/g, "\n").trim();

const escapeXml = (text) => 
  String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const parseFile = async (filePath) => {
  const fileData = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(fileData);
  const segments = [];
  let segmentIndex = 0;

  if (zip.file('xl/sharedStrings.xml')) {
    const xmlContent = await zip.file('xl/sharedStrings.xml').async('string');
    const $ = cheerio.load(xmlContent, { xmlMode: true });
    
    $('t').each((_, element) => {
      const rawText = $(element).text();
      const source = normalizeSegmentText(rawText);
      if (!source) return;

      const leading = rawText.match(/^\s*/)?.[0] || "";
      const trailing = rawText.match(/\s*$/)?.[0] || "";
      const segmentId = segmentIndex++;
      
      $(element).text(`__SEG_${segmentId}__`);
      $(element).attr('xml:space', 'preserve');
      segments.push({ id: segmentId, source, target: "", leading, trailing });
    });

    zip.file('xl/sharedStrings.xml', $.xml());
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
    // Fallback for old templates
    zipBase64 = templateBase64;
  }

  const zipBuffer = Buffer.from(zipBase64, 'base64');
  const zip = await JSZip.loadAsync(zipBuffer);

  if (zip.file('xl/sharedStrings.xml')) {
    const segmentMap = new Map();
    segments.forEach((segment) => {
      const savedTags = segmentTagsMap.get(segment.id) || {};
      const leading = savedTags.leading || segment.leading || "";
      const trailing = savedTags.trailing || segment.trailing || "";
      const replacement = escapeXml(leading) + escapeXml(segment.target) + escapeXml(trailing);
      segmentMap.set(segment.id, replacement);
    });

    let xmlContent = await zip.file('xl/sharedStrings.xml').async('string');
    xmlContent = xmlContent.replace(/__SEG_(\d+)__/g, (match, idStr) => {
      const id = parseInt(idStr, 10);
      if (segmentMap.has(id)) return segmentMap.get(id);
      return match;
    });
    zip.file('xl/sharedStrings.xml', xmlContent);
  }

  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};

module.exports = { parseFile, exportFile };
