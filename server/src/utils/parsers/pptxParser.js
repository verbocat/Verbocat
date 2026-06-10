const fs = require('fs');
const JSZip = require('jszip');
const cheerio = require('cheerio');
const {
  extractPlaceholders,
  splitByPunctuation,
  restorePlaceholders,
  extractSegmentTags,
} = require('./segmentationUtils');

const parseFile = async (filePath) => {
  const fileData = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(fileData);
  const segments = [];
  let segmentIndex = 0;

  const tagMapGlobal = new Map();
  const tagCounter = { value: 1 };

  for (const relativePath in zip.files) {
    if (relativePath.startsWith('ppt/slides/slide') && relativePath.endsWith('.xml')) {
      const xmlContent = await zip.file(relativePath).async('string');
      const $ = cheerio.load(xmlContent, { xmlMode: true });
      let modified = false;

      $('a\\:p').each((_, element) => {
        const rawText = $(element).text().trim();
        if (!rawText) return;

        const placeholderStr = extractPlaceholders(element, $, tagMapGlobal, tagCounter);
        const subSegments = splitByPunctuation(placeholderStr);

        $(element).empty();

        subSegments.forEach((subSeg) => {
          const segmentId = segmentIndex++;
          $(element).append(`__SEG_${segmentId}__`);
          const { leading, body, trailing } = extractSegmentTags(subSeg);
          segments.push({
            id: segmentId,
            source: body,
            target: "",
            leading,
            trailing,
          });
        });
        modified = true;
      });

      if (modified) {
        zip.file(relativePath, $.xml());
      }
    }
  }

  const modifiedZipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  
  const templateData = {
    zipBase64: modifiedZipBuffer.toString('base64'),
    tagMap: Array.from(tagMapGlobal.entries()),
  };
  
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

  const segmentMap = new Map();
  segments.forEach((segment) => {
    const targetText = (segment.leading || "") + (segment.target || segment.source) + (segment.trailing || "");
    const restoredText = restorePlaceholders(targetText, tagMapGlobal);
    segmentMap.set(segment.id, restoredText);
  });

  for (const relativePath in zip.files) {
    if (relativePath.startsWith('ppt/slides/slide') && relativePath.endsWith('.xml')) {
      let xmlContent = await zip.file(relativePath).async('string');
      xmlContent = xmlContent.replace(/__SEG_(\d+)__/g, (match, idStr) => {
        const id = parseInt(idStr, 10);
        if (segmentMap.has(id)) return segmentMap.get(id);
        return match;
      });
      zip.file(relativePath, xmlContent);
    }
  }

  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};

module.exports = { parseFile, exportFile };
