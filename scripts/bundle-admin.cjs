const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = [
  'Schema.gs', 'Validation.gs', 'Repository.gs', 'Config.gs', 'Connection.gs',
  'MediaProcessing.gs', 'FormAutomation.gs', 'PreviewData.gs', 'Dashboard.gs', 'Code.gs'
];
const source = files.map(name => fs.readFileSync(path.join(root, 'apps-script/admin-bound', name), 'utf8').replace(/\r\n/g, '\n')).join('\n\n');
fs.writeFileSync(path.join(root, '.codex-admin-bundle.gs'), source);
console.log('Built .codex-admin-bundle.gs');
