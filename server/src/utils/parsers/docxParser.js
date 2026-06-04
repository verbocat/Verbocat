const fs = require('fs');
const JSZip = require('jszip');
const cheerio = require('cheerio');

const normalizeSegmentText = (text) =>
  (text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .trim();

const escapeXml = (text) =>
  String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const parseFile = async (filePath) => {
  const fileData = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(fileData);
  
  if (!zip.file('word/document.xml')) {
    throw new Error('Invalid DOCX file: missing word/document.xml');
  }

  const xmlContent = await zip.file('word/document.xml').async('string');
  const $ = cheerio.load(xmlContent, { xmlMode: true });
  const segments = [];
  let segmentIndex = 0;

  $('w\\:t').each((_, element) => {
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

  zip.file('word/document.xml', $.xml());
  const modifiedZipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const template = modifiedZipBuffer.toString('base64');

  return { segments, template };
};

const exportFile = async (templateBase64, segments) => {
  const zipBuffer = Buffer.from(templateBase64, 'base64');
  const zip = await JSZip.loadAsync(zipBuffer);
  let xmlContent = await zip.file('word/document.xml').async('string');

  const segmentMap = new Map();
  segments.forEach((segment) => {
    const replacement = escapeXml(segment.leading || "") + escapeXml(segment.target) + escapeXml(segment.trailing || "");
    segmentMap.set(segment.id, replacement);
  });

  xmlContent = xmlContent.replace(/__SEG_(\d+)__/g, (match, idStr) => {
    const id = parseInt(idStr, 10);
    if (segmentMap.has(id)) return segmentMap.get(id);
    return match;
  });

  zip.file('word/document.xml', xmlContent);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};

module.exports = { parseFile, exportFile };
