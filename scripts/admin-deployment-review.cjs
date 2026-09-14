// Local-only, fixed allowlist of reviewed admin sources. No account data is served.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '../apps-script/admin-bound');
const codeFiles = ['Schema.gs','Config.gs','Validation.gs','Repository.gs','MediaProcessing.gs','FormAutomation.gs','Connection.gs','PreviewData.gs','Dashboard.gs','Code.gs'];
const files = {'/code': () => codeFiles.map(name => fs.readFileSync(path.join(root,name),'utf8')).join('\n'),
  '/qr': () => fs.readFileSync(path.join(root,'QrLibrary.html'),'utf8'),
  '/dashboard': () => fs.readFileSync(path.join(root,'Dashboard.html'),'utf8'),
  '/gallery': () => fs.readFileSync(path.join(root,'AdminGallery.html'),'utf8'),
  '/preview': () => fs.readFileSync(path.join(root,'Preview.html'),'utf8'),
  '/sidebar': () => fs.readFileSync(path.join(root,'Sidebar.html'),'utf8'),
  '/manifest': () => fs.readFileSync(path.join(root,'appsscript.json'),'utf8')};
const port = Number(process.env.ADMIN_REVIEW_PORT || 4175);
http.createServer((req,res) => {
  if (req.url === '/dashboard.raw') {
    res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
    return res.end(files['/dashboard']());
  }
  if (req.url === '/gallery.raw') {
    res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
    return res.end(files['/gallery']());
  }
  if (req.url === '/code.raw') {
    res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
    return res.end(files['/code']());
  }
  if (req.url === '/preview.raw') {
    res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
    return res.end(files['/preview']());
  }
  if (!Object.hasOwn(files,req.url)) {res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'"});
  res.end('<!doctype html><meta charset="utf-8"><title>Admin deployment source</title><pre>'+files[req.url]().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</pre>');
}).listen(port,'127.0.0.1',()=>console.log('Admin source review: http://127.0.0.1:' + port + '/code'));
