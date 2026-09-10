const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const write = (name, content) => fs.writeFileSync(path.join(root, name), content.replace(/[\t ]+$/gm, ''));
let html = read('cardDesign/명함_디자인/index.html');
// Generated copies preserve the supplied CSS, DOM and animation implementation.
html = html.replace(/<script src="qrcode.min.js"><\/script>/, () => '<script>' + read('node_modules/qrcode-generator/dist/qrcode.js') + '\n' +
  'function QRCode(el, options) { const qr=qrcode(0,"M"); qr.addData(options.text); qr.make(); el.innerHTML=qr.createSvgTag({cellSize:4,margin:2,scalable:true}); } QRCode.CorrectLevel={H:2};</script>');
html = html.replace(/(src|poster|href)="assets\/([^"/]+)"/g, (_, attr, file) => `data-asset="${file}" data-asset-attribute="${attr}"`);
html = html.replace(/url\(["']?assets\/[^)]+\)/g, 'none');
html = html.replace(/window\.location\.href/g, 'ZNUS.url()');
html = html.replace(/"DOMContentLoaded",\s*init/, '"DOMContentLoaded",\n  () => ZNUS.start(init, CONFIG)');
html = html.replace('<body>', '<body style="visibility:hidden">\n<script>window.ZNUS_TOKEN="<?= slug ?>";window.ZNUS_PREVIEW=false;</script>');
html = html.replace('<script>\n(() => {', () => '<script>\n' + read('web/card-service.js') + '\n</script>\n<script>\n(() => {');
html = html.replace('</head>', () => '<style>' + read('cardDesign/명함_디자인/font.css') + '\n.qr-code svg{width:100%;height:100%}.card-media img{display:block}</style></head>');
write('apps-script/public-web/Card.html', html);
write('apps-script/admin-bound/Preview.html', html.replace('window.ZNUS_PREVIEW=false', 'window.ZNUS_PREVIEW=true'));
let data = read('apps-script/public-web/Code.gs');
data = data.slice(data.indexOf('function getPublicCard('));
data = data.replaceAll('getPublicCard', 'getAdminPreviewCard').replaceAll('getPublicMedia', 'getAdminPreviewMedia');
data = data.replaceAll('if (!card || !publicTrue_(card.published) || !publicTrue_(card.isActive))', 'if (!card)');
write('apps-script/admin-bound/PreviewData.gs', '/** Generated read adapter. Sheet-bound editor preview only. */\n' + data);
console.log('Built public Card.html and editor Preview.html / PreviewData.gs');
