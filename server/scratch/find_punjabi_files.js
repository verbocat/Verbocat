const fs = require('fs');
const path = require('path');

function searchFiles(dir) {
  const gurmukhiRegex = /[\u0A00-\u0A7F]/;
  const files = fs.readdirSync(dir);

  files.forEach(f => {
    const fullPath = path.join(dir, f);
    if (f === 'node_modules' || f === '.git' || f === '.next') return;

    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        searchFiles(fullPath);
      } else if (stat.isFile() && (f.endsWith('.html') || f.endsWith('.json') || f.endsWith('.txt') || f.endsWith('.js'))) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (gurmukhiRegex.test(content)) {
          console.log(`Found Punjabi text in file: ${fullPath} (size: ${stat.size} bytes)`);
        }
      }
    } catch (e) {}
  });
}

console.log('Searching for files containing Punjabi text in matecat directory...');
searchFiles('C:\\Users\\divya\\Desktop\\matecat');
