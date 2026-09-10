// Local source review page for copying the reviewed public bundle into Apps Script.
// Serves only the public project, never credentials or arbitrary workspace files.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'apps-script/public-web', file), 'utf8');
// Keep Apps Script and HTML in separate editor files. A single long JSON string
// makes browser editor syntax highlighting unnecessarily expensive.
const pages = {'/code': read('Code.gs'), '/card': read('Card.html'), '/manifest': read('appsscript.json')};
function reviewHandler(req, res) {
  if (!Object.hasOwn(pages, req.url)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Content-Security-Policy':"default-src 'none'"});
  res.end('<!doctype html><meta charset="utf-8"><title>Public deployment source</title><pre>' + pages[req.url].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</pre>');
}
if (require.main === module) http.createServer(reviewHandler).listen(4174, '127.0.0.1', () => console.log('Public source review: http://127.0.0.1:4174/code · /card · /manifest'));
module.exports = {reviewHandler};
