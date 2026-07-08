const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function run() {
  const localPath = path.join(__dirname, 'sample_w3c.pdf');
  try {
    console.log('1. Downloading W3C PDF...');
    const response = await axios.get('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', {
      responseType: 'arraybuffer',
      timeout: 10000
    });
    const buf = Buffer.from(response.data);
    const fileStr = buf.toString('binary');
    
    // Find last startxref
    const startxrefIndex = fileStr.lastIndexOf('startxref');
    console.log('W3C startxref index:', startxrefIndex);
    
    // Find listed offset
    const afterStartxref = fileStr.substring(startxrefIndex + 9).trim();
    const listedOffset = parseInt(afterStartxref.split(/\s+/)[0], 10);
    console.log('W3C listed offset:', listedOffset);
    
    // Print around offset
    console.log('W3C XRef table around offset:');
    console.log(JSON.stringify(fileStr.substring(listedOffset, listedOffset + 300)));

    // Print end of file
    console.log('W3C EOF section:');
    console.log(JSON.stringify(fileStr.substring(fileStr.length - 100)));

  } catch (err) {
    console.error('Error:', err);
  }
}

run();
