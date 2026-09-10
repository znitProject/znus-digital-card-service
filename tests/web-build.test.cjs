const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('generated browser scripts compile, including embedded QR library',()=>{
  for(const name of ['public-web/Card.html','admin-bound/Preview.html','admin-bound/Dashboard.html']){
    const html=fs.readFileSync(path.join(root,'apps-script',name),'utf8');
    for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1],{filename:name});
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
});
test('anonymous project contains no admin mutation endpoints and has readonly scopes',()=>{
  const code=fs.readFileSync(path.join(root,'apps-script/public-web/Code.gs'),'utf8');
  assert.ok(!/setValues|deleteRow|setTrashed|saveAdmin|setAdmin/.test(code));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'apps-script/public-web/appsscript.json'),'utf8'));
  assert.ok(manifest.oauthScopes.every(scope=>scope.endsWith('.readonly')));
});
