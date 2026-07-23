const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
console.log('ENV KEYS:', Object.keys(process.env).filter(k => !k.startsWith('npm_') && !k.startsWith('VSCODE_')));
