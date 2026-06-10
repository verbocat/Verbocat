const fs = require('fs');
const JSZip = require('jszip');
const cheerio = require('cheerio');
const {
  extractPlaceholders,
  splitByPunctuation,
  restorePlaceholders,
} = require('./segmentationUtils');

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

  const tagMapGlobal = new Map();
  const tagCounter = { value: 1 };

  $('w\\:p').each((_, element) => {
    const rawText = $(element).text().trim();
    if (!rawText) return;

    const placeholderStr = extractPlaceholders(element, $, tagMapGlobal, tagCounter);
    const subSegments = splitByPunctuation(placeholderStr);

    $(element).empty();

    subSegments.forEach((subSeg) => {
      const segmentId = segmentIndex++;
      
      // In DOCX, raw text shouldn't just be dumped into <w:p>. 
      // But we are replacing __SEG_X__ later. 
      // We wrap it in a minimal run and text tag to ensure XML stays valid if needed, 
      // or we can just append it because Cheerio allows raw text.
      // Since later we replace __SEG_X__ with valid XML (which includes the restored <w:r> tags), 
      // just appending __SEG_X__ is fine, as long as Cheerio serializes it correctly.
      
      $(element).append(`__SEG_${segmentId}__`);
      
      segments.push({
        id: segmentId,
        source: subSeg,
        target: "",
        leading: "",
        trailing: "",
      });
    });
  });

  zip.file('word/document.xml', $.xml());
  const modifiedZipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  
  const templateData = {
    zipBase64: modifiedZipBuffer.toString('base64'),
    tagMap: Array.from(tagMapGlobal.entries()),
  };
  
  // We stringify and encode to base64, but no gzip needed since zip is already compressed, 
  // but let's just base64 encode the JSON to maintain string format for the template variable
  const template = Buffer.from(JSON.stringify(templateData)).toString('base64');

  return { segments, template };
};

const exportFile = async (templateBase64, segments) => {
  let zipBase64 = "";
  let tagMapGlobal = new Map();

  try {
    const templateData = JSON.parse(Buffer.from(templateBase64, 'base64').toString('utf-8'));
    zipBase64 = templateData.zipBase64;
    tagMapGlobal = new Map(templateData.tagMap || []);
  } catch (e) {
    // Fallback for old templates
    zipBase64 = templateBase64;
  }

  const zipBuffer = Buffer.from(zipBase64, 'base64');
  const zip = await JSZip.loadAsync(zipBuffer);
  let xmlContent = await zip.file('word/document.xml').async('string');

  const segmentMap = new Map();
  segments.forEach((segment) => {
    const targetText = segment.target || segment.source;
    const restoredText = restorePlaceholders(targetText, tagMapGlobal);
    segmentMap.set(segment.id, restoredText);
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
