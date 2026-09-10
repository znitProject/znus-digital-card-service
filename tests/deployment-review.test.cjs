const {test}=require('node:test');
const assert=require('node:assert/strict');
const {reviewHandler}=require('../scripts/deployment-review.cjs');
function responseFor(url){
  const result={};
  reviewHandler({url},{writeHead:(status,headers)=>Object.assign(result,{status,headers}),end:body=>{result.body=body;}});
  return result;
}
test('deployment source page exposes only separated public files as inert text',()=>{
  const code=responseFor('/code');
  assert.equal(code.status,200);
  assert.ok(code.body.includes("HtmlService.createTemplateFromFile('Card')"));
  assert.ok(!code.body.includes('ZNUS_CARD_HTML_'));
  const card=responseFor('/card');
  assert.equal(card.status,200);
  assert.ok(card.body.includes('&lt;script&gt;'));
  assert.ok(!card.body.includes('<script>'));
  assert.equal(card.headers['Content-Security-Policy'],"default-src 'none'");
  assert.equal(responseFor('/manifest').status,200);
  for(const url of ['/../.env','/admin','/code?file=secret','/secrets'])assert.equal(responseFor(url).status,404);
});
