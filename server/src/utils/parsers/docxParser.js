const fs = require('fs');
const JSZip = require('jszip');
const cheerio = require('cheerio');
const { splitTextIntoSentences } = require('../sentenceSplitter');

// Helper to escape XML special characters
const escapeXml = (text) => {
  if (!text) return "";
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

// Helper to strip any raw tag markers or placeholders if present in text
const stripTagMarkers = (text) => {
  if (!text) return "";
  return String(text)
    .replace(/<\/?\d+>/g, "") // Strip <1>, </1>, <2>
    .replace(/__TAG_\d+__/gi, "") // Strip __TAG_0__
    .replace(/__SEG_\d+__/gi, "") // Strip __SEG_0__
    .trim();
};

// Helper to unescape XML special characters
const unescapeXml = (text) => {
  if (!text) return "";
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
};

const parseFile = async (filePath) => {
  const fileData = fs.readFileSync(filePath);
  let zip;
  try {
    zip = await JSZip.loadAsync(fileData);
  } catch (err) {
    throw new Error('Invalid DOCX file or legacy .doc format. Please save/convert your file as .docx (Word Document) before uploading.');
  }

  const docXmlFiles = Object.keys(zip.files).filter(name => 
    name === 'word/document.xml' || 
    name.match(/^word\/(header|footer)\d+\.xml$/)
  );

  if (docXmlFiles.length === 0) {
    throw new Error('Invalid DOCX file: missing word/document.xml');
  }

  const segments = [];
  let segmentId = 0;

  for (const xmlFile of docXmlFiles) {
    let xmlContent = await zip.file(xmlFile).async('string');

    xmlContent = xmlContent.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi, (pBlock) => {
      const textTagRegex = /<w:t\b([^>]*)>([\s\S]*?)<\/w:t>|<w:t\b([^>]*)\/>/gi;
      let fullText = "";
      let hasTextTag = false;
      let match;

      while ((match = textTagRegex.exec(pBlock)) !== null) {
        hasTextTag = true;
        const rawText = match[2] !== undefined ? match[2] : "";
        fullText += unescapeXml(rawText);
      }

      const cleanText = fullText.trim();
      if (!cleanText || !hasTextTag) {
        return pBlock;
      }

      const sentencesToUse = splitTextIntoSentences(cleanText, 35);
      const paragraphSegIds = [];

      sentencesToUse.forEach(sentenceText => {
        const currentSegId = segmentId++;
        paragraphSegIds.push(currentSegId);
        segments.push({
          id: currentSegId,
          source: sentenceText,
          target: "",
          leading: "",
          trailing: ""
        });
      });

      const segPlaceholders = paragraphSegIds.map(id => `__SEG_${id}__`).join(" ");

      let matchIdx = 0;
      return pBlock.replace(/<w:t\b[^>]*>[\s\S]*?<\/w:t>|<w:t\b[^>]*\/>/gi, () => {
        if (matchIdx === 0) {
          matchIdx++;
          return `<w:t xml:space="preserve">${segPlaceholders}</w:t>`;
        }
        matchIdx++;
        return `<w:t></w:t>`;
      });
    });

    zip.file(xmlFile, xmlContent);
  }

  const modifiedZipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  
  // Package template inside JSZip without redundant outer DEFLATE compression
  const packageZip = new JSZip();
  packageZip.file('template.zip', modifiedZipBuffer);
  
  const meta = {
    segmentCount: segments.length
  };
  packageZip.file('meta.json', JSON.stringify(meta));
  
  const packageBuffer = await packageZip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  const template = packageBuffer.toString('base64');
  
  return { segments, template };
};

const exportFile = async (templateBase64, segments) => {
  let zipBase64 = "";

  try {
    const rawBuffer = Buffer.from(templateBase64, 'base64');
    
    // Check for binary template package ZIP (starts with PK 0x50 0x4b)
    if (rawBuffer.length >= 2 && rawBuffer[0] === 0x50 && rawBuffer[1] === 0x4b) {
      const packageZip = await JSZip.loadAsync(rawBuffer);
      const modifiedZipBuffer = await packageZip.file('template.zip').async('nodebuffer');
      zipBase64 = modifiedZipBuffer.toString('base64');
    } else {
      const templateData = JSON.parse(rawBuffer.toString('utf-8'));
      zipBase64 = templateData.zipBase64 || templateBase64;
    }
  } catch (e) {
    zipBase64 = templateBase64;
  }

  const zipBuffer = Buffer.from(zipBase64, 'base64');
  const zip = await JSZip.loadAsync(zipBuffer);
  
  const docXmlFiles = Object.keys(zip.files).filter(name => 
    name === 'word/document.xml' || 
    name.match(/^word\/(header|footer)\d+\.xml$/)
  );

  const segmentMap = new Map();
  segments.forEach((seg) => {
    const rawText = seg.target || seg.source;
    // Strip any residual tag markers from text and XML-escape for valid Word XML
    const cleanText = stripTagMarkers(rawText);
    segmentMap.set(seg.id, escapeXml(cleanText));
  });

  for (const xmlFile of docXmlFiles) {
    let xmlContent = await zip.file(xmlFile).async('string');
    
    xmlContent = xmlContent.replace(/__SEG_(\d+)__/g, (match, idStr) => {
      const id = parseInt(idStr, 10);
      if (segmentMap.has(id)) {
        return segmentMap.get(id);
      }
      return match;
    });

    zip.file(xmlFile, xmlContent);
  }

  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};

module.exports = {
  parseFile,
  exportFile
};
