const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const admin = path.join(root, 'apps-script', 'admin-bound');
const files = ['Schema.gs', 'Config.gs', 'Validation.gs', 'Repository.gs', 'MediaProcessing.gs', 'FormAutomation.gs', 'Connection.gs', 'PreviewData.gs', 'Dashboard.gs', 'Code.gs'];
fs.writeFileSync(path.join(root, '.codex-admin-bundle.gs'), files.map(file => fs.readFileSync(path.join(admin, file), 'utf8')).join('\n\n'));
fs.copyFileSync(path.join(admin, 'AdminGallery.html'), path.join(root, '.codex-admin-gallery.html'));
