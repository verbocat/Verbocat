const fs = require('fs');
const JSZip = require('jszip');

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

// Helper to strip any raw tag markers or placeholders if present in text
const stripTagMarkers = (text) => {
  if (!text) return "";
  return String(text)
    .replace(/<\/?\d+>/g, "")
    .replace(/__TAG_\d+__/gi, "")
    .replace(/__SEG_\d+__/gi, "")
    .trim();
};

// Normalize rPr XML string into a comparable key for formatting equality
const normalizeRPr = (rPrXml) => {
  if (!rPrXml) return "";
  const cleaned = rPrXml.replace(/<\/?w:rPr[^>]*>/gi, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const tags = cleaned.match(/<[^>]+>/g) || [];
  return tags.sort().join("");
};

// Check if a field instruction is a dynamic system field (like PAGE, NUMPAGES, DATE, etc.)
const isDynamicSystemField = (instrText) => {
  if (!instrText) return false;
  const upper = instrText.trim().toUpperCase();
  return /^(PAGE|NUMPAGES|SECTION|SECTIONPAGES|DATE|TIME|FILENAME|FILESIZE|AUTHOR|TITLE|SUBJECT|KEYWORDS|DOCPROPERTY|TOC)\b/.test(upper);
};

const parseFile = async (filePath) => {
  console.log(`\n========================================`);
  console.log(`[DOCX_PARSER_START] Parsing file: ${filePath}`);
  const fileData = fs.readFileSync(filePath);
  let zip;
  try {
    zip = await JSZip.loadAsync(fileData);
  } catch (err) {
    console.error(`[DOCX_PARSER_ERROR] Invalid DOCX zip archive:`, err.message);
    throw new Error('Invalid DOCX file or legacy .doc format. Please save/convert your file as .docx (Word Document) before uploading.');
  }

  const docXmlFiles = Object.keys(zip.files).filter(name => 
    name === 'word/document.xml' || 
    name.match(/^word\/(header|footer)\d+\.xml$/)
  ).sort((a, b) => {
    if (a === 'word/document.xml') return -1;
    if (b === 'word/document.xml') return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });

  console.log(`[DOCX_PARSER_FILES_FOUND] Found ${docXmlFiles.length} XML file(s): ${docXmlFiles.join(', ')}`);

  if (docXmlFiles.length === 0) {
    throw new Error('Invalid DOCX file: missing word/document.xml');
  }

  const segments = [];
  const paraMetaMap = {};
  let segmentId = 1;

  for (const xmlFile of docXmlFiles) {
    let xmlContent = await zip.file(xmlFile).async('string');

    xmlContent = xmlContent.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi, (pBlock) => {
      // 1. Extract paragraph properties <w:pPr>...</w:pPr> if present
      let pPrXml = "";
      const pPrMatch = pBlock.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/i);
      if (pPrMatch) {
        pPrXml = pPrMatch[0];
      }

      // Extract inner XML of <w:p> after <w:pPr>
      const pInnerXml = pBlock.replace(/^<w:p\b[^>]*>/i, "").replace(/<\/w:p>$/i, "");

      // 2. Tokenize paragraph body into runs (<w:r>), simple fields (<w:fldSimple>), and other elements
      const childNodeRegex = /<w:fldSimple\b[^>]*>[\s\S]*?<\/w:fldSimple>|<w:fldSimple\b[^>]*\/>|<w:r\b[^>]*>[\s\S]*?<\/w:r>|<[^>]+>/gi;

      let inFieldSequence = false;
      let fieldInstrIsDynamic = false;
      
      const spans = [];
      let currentSpan = [];

      let match;
      while ((match = childNodeRegex.exec(pInnerXml)) !== null) {
        const nodeXml = match[0];
        const index = match.index;

        if (/^<w:pPr\b/i.test(nodeXml)) continue;

        // Check for simple fields <w:fldSimple>
        if (/^<w:fldSimple\b/i.test(nodeXml)) {
          const instrAttr = (nodeXml.match(/w:instr="([^"]*)"/i) || [])[1] || "";
          if (isDynamicSystemField(instrAttr)) {
            if (currentSpan.length > 0) {
              spans.push(currentSpan);
              currentSpan = [];
            }
            continue;
          }
        }

        // Check for run <w:r>
        if (/^<w:r\b/i.test(nodeXml)) {
          if (/w:fldCharType="begin"/i.test(nodeXml)) {
            inFieldSequence = true;
            fieldInstrIsDynamic = false;
            if (currentSpan.length > 0) {
              spans.push(currentSpan);
              currentSpan = [];
            }
            continue;
          }

          const instrMatch = nodeXml.match(/<w:instrText\b[^>]*>([\s\S]*?)<\/w:instrText>/i);
          if (instrMatch && isDynamicSystemField(instrMatch[1])) {
            fieldInstrIsDynamic = true;
          }

          if (/w:fldCharType="separate"/i.test(nodeXml) || /w:fldCharType="end"/i.test(nodeXml)) {
            if (/w:fldCharType="end"/i.test(nodeXml)) {
              inFieldSequence = false;
              fieldInstrIsDynamic = false;
            }
            continue;
          }

          if (inFieldSequence && fieldInstrIsDynamic) {
            continue;
          }

          // Extract rPrXml
          let rPrXml = "";
          const rPrMatch = nodeXml.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/i);
          if (rPrMatch) {
            rPrXml = rPrMatch[0];
          }

          const hasBr = /<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>/i.test(nodeXml) && !/type="page"/i.test(nodeXml);
          const hasPageBreak = /<w:br\b[^>]*type="page"[^>]*\/>/i.test(nodeXml);

          const textTagRegex = /<w:t\b([^>]*)>([\s\S]*?)<\/w:t>|<w:t\b([^>]*)\/>/gi;
          let runText = "";
          let tMatch;
          while ((tMatch = textTagRegex.exec(nodeXml)) !== null) {
            const rawText = tMatch[2] !== undefined ? tMatch[2] : "";
            runText += unescapeXml(rawText);
          }

          if (runText || hasBr || hasPageBreak) {
            currentSpan.push({
              xml: nodeXml,
              startIndex: index,
              endIndex: index + nodeXml.length,
              text: runText,
              hasBr,
              hasPageBreak,
              rPrXml,
              rPrKey: normalizeRPr(rPrXml)
            });
          }
        }
      }

      if (currentSpan.length > 0) {
        spans.push(currentSpan);
      }

      // Filter spans to only those containing actual translatable text
      const validSpans = spans.filter(span => span.map(e => e.text).join("").trim().length > 0);

      if (validSpans.length === 0) {
        return pBlock;
      }

      // Process each valid span as an independent segment placeholder
      let modifiedInnerXml = pInnerXml;

      // Replace spans from right to left (descending order of startIndex) to keep string indices stable
      for (let i = validSpans.length - 1; i >= 0; i--) {
        const span = validSpans[i];
        const spanText = span.map(e => e.text).join("");
        if (!spanText.trim()) continue;

        const distinctKeys = new Set(span.filter(e => e.text).map(e => e.rPrKey));
        const needsRunTagging = distinctKeys.size > 1;

        let segmentSource = "";
        const tagRPrMap = {};
        let defaultRPr = "";
        let currentTagId = 1;
        let hasBrInSource = false;

        if (!needsRunTagging) {
          // Uniform formatting across span
          const firstWithRPr = span.find(e => e.rPrXml);
          if (firstWithRPr) defaultRPr = firstWithRPr.rPrXml;

          for (const el of span) {
            if (el.hasBr) {
              segmentSource += "<br/>";
              hasBrInSource = true;
            }
            if (el.hasPageBreak) segmentSource += "<pagebreak/>";
            if (el.text) segmentSource += el.text;
          }
        } else {
          // Mixed formatting across runs -> defaultRPr MUST remain empty string "" to prevent bold leakage onto normal text!
          defaultRPr = "";
          let activeTagId = null;
          let activeKey = null;
          let lastTagText = "";

          for (const el of span) {
            if (el.hasBr) {
              if (activeTagId !== null) {
                segmentSource += `</${activeTagId}>`;
                activeTagId = null;
                activeKey = null;
              }
              segmentSource += "<br/>";
              hasBrInSource = true;
            }
            if (el.hasPageBreak) {
              if (activeTagId !== null) {
                segmentSource += `</${activeTagId}>`;
                activeTagId = null;
                activeKey = null;
              }
              segmentSource += "<pagebreak/>";
            }

            if (el.text) {
              if (el.rPrKey !== activeKey) {
                if (activeTagId !== null) {
                  segmentSource += `</${activeTagId}>`;
                  // Preserve essential space between adjacent formatted runs (e.g. "WORD FORMATTING" and "TEST DOCUMENT" or "elements." and "Use")
                  if (lastTagText && !/\s$/.test(lastTagText) && !/^\s/.test(el.text)) {
                    segmentSource += " ";
                  }
                }
                activeTagId = currentTagId++;
                activeKey = el.rPrKey;
                tagRPrMap[activeTagId] = el.rPrXml;
                segmentSource += `<${activeTagId}>`;
              }
              segmentSource += el.text;
              lastTagText = el.text;
            }
          }
          if (activeTagId !== null) {
            segmentSource += `</${activeTagId}>`;
          }
        }

        const currentSegId = segmentId++;
        segments.push({
          id: currentSegId,
          source: segmentSource.trim(),
          target: "",
          leading: "",
          trailing: ""
        });

        paraMetaMap[currentSegId] = {
          id: currentSegId,
          pPrXml,
          defaultRPr,
          tagRPrMap,
          needsRunTagging,
          hasBrInSource
        };

        const spanStart = span[0].startIndex;
        const spanEnd = span[span.length - 1].endIndex;

        const beforeSpan = modifiedInnerXml.substring(0, spanStart);
        const afterSpan = modifiedInnerXml.substring(spanEnd);
        const placeholderXml = `<w:r><w:t xml:space="preserve">__PARA_SEG_${currentSegId}__</w:t></w:r>`;

        modifiedInnerXml = beforeSpan + placeholderXml + afterSpan;
      }

      const pAttrsMatch = pBlock.match(/^<w:p\b([^>]*)>/i);
      const pAttrs = pAttrsMatch ? pAttrsMatch[1] : "";

      return `<w:p ${pAttrs}>${modifiedInnerXml}</w:p>`;
    });

    zip.file(xmlFile, xmlContent);
  }

  const modifiedZipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  
  const packageZip = new JSZip();
  packageZip.file('template.zip', modifiedZipBuffer);
  
  const meta = {
    segmentCount: segments.length,
    hasParaMeta: true
  };
  packageZip.file('meta.json', JSON.stringify(meta));
  packageZip.file('paraMeta.json', JSON.stringify(paraMetaMap));
  
  const packageBuffer = await packageZip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  const template = packageBuffer.toString('base64');
  
  console.log(`[DOCX_PARSER_COMPLETE] Extracted ${segments.length} segments | Template Size: ${packageBuffer.length} bytes`);
  console.log(`========================================\n`);

  return { segments, template };
};

const isRtlLang = (lang) => {
  if (!lang) return false;
  const clean = String(lang).toLowerCase().split("-")[0];
  return ["ar", "ur", "he", "fa", "ps", "sd", "ug", "yi"].includes(clean);
};

const exportFile = async (templateBase64, segments, targetLang = "") => {
  let zipBase64 = "";
  let paraMetaMap = {};
  const isRtl = isRtlLang(targetLang);

  try {
    const rawBuffer = Buffer.from(templateBase64, 'base64');
    
    if (rawBuffer.length >= 2 && rawBuffer[0] === 0x50 && rawBuffer[1] === 0x4b) {
      const packageZip = await JSZip.loadAsync(rawBuffer);
      const modifiedZipBuffer = await packageZip.file('template.zip').async('nodebuffer');
      zipBase64 = modifiedZipBuffer.toString('base64');

      const paraMetaFile = packageZip.file('paraMeta.json');
      if (paraMetaFile) {
        const paraMetaStr = await paraMetaFile.async('string');
        paraMetaMap = JSON.parse(paraMetaStr);
      }
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
  ).sort((a, b) => {
    if (a === 'word/document.xml') return -1;
    if (b === 'word/document.xml') return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });

  const segmentMap = new Map();
  segments.forEach((seg, arrayIdx) => {
    const rawText = (seg.target !== undefined && seg.target !== null && seg.target !== "") 
      ? seg.target 
      : (seg.source || "");
    const key = seg.id !== undefined && seg.id !== null ? seg.id : (arrayIdx + 1);
    segmentMap.set(Number(key), rawText);
  });

  for (const xmlFile of docXmlFiles) {
    let xmlContent = await zip.file(xmlFile).async('string');
    
    // Replace paragraph markers __PARA_SEG_N__ with reconstructed Word OpenXML runs
    xmlContent = xmlContent.replace(/<w:r\b[^>]*>\s*<w:t\b[^>]*>__PARA_SEG_(\d+)__<\/w:t>\s*<\/w:r>/gi, (match, idStr) => {
      const id = parseInt(idStr, 10);
      const targetText = segmentMap.get(id) || "";
      const paraMeta = paraMetaMap[id];

      if (!paraMeta) {
        // Fallback for missing meta: plain text run
        const clean = stripTagMarkers(targetText);
        const rtlPr = isRtl ? "<w:rPr><w:rtl/></w:rPr>" : "";
        return `<w:r>${rtlPr}<w:t xml:space="preserve">${escapeXml(clean)}</w:t></w:r>`;
      }

      const { tagRPrMap = {}, defaultRPr = "", hasBrInSource = false } = paraMeta;

      // Tokenize targetText into tags (<1>, </1>, <br/>, <pagebreak/>), and text
      const tokenRegex = /(<\/?\d+>|<br\s*\/?>|<pagebreak\s*\/?>|\n)/gi;
      const parts = targetText.split(tokenRegex).filter(Boolean);

      let generatedRunsXml = "";
      let activeTagId = null;
      let hasBrInTarget = false;

      for (const part of parts) {
        const openMatch = part.match(/^<(\d+)>$/);
        const closeMatch = part.match(/^<\/(\d+)>$/);
        const brMatch = part.match(/^<br\s*\/?>$/i) || part === "\n";
        const pageBreakMatch = part.match(/^<pagebreak\s*\/?>$/i);

        if (openMatch) {
          activeTagId = openMatch[1];
        } else if (closeMatch) {
          activeTagId = null;
        } else if (brMatch) {
          generatedRunsXml += `<w:r><w:br/></w:r>`;
          hasBrInTarget = true;
        } else if (pageBreakMatch) {
          generatedRunsXml += `<w:r><w:br w:type="page"/></w:r>`;
        } else {
          // Plain text token
          const unescapedPart = unescapeXml(part);
          const escapedPart = escapeXml(unescapedPart);

          let rPrXml = defaultRPr;
          if (activeTagId && tagRPrMap[activeTagId] !== undefined) {
            rPrXml = tagRPrMap[activeTagId];
          }

          if (isRtl) {
            if (!rPrXml) {
              rPrXml = `<w:rPr><w:rtl/></w:rPr>`;
            } else if (!rPrXml.includes("<w:rtl")) {
              rPrXml = rPrXml.replace("</w:rPr>", "<w:rtl/></w:rPr>");
            }
          }

          generatedRunsXml += `<w:r>${rPrXml}<w:t xml:space="preserve">${escapedPart}</w:t></w:r>`;
        }
      }

      // Line Break Recovery: If source segment contained <br/> and target translation dropped <br/> between tags, inject <w:br/>
      if (hasBrInSource && !hasBrInTarget && generatedRunsXml.includes("</w:r><w:r>")) {
        generatedRunsXml = generatedRunsXml.replace("</w:r><w:r>", "</w:r><w:r><w:br/></w:r><w:r>");
      }

      if (!generatedRunsXml) {
        const baseRPr = isRtl ? (defaultRPr ? defaultRPr.replace("</w:rPr>", "<w:rtl/></w:rPr>") : "<w:rPr><w:rtl/></w:rPr>") : defaultRPr;
        generatedRunsXml = `<w:r>${baseRPr}<w:t xml:space="preserve"></w:t></w:r>`;
      }

      return generatedRunsXml;
    });

    // Fallback for legacy __SEG_N__ template markers
    xmlContent = xmlContent.replace(/__SEG_(\d+)__/g, (match, idStr) => {
      const id = parseInt(idStr, 10);
      if (segmentMap.has(id)) {
        return escapeXml(stripTagMarkers(segmentMap.get(id)));
      }
      return "";
    });

    if (isRtl) {
      // Add <w:bidi/> to paragraphs with RTL runs
      xmlContent = xmlContent.replace(/<w:p\b([^>]*)>([\s\S]*?)<\/w:p>/gi, (pMatch, pAttrs, pBody) => {
        if (pBody.includes("<w:rtl")) {
          if (pBody.includes("<w:pPr>")) {
            if (!pBody.includes("<w:bidi")) {
              return `<w:p${pAttrs}>${pBody.replace("<w:pPr>", "<w:pPr><w:bidi/><w:jc w:val=\"right\"/>")}</w:p>`;
            }
          } else {
            return `<w:p${pAttrs}><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr>${pBody}</w:p>`;
          }
        }
        return pMatch;
      });
    }

    zip.file(xmlFile, xmlContent);
  }

  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};

module.exports = {
  parseFile,
  exportFile
};
