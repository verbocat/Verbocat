const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pdf = require('pdf-parse');

async function run() {
  const localPath = path.join(__dirname, 'sample.pdf');
  try {
    console.log('1. Downloading sample PDF...');
    const response = await axios.get('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', {
      responseType: 'arraybuffer',
      timeout: 10000
    });
    fs.writeFileSync(localPath, Buffer.from(response.data));
    console.log('Download complete.');

    console.log('2. Parsing downloaded PDF...');
    const parsed = await pdf(Buffer.from(response.data));
    console.log('Parsed text successfully!');
    console.log('Number of pages:', parsed.numpages);
    console.log('Extracted text:', JSON.stringify(parsed.text));

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
  }
}

run();
