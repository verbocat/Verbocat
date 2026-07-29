const { balanceSegmentTags } = require('../src/utils/parsers/segmentationUtils');

const splitByPunctuation = (str, tagMap) => {
  if (!str || !str.trim()) return [];

  const regex = /(?<=[.!?।॥\r\n])(?=\s+|<\/?\d+>|$)/g;
  const rawPieces = str.split(regex);

  const sentences = [];
  let currentAcc = "";

  for (let i = 0; i < rawPieces.length; i++) {
    const piece = rawPieces[i];
    if (!piece) continue;

    if (currentAcc) {
      currentAcc += piece;
    } else {
      currentAcc = piece;
    }

    const trimmed = currentAcc.trim();
    const isDecimalOrVersion = /(?:^|\s|\/|\()([A-Za-z0-9]|\d+|v)\.$/i.test(trimmed) && i < rawPieces.length - 1 && /^[a-zA-Z0-9]/.test(rawPieces[i + 1].trim());
    const isShortAbbr = /(?:\b(?:sr|no|nos|v|vol|sec|art|cin|inc|ltd|pvt|corp|co|st|dr|mr|mrs|ms|prof|vs|e\.?\s*g|i\.?\s*e|etc|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|approx|max|min|fig|paras?|dept|assn|bldg|rs|re|inr|opp|ref|par|cl|ch|ver|sub|cl|para)\.|\b[a-z]\.)$/i.test(trimmed);

    if (!isDecimalOrVersion && !isShortAbbr) {
      const balanced = balanceSegmentTags(currentAcc);
      if (balanced && balanced.replace(/<\/?\d+>/g, "").trim().length > 0) {
        sentences.push(balanced);
        currentAcc = "";
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
};

const testCases = [
  'PFL/Loan Agreement - UBL/ Jan_26/v.2',
  'LOAN AGREEMENT',
  'This Loan Agreement including the Schedules, Annexures attached hereto (the "Agreement") is executed at the place and on the date as mentioned in Serial No. 2 and Serial No 3 of the Schedule hereto respectively:',
  'a. "Application Form" means the loan application form submitted by the Borrower to the Lender for applying for and/ or availing the Loan.',
  'b. "Broken Period Interest" means interest at the rate indicated in the Sanction Letter on the Loan from the date / dates of disbursement of the Loan to the date immediately prior to the date of commencement of Instalment.'
];

testCases.forEach((t, i) => {
  const result = splitByPunctuation(t);
  console.log(`\nCase #${i+1}:`);
  console.log('Original:', JSON.stringify(t));
  console.log('Split:   ', result);
  console.log('Zero loss check:', result.join('').trim() === t.trim() ? 'PASSED' : 'FAILED');
});
