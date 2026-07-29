const fs = require('fs');
const cheerio = require('cheerio');
const zlib = require('zlib');
const { extractPlaceholders, restorePlaceholders, extractSegmentTags, balanceSegmentTags } = require('../src/utils/parsers/segmentationUtils');

// 1. Smart & Lossless Sentence Splitting Function
function splitByPunctuationSmart(str) {
  if (!str || !str.trim()) return [];

  // Split string at sentence boundaries (. ! ? । ॥ \n)
  // A dot is ONLY a sentence end if:
  // 1) It is followed by whitespace, tag, or end-of-string
  // 2) AND it is NOT preceded by a short abbreviation or single letter (like v. or Mr.)
  // 3) AND it is NOT part of a decimal/version pattern (like 3.1 or v.2)
  const regex = /(?<=[.!?।॥\r\n])(?=\s+|<\/?\d+>|$)/g;
  const rawPieces = str.split(regex);
  
  const sentences = [];
  let currentAcc = '';
  
  for (let i = 0; i < rawPieces.length; i++) {
    const piece = rawPieces[i];
    if (!piece) continue;
    
    if (currentAcc) {
      currentAcc += piece;
    } else {
      currentAcc = piece;
    }
    
    const trimmed = currentAcc.trim();
    const isDecimalOrVersion = /(?:^|\s|\()([A-Za-z0-9]|\d+|v)\.$/i.test(trimmed) && i < rawPieces.length - 1 && /^[a-zA-Z0-9]/.test(rawPieces[i+1].trim());
    const isShortAbbr = /(?:\b(?:sr|no|nos|v|vol|sec|art|cin|inc|ltd|pvt|corp|co|st|dr|mr|mrs|ms|prof|vs|e\.?\s*g|i\.?\s*e|etc|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|approx|max|min|fig|paras?|dept|assn|bldg|rs|re|inr|opp|ref|par|cl|ch|ver|sub|cl|para)\.|\b[a-z]\.)$/i.test(trimmed);
    
    if (!isDecimalOrVersion && !isShortAbbr) {
      const balanced = balanceSegmentTags(currentAcc);
      if (balanced && balanced.replace(/<\/?\d+>/g, "").trim().length > 0) {
        sentences.push(balanced);
        currentAcc = '';
      }
    }
  }
  
  if (currentAcc) {
    const balanced = balanceSegmentTags(currentAcc);
    if (balanced && balanced.replace(/<\/?\d+>/g, "").trim().length > 0) {
      sentences.push(balanced);
    }
  }
  
  return sentences.length ? sentences : [balanceSegmentTags(str)];
}

// Test on SCUBL_LOAN_AGREEMENT_PROD.html
const srcPath = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing\\SCUBL_LOAN_AGREEMENT_PROD.html';
const origHtml = fs.readFileSync(srcPath, 'utf-8');

console.log('Testing PFL/Loan Agreement extraction with smart splitter:');
const sampleStr = 'PFL/Loan Agreement - UBL/ Jan_26/v.2';
console.log('Result:', splitByPunctuationSmart(sampleStr));
