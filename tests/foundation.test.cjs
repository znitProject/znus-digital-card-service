const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

class Sheet {
  constructor(name, data = []) { this.name=name; this.data=data; this.columns=26; this.rows=1000; this.writes=[]; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return Math.max(0,...this.data.map(r=>r.length)); }
  getMaxColumns() { return this.columns; }
  getMaxRows() { return this.rows; }
  insertColumnsAfter(_,n) { this.columns+=n; }
  insertRowsAfter(_,n) { this.rows+=n; }
  setFrozenRows() {}
  getRange(r,c,n,m) {
    assert.ok(r>0&&c>0&&n>0&&m>0);
    assert.ok(c+m-1<=this.columns,'range exceeds column grid');
    const sheet=this;
    return {
      getValues() { return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sheet.data[r+i-1]?.[c+j-1]??'')); },
      setValues(values) {
        assert.equal(values.length,n);
        sheet.writes.push(structuredClone(values));
        values.forEach((values,i)=>{
          assert.equal(values.length,m);
          if (!sheet.data[r+i-1]) sheet.data[r+i-1]=[];
          values.forEach((v,j)=>{sheet.data[r+i-1][c+j-1]=typeof v==='string'&&/^'[=+\-@]/.test(v)?v.slice(1):v;});
        });
        return this;
      },
      setNumberFormat(){return this;},setFontWeight(){return this;},
      setBackground(){return this;},setFontColor(){return this;}
    };
  }
}
function fixture(project='admin-bound') {
  const sheets=new Map(),folders=new Map(),properties={};
  let seq=0,held=false,acquired=0,released=0;
  const iter=items=>({hasNext:()=>items.length>0,next:()=>items.shift()});
  class Folder {
    constructor(name,parent=null) {this.id='folder-'+seq++;this.name=name;this.parent=parent;this.access='PRIVATE';this.trashed=false;folders.set(this.id,this);}
    getId(){return this.id;} isTrashed(){return this.trashed;} getSharingAccess(){return this.access;}
    getParents(){return iter(this.parent?[this.parent]:[]);}
    getFoldersByName(name){return iter([...folders.values()].filter(f=>f.parent===this&&f.name===name&&!f.trashed));}
    createFolder(name){return new Folder(name,this);}
  }
  const root=new Folder('My Drive');
  const ss={getId:()=> 'sheet-id',getUrl:()=> 'https://docs.google.com/spreadsheets/d/sheet-id',
    getSheetByName:name=>sheets.get(name)||null,insertSheet:name=>{const s=new Sheet(name);sheets.set(name,s);return s;}};
  const context=vm.createContext({
    console,Utilities:{getUuid:()=>crypto.randomUUID()},
    PropertiesService:{getScriptProperties:()=>({
      getProperty:k=>properties[k]??null,
      setProperty:(k,v)=>{properties[k]=v;},
      setProperties:values=>Object.assign(properties,values)
    })},
    SpreadsheetApp:{getActive:()=>ss,openById:id=>{assert.equal(id,'sheet-id');return ss;},flush:()=>{}},
    LockService:{getScriptLock:()=>({
      waitLock:()=>{if(held)throw Error('lock busy');held=true;acquired++;},
      releaseLock:()=>{assert.equal(held,true);held=false;released++;}
    })},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},getRootFolder:()=>root,getFolderById:id=>{
      if(!folders.has(id))throw Error('folder inaccessible');return folders.get(id);
    }},
    HtmlService:{createTemplateFromFile:()=>({evaluate(){return{setTitle:()=>({slug:this.slug})};}})}
  });
  const directory=path.join(__dirname,'../apps-script',project);
  for (const file of fs.readdirSync(directory).filter(f=>f.endsWith('.gs'))) {
    vm.runInContext(fs.readFileSync(path.join(directory,file),'utf8'),context,{filename:file});
  }
  return {context,sheets,folders,properties,root,ss,
    run:code=>vm.runInContext(code,context),
    locks:()=>({held,acquired,released})};
}
function validInput() {
  const input={googleAccountEmail:'Person@Example.org',nameKo:'김직원',nameEn:'Employee',
    department:'개발',jobTitleKo:'책임',jobTitleEn:'Engineer',mobilePhone:'010-1234-5678',
    publicEmail:'public@example.org',profileImageFileId:'profile-file'};
  for(const language of ['Ko','En'])for(let i=1;i<=5;i++)input['roleItem'+i+language]='업무 '+i;
  return input;
}
function ready() {
  const f=fixture();f.context.setupWorkspace();
  f.context.configurePublicBaseUrl_('https://script.google.com/macros/s/deployment/exec');
  return f;
}
test('initial setup is repeatable and preserves records, columns, folder IDs and settings',()=>{
  const f=ready();
  const card=f.context.createCardRecord_(validInput());
  const before=JSON.stringify([...f.sheets.values()].map(s=>s.data)),ids=JSON.stringify(f.properties);
  f.context.setupWorkspace();
  assert.equal(JSON.stringify([...f.sheets.values()].map(s=>s.data)),before);
  assert.equal(JSON.stringify(f.properties),ids);
  assert.equal(f.folders.size,7);
  assert.equal(f.context.getWorkspaceInfo().cardCount,1);
  assert.equal(card.processingStatus,'PROCESSING');assert.equal(card.published,false);
  assert.match(card.cardId,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.match(card.publicToken,/^[a-z0-9]{12}$/);
  assert.ok(card.publicUrl.endsWith('?card='+card.publicToken));
  assert.equal(f.locks().held,false);assert.equal(f.locks().acquired,f.locks().released);
});
test('legacy schema is rejected without changing any sheet or creating folders',()=>{
  const f=fixture();f.sheets.set('Cards',new Sheet('Cards',[['cardId','slug'],['legacy-id','legacy-url']]));
  const before=JSON.stringify(f.sheets.get('Cards').data);
  assert.throws(()=>f.context.setupWorkspace(),/기존 Cards/);
  assert.equal(JSON.stringify(f.sheets.get('Cards').data),before);
  assert.equal(f.sheets.size,1);assert.equal(f.folders.size,1);assert.equal(f.locks().held,false);
});
test('all schemas are preflighted before mutation',()=>{
  const f=fixture();
  f.sheets.set('CompanySettings',new Sheet('CompanySettings',[['companyName','companyName']]));
  assert.throws(()=>f.context.setupWorkspace(),/중복/);
  assert.equal(f.sheets.size,1);assert.equal(f.folders.size,1);
});
test('populated incomplete Cards requires explicit migration',()=>{
  const f=fixture();f.sheets.set('Cards',new Sheet('Cards',[['cardId','publicToken'],['old','abcdefghijkl']]));
  assert.throws(()=>f.context.setupWorkspace(),/필수 열/);
  assert.equal(f.sheets.get('Cards').data.length,2);
});
test('column order and extra data survive setup; reads use header names',()=>{
  const f=ready(),card=f.context.createCardRecord_(validInput()),sheet=f.sheets.get('Cards');
  sheet.data=sheet.data.map(row=>row.slice().reverse());
  sheet.data[0].push('operatorNote');sheet.data[1].push('keep me');sheet.columns++;
  const before=JSON.stringify(sheet.data);
  f.context.setupWorkspace();
  assert.equal(JSON.stringify(sheet.data),before);
  const records=f.context.readRecords_(sheet,'Cards');
  assert.equal(records[0].value.cardId,card.cardId);
  assert.equal(records[0].value.operatorNote,'keep me');
});
test('configured inaccessible, trashed or public folders are not silently replaced',()=>{
  for(const mode of ['missing','trashed','public']) {
    const f=ready(),id=f.properties.ZNUS_FOLDER_ASSETS,count=f.folders.size;
    if(mode==='missing')f.folders.delete(id);
    else if(mode==='trashed')f.folders.get(id).trashed=true;
    else f.folders.get(id).access='ANYONE_WITH_LINK';
    assert.throws(()=>f.context.setupWorkspace());
    assert.equal(f.properties.ZNUS_FOLDER_ASSETS,id);
    assert.equal(f.folders.size,count-(mode==='missing'?1:0));
  }
});
test('duplicate folder names require explicit selection',()=>{
  const f=fixture();f.root.createFolder('ZNUS Digital Card');f.root.createFolder('ZNUS Digital Card');
  assert.throws(()=>f.context.setupWorkspace(),/여러 개/);
  assert.equal(f.folders.size,3);
});
test('same account cannot create second card, even when inactive or differently cased',()=>{
  const f=ready();f.context.createCardRecord_(validInput());
  const sheet=f.sheets.get('Cards'),active=sheet.data[0].indexOf('isActive');
  sheet.data[1][active]=false;
  assert.throws(()=>f.context.createCardRecord_({...validInput(),googleAccountEmail:'person@example.org'}),/이미 등록/);
  assert.equal(sheet.data.length,2);
});
test('token generation rejects current and deleted collisions',()=>{
  const f=fixture();const queue=['aaaaaaaaaaaa','bbbbbbbbbbbb','cccccccccccc'];
  f.context.randomToken_=()=>queue.shift();
  assert.equal(f.context.uniqueToken_([{value:{publicToken:'aaaaaaaaaaaa'}}],[{value:{publicToken:'bbbbbbbbbbbb'}}]),'cccccccccccc');
});
test('collision exhaustion fails safely and releases lock without row creation',()=>{
  const f=ready();f.context.reserveDeletedToken_('aaaaaaaaaaaa');
  f.context.randomToken_=()=> 'aaaaaaaaaaaa';
  assert.throws(()=>f.context.createCardRecord_(validInput()),/고유 공개 토큰/);
  assert.equal(f.sheets.get('Cards').data.length,1);assert.equal(f.locks().held,false);
});
test('deleted token registration is idempotent and stores no personal data',()=>{
  const f=ready();
  f.context.reserveDeletedToken_('abcdefghijkl');f.context.reserveDeletedToken_('abcdefghijkl');
  assert.deepEqual(f.sheets.get('DeletedTokens').data,[['publicToken'],['abcdefghijkl']]);
  assert.throws(()=>f.context.reserveDeletedToken_('bad'));
});
test('random generator skips fixed bytes and rejects 252..255 without modulo bias',()=>{
  const f=fixture();let n=0;
  f.context.Utilities.getUuid=()=>n++===0?'fcfdfeff-0001-4202-8303-040506070809':'0a0b0c0d-0e0f-4010-8011-121314151617';
  assert.equal(f.context.randomToken_(),'abcdefgh ijkl'.replace(' ',''));
  f.context.Utilities.getUuid=()=> 'not-a-uuid';
  assert.throws(()=>f.context.randomToken_(),/UUID v4/);
});
test('background semantics: defaults on new, keep on edit, explicit reset and required upload',()=>{
  const f=fixture(),base=f.context.validateCardInput_(validInput());
  assert.equal(base.roleBackgroundMode,'DEFAULT');
  const current={...base,roleBackgroundMode:'VIDEO',roleBackgroundFileId:'current-video'};
  const kept=f.context.validateCardInput_(validInput(),current);
  assert.equal(kept.roleBackgroundFileId,'current-video');
  const reset=f.context.validateCardInput_({...validInput(),roleBackgroundMode:'DEFAULT'},current);
  assert.equal(reset.roleBackgroundFileId,'');
  for(const fields of [{roleBackgroundMode:'IMAGE'},{roleBackgroundFileId:'orphan'},{roleBackgroundMode:'DEFAULT',roleBackgroundFileId:'unexpected'},{roleBackgroundMode:'WEBM'}])
    assert.throws(()=>f.context.validateCardInput_({...validInput(),...fields},current));
});
test('validation enforces required texts, profile, public contact; system fields are ignored',()=>{
  const f=fixture();
  for(const field of ['nameKo','roleItem5En','profileImageFileId','googleAccountEmail','publicEmail','mobilePhone'])
    assert.throws(()=>f.context.validateCardInput_({...validInput(),[field]:''}));
  assert.throws(()=>f.context.validateCardInput_({...validInput(),publicEmail:'invalid'}));
  const out=f.context.validateCardInput_({...validInput(),cardId:'injected',published:true,publicToken:'injected',isActive:false});
  assert.equal(out.googleAccountEmail,'person@example.org');
  for(const field of ['cardId','publicToken','published','isActive'])assert.equal(out[field],undefined);
});
test('media validation checks allowed formats and inclusive boundaries',()=>{
  const f=fixture(),video={mimeType:'video/mp4',sizeBytes:18*1024*1024,durationSeconds:3,width:2560,height:1440};
  assert.equal(f.context.validateMediaMetadata_(video,'VIDEO'),video);
  for(const patch of [{sizeBytes:video.sizeBytes+1},{durationSeconds:3.01},{durationSeconds:undefined},{width:2561},{height:1441},{mimeType:'video/webm'}])
    assert.throws(()=>f.context.validateMediaMetadata_({...video,...patch},'VIDEO'));
  for(const mimeType of ['image/jpeg','image/png','image/webp'])f.context.validateMediaMetadata_({mimeType,sizeBytes:1},'IMAGE');
  assert.throws(()=>f.context.validateMediaMetadata_({mimeType:'image/gif',sizeBytes:1},'IMAGE'));
});
test('company settings stay singleton and invalid changes preserve previous values',()=>{
  const f=ready(),input={};
  for(const key of f.run('ZNUS_SCHEMA.CompanySettings'))input[key]='value';
  input.companyWebsite='https://example.org';input.companyLogoFileId='logo-file';
  f.context.saveCompanySettings(input);f.context.saveCompanySettings({...input,companyName:'ZNUS'});
  assert.equal(f.sheets.get('CompanySettings').data.length,2);
  assert.equal(f.context.getCompanySettings().companyName,'ZNUS');
  assert.throws(()=>f.context.saveCompanySettings({...input,companyWebsite:'javascript:alert(1)'}));
  assert.equal(f.context.getCompanySettings().companyName,'ZNUS');
});
test('formula input is escaped and telephone leading zero is preserved',()=>{
  const f=ready();const card=f.context.createCardRecord_({...validInput(),nameKo:'=IMPORTXML("x")'});
  const sheet=f.sheets.get('Cards');
  assert.equal(sheet.writes.at(-1)[0][sheet.data[0].indexOf('nameKo')],"'"+card.nameKo);
  assert.equal(f.context.readRecords_(sheet,'Cards')[0].value.mobilePhone,'010-1234-5678');
});
test('public URL cannot change after card issuance; stored URL stays stable',()=>{
  const f=ready(),card=f.context.createCardRecord_(validInput());
  assert.throws(()=>f.context.configurePublicBaseUrl_('https://card.example.org'),/이전 절차/);
  assert.equal(f.context.readRecords_(f.sheets.get('Cards'),'Cards')[0].value.publicUrl,card.publicUrl);
  assert.throws(()=>f.context.configurePublicBaseUrl_('http://example.org'));
  const fresh=ready();fresh.context.configurePublicBaseUrl_('https://card.example.org/');
  assert.equal(fresh.context.publicUrl_('abcdefghijkl'),'https://card.example.org/abcdefghijkl');
});
test('public reads require active + published and exclude internal fields',()=>{
  const f=fixture('public-web');f.properties.ZNUS_SPREADSHEET_ID='sheet-id';
  const token='abcdefghijkl',headers=['errorMessage','googleAccountEmail','cardId','publicToken','published','isActive','nameKo','publicEmail'];
  f.sheets.set('Cards',new Sheet('Cards',[headers,['secret-error','secret@example.org','secret-id',token,true,false,'공개 이름','public@example.org']]));
  assert.equal(f.context.getPublicCard(token),null);
  f.sheets.get('Cards').data[1][5]=true;
  const card=f.context.getPublicCard(token);
  assert.equal(card.name,'공개 이름');
  assert.ok(!JSON.stringify(card).includes('secret'));
  f.sheets.get('Cards').data[1][4]=false;
  assert.equal(f.context.getPublicCard(token),null);
  assert.equal(f.context.getPublicCard('invalid'),null);
  assert.equal(f.context.getPublicCard('zzzzzzzzzzzz'),null);
});
test('public HTML route never embeds an unvalidated query string',()=>{
  const f=fixture('public-web');
  assert.equal(f.context.doGet({parameter:{card:"';alert(1)//"}}).slug,'');
  assert.equal(f.context.doGet({parameter:{card:'abcdefghijkl'}}).slug,'abcdefghijkl');
});
