// Local-only review fixture. No connection to the operational spreadsheet.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const demo = {slug:'abcdefghijkl',name:'김준호',nameEn:'Junho Kim',department:'디지털전략팀',position:'선임 개발자',positionEn:'Senior Developer',phone:'010-1234-5678',email:'demo@znit.co.kr',address:'서울특별시 중구 세종대로 110',website:'https://znus.co.kr',companyName:'ZNUS',companyPhone:'02-1234-5678',companyFax:'02-1234-5679',slogans:['Sharing Information','Connecting the World','Shaping the Future'],profileImageUrl:'/profile.png',logoUrl:'/assets/logo_w_2.svg',publicUrl:'https://example.org/abcdefghijkl',assetBase:'http://127.0.0.1:4173/assets',roles:['디지털 명함 서비스 개발','Google Workspace 자동화','웹 프론트엔드 구현','사용자 경험 개선','서비스 운영 및 문서화'].map((ko,i)=>({ko,en:['Digital business card development','Google Workspace automation','Web frontend implementation','User experience improvement','Service operations and documentation'][i]})),sections:['profile','role','contact','company','links'].map(type=>({type,kind:'DEFAULT',imageUrl:''}))};
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4173');
  if (url.pathname === '/dashboard' && url.searchParams.get('source') === 'bundle') {
    const files=['Schema.gs','Config.gs','Validation.gs','Repository.gs','MediaProcessing.gs','FormAutomation.gs','Connection.gs','PreviewData.gs','Dashboard.gs','Code.gs'];
    const source=files.map(file=>fs.readFileSync(path.join(root,'apps-script/admin-bound',file),'utf8')).join('\n\n');
    res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});return res.end(source);
  }
  if (url.pathname === '/dashboard' && url.searchParams.get('source') === 'gallery') {
    const source=fs.readFileSync(path.join(root,'apps-script/admin-bound','AdminGallery.html'),'utf8');
    res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});return res.end(source);
  }
  if(url.pathname==='/__source/bundle.gs' || url.pathname==='/__source/AdminGallery.html'){
    const files=['Schema.gs','Config.gs','Validation.gs','Repository.gs','MediaProcessing.gs','FormAutomation.gs','Connection.gs','PreviewData.gs','Dashboard.gs','Code.gs'];
    const source=url.pathname.endsWith('bundle.gs') ? files.map(file=>fs.readFileSync(path.join(root,'apps-script/admin-bound',file),'utf8')).join('\n\n') : fs.readFileSync(path.join(root,'apps-script/admin-bound','AdminGallery.html'),'utf8');
    res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});return res.end(source);
  }
  if (url.pathname === '/__source/Card.html') {
    const source = fs.readFileSync(path.join(root, 'apps-script/public-web', 'Card.html'), 'utf8');
    res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'});
    return res.end(source);
  }
  if (url.pathname === '/__copy/Card.html') {
    const source = fs.readFileSync(path.join(root, 'apps-script/public-web', 'Card.html'), 'utf8');
    const escaped = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
    return res.end('<textarea id="source" style="width:100%;height:100vh">' + escaped + '</textarea>');
  }
  if (url.pathname === '/__copy/Code.gs' || url.pathname === '/__copy/Code') {
    const source = fs.readFileSync(path.join(root, 'apps-script/public-web', 'Code.gs'), 'utf8');
    const escaped = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
    return res.end('<textarea id="source" style="width:100%;height:100vh">' + escaped + '</textarea>');
  }
  if(url.pathname==='/dashboard'){
    const employee={employeeId:'demo-employee',name:demo.name,nameEn:demo.nameEn,department:demo.department,
      position:demo.position,positionEn:demo.positionEn,phone:demo.phone,email:demo.email,accountEmail:'demo@example.org',
      profileImage:'/profile.png',mobileUrl:'http://127.0.0.1:4173/',status:'생성완료',roles:demo.roles,
      backgrounds:demo.sections.map(section=>({type:section.type,mode:'DEFAULT'})),missingFields:[],errorMessage:'',updatedAt:'로컬 데모'};
    const mock='<script>const demoEmployees='+JSON.stringify([employee])+';window.google={script:{run:{withSuccessHandler(fn){this.success=fn;return this},withFailureHandler(){return this},getEmployees(){this.success(demoEmployees)}}}};</script>';
    const qr=fs.readFileSync(path.join(root,'apps-script/admin-bound/QrLibrary.html'),'utf8');
    const html=fs.readFileSync(path.join(root,'apps-script/admin-bound/AdminGallery.html'),'utf8')
      .replace('<script>',()=>mock+qr+'<script>')
      .replace('Google Sheets에 입력된 직원 데이터를 한눈에 확인합니다.','로컬 미리보기 · 샘플 데이터입니다.');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html);
  }
  if(url.pathname==='/'){
    const fixture = {...demo, assetBase: url.searchParams.has('no-assets') ? '' : demo.assetBase};
    const html=fs.readFileSync(path.join(root,'apps-script/public-web/Card.html'),'utf8').replace('<?= slug ?>','abcdefghijkl').replace('<head>','<head><script>window.ZNUS_DEMO='+JSON.stringify(fixture)+'</script>');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html);
  }
  const filename=url.pathname==='/profile.png'?path.join(root,'cardDesign/간략명함_디자인/images/profile/sample/01.png'):/^\/assets\/[\w.-]+$/.test(url.pathname)?path.join(root,'cardDesign/명함_디자인',url.pathname.slice(1)):'';
  if(!filename||!fs.existsSync(filename)){res.writeHead(404);return res.end();}
  const mime={'.svg':'image/svg+xml','.mp4':'video/mp4','.jpg':'image/jpeg','.png':'image/png'}[path.extname(filename)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':mime});fs.createReadStream(filename).pipe(res);
}).listen(4173,'127.0.0.1',()=>console.log('Review fixture: http://127.0.0.1:4173'));
