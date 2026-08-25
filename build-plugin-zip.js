const fs = require('fs');
const path = require('path');
const JSZip = require('./server/node_modules/jszip');

async function createPluginZip() {
  const zip = new JSZip();
  const baseDir = path.resolve(__dirname, 'verbocat-connector');
  const rootFolderName = 'verbocat-connector';

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
        // Force Unix forward slashes and standard 0644 permissions
        zipFolder.file(file, fileData, {
          date: new Date(),
          unixPermissions: '644'
        });
      }
    }
  }

  const rootZipFolder = zip.folder(rootFolderName);
  addFolderToZip(baseDir, rootZipFolder);

  console.log('Generating production-compliant WordPress ZIP package...');
  const content = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX'
  });

  const outputPath = path.resolve(__dirname, 'verbocat-connector.zip');
  fs.writeFileSync(outputPath, content);
  console.log(`✓ Successfully generated ${outputPath} (${content.length} bytes)`);
}

createPluginZip().catch(err => {
  console.error('Build zip failed:', err);
  process.exit(1);
});
