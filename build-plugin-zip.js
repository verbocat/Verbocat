const fs = require('fs');
const path = require('path');
const JSZip = require('./server/node_modules/jszip');

async function createPluginZips() {
  const baseDir = path.resolve(__dirname, 'verbocat-connector');

  function addFolderToZip(currentDir, zipFolder) {
    const files = fs.readdirSync(currentDir);

    for (const file of files) {
      const fullPath = path.join(currentDir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        const subFolder = zipFolder.folder(file);
        addFolderToZip(fullPath, subFolder);
      } else {
        const fileData = fs.readFileSync(fullPath);
        zipFolder.file(file, fileData, {
          date: new Date(),
          unixPermissions: '644'
        });
      }
    }
  }

  // 1. Standard package: verbocat-connector.zip
  const zip1 = new JSZip();
  const root1 = zip1.folder('verbocat-connector');
  addFolderToZip(baseDir, root1);
  const buf1 = await zip1.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX'
  });
  fs.writeFileSync(path.resolve(__dirname, 'verbocat-connector.zip'), buf1);
  console.log(`✓ Generated verbocat-connector.zip (${buf1.length} bytes)`);

  // 2. Fresh slug package: verbocat-ai-connector.zip (Bypasses any stuck/leftover folders!)
  const zip2 = new JSZip();
  const root2 = zip2.folder('verbocat-ai-connector');
  addFolderToZip(baseDir, root2);
  const buf2 = await zip2.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX'
  });
  fs.writeFileSync(path.resolve(__dirname, 'verbocat-ai-connector.zip'), buf2);
  console.log(`✓ Generated verbocat-ai-connector.zip (${buf2.length} bytes)`);
}

createPluginZips().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
