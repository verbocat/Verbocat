const fs = require('fs');
const path = require('path');

const testDir = 'C:\\Users\\divya\\Desktop\\matecat\\client\\src\\testing';
console.log(`Listing files in ${testDir}:`);
const files = fs.readdirSync(testDir);
files.forEach(f => {
  const stat = fs.statSync(path.join(testDir, f));
  console.log(` - ${f} (${stat.size} bytes)`);
});
