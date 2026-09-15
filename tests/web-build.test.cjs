const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('profile design has one media slot and all five Form upload slots match design cards',()=>{
  const design=fs.readFileSync(path.join(root,'cardDesign/명함_디자인/index.html'),'utf8');
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root,'apps-script/admin-bound/FormAutomation.gs'),'utf8'),context);
  const uploads=vm.runInContext('FORM_UPLOAD_KEYS',context);
  const cards=[...design.matchAll(/class="(profile|role|contact|company|links)-card screen-card"/g)].map(m=>m[1]);
  assert.deepEqual(cards,['profile','role','contact','company','links']);
  assert.equal(uploads.length,cards.length);
  assert.equal(design.split('data-content-key="profileImageFileId"').length-1,1);
  assert.ok(!uploads.includes('profileBackgroundFileId'));
  const adapter=fs.readFileSync(path.join(root,'web/card-service.js'),'utf8');
  assert.ok(!adapter.includes("image(document.querySelector('.profile-card"));
});
test('generated browser scripts compile, including embedded QR library',()=>{
  for(const name of ['public-web/Card.html','admin-bound/Preview.html','admin-bound/AdminGallery.html','admin-bound/QrLibrary.html']){
    const html=fs.readFileSync(path.join(root,'apps-script',name),'utf8');
    for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1],{filename:name});
  }
});
test('card media is warmed in order while inactive cards stay paused',()=>{
  const design=fs.readFileSync(path.join(root,'cardDesign/명함_디자인/index.html'),'utf8');
  const adapter=fs.readFileSync(path.join(root,'web/card-service.js'),'utf8');
  assert.ok((design.match(/preload="metadata"/g)||[]).length >= 5);
  assert.ok(design.includes('function syncCardVideos(activeIndex)'));
  assert.ok(design.includes('video.pause();'));
  assert.ok(design.includes('window.ZNUS?.preloadCardMedia?.(target)'));
  assert.ok(adapter.includes('const mediaLoaders = new Map()'));
  assert.ok(adapter.includes('for (const section of card.sections.slice(1))'));
});
test('card viewport keeps its top inset and horizontal centering while navigating',()=>{
  const files=[
    'cardDesign/명함_디자인/index.html',
    'apps-script/public-web/Card.html',
    'apps-script/admin-bound/Preview.html'
  ];
  for(const name of files){
    const html=fs.readFileSync(path.join(root,name),'utf8');
    assert.ok(html.includes('scroll-padding-block: var(--page-margin)'));
    assert.ok(html.includes('margin: 0 auto var(--page-margin)'));
    assert.ok(html.includes('scroll-margin-block-start: var(--page-margin)'));
    assert.ok(!html.includes('.scrollIntoView('));
  }
});
test('preview and public use the same design with distinct RPC access',()=>{
  const publicHtml=fs.readFileSync(path.join(root,'apps-script/public-web/Card.html'),'utf8');
  const preview=fs.readFileSync(path.join(root,'apps-script/admin-bound/Preview.html'),'utf8');
  assert.equal(preview,publicHtml.replace('window.ZNUS_PREVIEW=false','window.ZNUS_PREVIEW=true'));
  assert.ok(publicHtml.includes('() => ZNUS.start(init, CONFIG)'));
  assert.ok(!publicHtml.includes('window.location.href'));
  assert.ok(!publicHtml.includes('src="assets/'));
  assert.ok(publicHtml.includes('canvas.width = 626; canvas.height = 1110'));
  const publicData=fs.readFileSync(path.join(root,'apps-script/public-web/Code.gs'),'utf8');
  const previewData=fs.readFileSync(path.join(root,'apps-script/admin-bound/PreviewData.gs'),'utf8');
  for(const data of [publicData,previewData]) {
    assert.ok(data.includes("'image/svg+xml'"));
    assert.ok(data.includes("section === 'logo' ? 2 : 30"));
  }
});
test('anonymous project contains no admin mutation endpoints and has readonly scopes',()=>{
  const code=fs.readFileSync(path.join(root,'apps-script/public-web/Code.gs'),'utf8');
  assert.ok(!/setValues|deleteRow|setTrashed|saveAdmin|setAdmin/.test(code));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'apps-script/public-web/appsscript.json'),'utf8'));
  assert.ok(manifest.oauthScopes.every(scope=>scope.endsWith('.readonly')));
});
