// Local-only review fixture. No connection to the operational spreadsheet.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const demo = {slug:'abcdefghijkl',name:'김준호',nameEn:'Junho Kim',department:'디지털전략팀',position:'선임 개발자',positionEn:'Senior Developer',phone:'010-1234-5678',email:'demo@znit.co.kr',address:'서울특별시 중구 세종대로 110',website:'https://znus.co.kr',companyName:'ZNUS',companyPhone:'02-1234-5678',companyFax:'02-1234-5679',slogans:['Sharing Information','Connecting the World','Shaping the Future'],profileImageUrl:'/profile.png',logoUrl:'/assets/logo_w_2.svg',publicUrl:'https://example.org/abcdefghijkl',assetBase:'http://127.0.0.1:4173/assets',roles:['디지털 명함 서비스 개발','Google Workspace 자동화','웹 프론트엔드 구현','사용자 경험 개선','서비스 운영 및 문서화'].map((ko,i)=>({ko,en:['Digital business card development','Google Workspace automation','Web frontend implementation','User experience improvement','Service operations and documentation'][i]})),sections:['role','contact','company','links'].map(type=>({type,kind:'DEFAULT',imageUrl:''}))};
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4173');
  if(url.pathname==='/'){
    const html=fs.readFileSync(path.join(root,'apps-script/public-web/Card.html'),'utf8').replace('<?= slug ?>','abcdefghijkl').replace('<head>','<head><script>window.ZNUS_DEMO='+JSON.stringify(demo)+'</script>');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html);
  }
  const filename=url.pathname==='/profile.png'?path.join(root,'cardDesign/간략명함_디자인/images/profile/sample/01.png'):/^\/assets\/[\w.-]+$/.test(url.pathname)?path.join(root,'cardDesign/명함_디자인',url.pathname.slice(1)):'';
  if(!filename||!fs.existsSync(filename)){res.writeHead(404);return res.end();}
  const mime={'.svg':'image/svg+xml','.mp4':'video/mp4','.jpg':'image/jpeg','.png':'image/png'}[path.extname(filename)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':mime});fs.createReadStream(filename).pipe(res);
}).listen(4173,'127.0.0.1',()=>console.log('Review fixture: http://127.0.0.1:4173'));
