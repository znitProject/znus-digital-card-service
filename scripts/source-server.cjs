const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const adminRoot = path.join(root, 'apps-script', 'admin-bound');
const gsFiles = ['Schema.gs', 'Config.gs', 'Validation.gs', 'Repository.gs', 'MediaProcessing.gs', 'FormAutomation.gs', 'Connection.gs', 'PreviewData.gs', 'Dashboard.gs', 'Code.gs'];

function read(file) { return fs.readFileSync(path.join(adminRoot, file), 'utf8'); }
const bundle = gsFiles.map(read).join('\n\n');
const pages = {
  '/bundle.gs': bundle,
  '/AdminGallery.html': read('AdminGallery.html'),
  '/QrLibrary.html': read('QrLibrary.html')
};

http.createServer((req, res) => {
  const body = pages[new URL(req.url, 'http://127.0.0.1:4174').pathname];
  if (body == null) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(body);
}).listen(4174, '127.0.0.1', () => console.log('Local source server: http://127.0.0.1:4174/bundle.gs'));
