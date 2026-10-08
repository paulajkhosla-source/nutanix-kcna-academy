import test, {after} from 'node:test';import http from 'node:http';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
process.env.PASSWORD_SALT=crypto.randomBytes(24).toString('hex');process.env.PASSWORD_HASH=crypto.scryptSync('test-only-academy-password',process.env.PASSWORD_SALT,64).toString('hex');process.env.SESSION_SECRET=crypto.randomBytes(48).toString('hex');const {default:handler}=await import('./api/index.mjs');
const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;let cookie='';const content=JSON.parse(fs.readFileSync(new URL('./private/content.json',import.meta.url)));
test('curriculum and three distinct weighted papers',()=>{assert.equal(content.lessons.length,21);assert.equal(content.questions.length,150);assert.equal(new Set(content.questions.map(q=>q.question)).size,150);assert.equal(content.domains.reduce((s,d)=>s+d.weight,0),100);for(let set=0;set<3;set++){const qs=content.questions.filter(q=>q.set===set);assert.equal(qs.length,50);for(const[d,n]of[['fundamentals',22],['orchestration',14],['delivery',8],['architecture',6]])assert.equal(qs.filter(q=>q.domain===d).length,n);}for(const q of content.questions){assert.equal(new Set(q.options).size,4);assert.ok(q.answer>=0&&q.answer<4);assert.ok(q.explanation.length>30);assert.ok(content.lessons.some(l=>l.id===q.lesson&&l.domain===q.domain));}});
test('authentication protects content, scripts and source paths',async()=>{for(const p of ['/content.json','/app.js','/videos.json','/car','/car/','/car.js','/car.css','/audio-engine.js','/private/secret.json','/private/questions.txt','/api/index']){const r=await fetch(base+p);assert.equal(r.status,401,p);assert.ok(!(await r.text()).includes('sessionSecret'));}const page=await fetch(base);assert.equal(page.status,200);assert.ok((await page.text()).includes('Team password'));});
test('incorrect password rejected; correct password yields an HttpOnly session',async()=>{let r=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'password=wrong',redirect:'manual'});assert.equal(r.status,401);r=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'password=test-only-academy-password',redirect:'manual'});assert.equal(r.status,303);const c=r.headers.get('set-cookie');assert.ok(c.includes('HttpOnly'));assert.ok(c.includes('SameSite=Strict'));cookie=c.split(';')[0];r=await fetch(base+'/content.json',{headers:{cookie}});assert.equal(r.status,200);assert.equal((await r.json()).questions.length,150);r=await fetch(base+'/private/secret.json',{headers:{cookie}});assert.equal(r.status,404);});
test('forged, modified and expired sessions rejected',async()=>{const cfg={session:process.env.SESSION_SECRET};const value=(Date.now()-1000)+'.test';const expired=value+'.'+crypto.createHmac('sha256',cfg.session).update(value).digest('base64url');for(const c of ['kcna_session=forged','kcna_session='+expired,cookie+'x']){const r=await fetch(base+'/content.json',{headers:{cookie:c}});assert.equal(r.status,401);}});
test('cross-origin login rejected and logout clears cookie',async()=>{let r=await fetch(base+'/login',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/x-www-form-urlencoded'},body:'password=test-only-academy-password'});assert.equal(r.status,403);r=await fetch(base+'/logout',{method:'POST',headers:{cookie},redirect:'manual'});assert.equal(r.status,303);assert.ok(r.headers.get('set-cookie').includes('Max-Age=0'));});

test('authenticated car mode routes serve the protected player and modules',async()=>{for(const [path,type] of [['/car','text/html'],['/car/','text/html'],['/car.js','text/javascript'],['/audio-engine.js','text/javascript'],['/car.css','text/css']]){const r=await fetch(base+path,{headers:{cookie}});assert.equal(r.status,200,path);assert.ok(r.headers.get('content-type').startsWith(type));assert.ok(r.headers.get('cache-control').includes('no-store'));assert.ok((await r.text()).length>100);}});

test('study library remains private and serves injected content without caching',async()=>{
 const prior=process.env.TEAM_STUDY_LIBRARY_JSON;
 try{
  process.env.TEAM_STUDY_LIBRARY_JSON=JSON.stringify({updatedAt:'2026-10-08',summary:'Test revision set',notes:[{id:'test-note',title:'Example note',category:'Concepts',body:'A private test explanation.',bullets:['First distinction'],tags:['test'],sources:[{label:'Reference',url:'https://example.com/reference'}]}],resources:[],questions:[{id:'test-check',noteId:'test-note',prompt:'Which choice?',options:['First','Second'],answer:0,explanation:'First is the test answer.'}],ignored:'not exposed'});
  for(const headers of [{},{cookie:'kcna_session=forged'}]){const response=await fetch(base+'/api/study-library',{headers});assert.equal(response.status,401);assert.ok(!(await response.text()).includes('private test explanation'));}
  let response=await fetch(base+'/api/study-library',{headers:{cookie}});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);assert.match(response.headers.get('content-type'),/application\/json/);const data=await response.json();assert.equal(data.notes[0].body,'A private test explanation.');assert.equal(data.questions[0].answer,0);assert.equal(data.ignored,undefined);
  process.env.TEAM_STUDY_LIBRARY_JSON='{"notes":"private-broken-value"';response=await fetch(base+'/api/study-library',{headers:{cookie}});assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private-broken-value'));
  delete process.env.TEAM_STUDY_LIBRARY_JSON;response=await fetch(base+'/api/study-library',{headers:{cookie}});assert.equal(response.status,200);assert.deepEqual((await response.json()).notes,[]);
 }finally{if(prior===undefined)delete process.env.TEAM_STUDY_LIBRARY_JSON;else process.env.TEAM_STUDY_LIBRARY_JSON=prior;}
});

test('study library rejects unsafe sources, malformed entries and invalid knowledge checks',async()=>{
 const {parseStudyLibrary}=await import('./api/study-library.mjs');
 const note={id:'example',title:'A note',body:'A concept',sources:[]};
 const create=overrides=>JSON.stringify({notes:[note],resources:[],...overrides});
 assert.equal(parseStudyLibrary('').configured,false);
 assert.deepEqual(parseStudyLibrary(create({notes:[{...note,sources:[{label:'Shared study guide'}]}]})).notes[0].sources,[{label:'Shared study guide',url:''}]);
 for(const url of ['javascript:alert(1)','data:text/html,test','http://example.com','https://user:password@example.com'])assert.throws(()=>parseStudyLibrary(create({notes:[{...note,sources:[{label:'Source',url}]}]})));
 for(const value of ['null','[]','{}',create({notes:[note,note]}),create({notes:[{...note,title:2}]}),create({notes:[{...note,tags:['x'.repeat(101)]}]}),create({updatedAt:'not a date'}),'x'.repeat(262145)])assert.throws(()=>parseStudyLibrary(value));
 const question={id:'check',noteId:'example',prompt:'Which one?',options:['A','B'],answer:0,explanation:'A is correct.'};
 assert.equal(parseStudyLibrary(create({questions:[question]})).questions.length,1);
 for(const change of [{answer:2},{answer:'0'},{options:['A','A']},{options:['A']},{noteId:'missing'},{id:'example'},{explanation:''}])assert.throws(()=>parseStudyLibrary(create({questions:[{...question,...change}]})));
 const output=parseStudyLibrary(create({notes:[{...note,body:'<script>example</script>'}]}));assert.equal(output.notes[0].body,'<script>example</script>');
});


test('compressed study catalogues decode identically and reject malformed or oversized input',async()=>{
 const {parseStudyLibrary}=await import('./api/study-library.mjs');
 const {gzipSync}=await import('node:zlib');
 const wrap=text=>JSON.stringify({encoding:'gzip-base64',data:gzipSync(Buffer.from(text)).toString('base64')});
 const raw=JSON.stringify({updatedAt:'2026-10-08',summary:'A test catalogue',notes:[{id:'compressed-note',title:'Example',body:'A revision explanation.',sources:[{label:'Shared example'}]}],resources:[],questions:[{id:'compressed-check',noteId:'compressed-note',prompt:'Choose one',options:['A','B'],answer:0,explanation:'A is correct.'}]});
 assert.deepEqual(parseStudyLibrary(wrap(raw)),parseStudyLibrary(raw));
 for(const value of [JSON.stringify({encoding:'unknown',data:'AAAA'}),JSON.stringify({encoding:'gzip-base64',data:'not base64!'}),JSON.stringify({encoding:'gzip-base64',data:'eA=='}),JSON.stringify({encoding:'gzip-base64',data:'Zh=='}),JSON.stringify({encoding:'gzip-base64',data:'',notes:[],resources:[]}),JSON.stringify({encoding:'gzip-base64',data:'A'.repeat(262148)}),wrap('x'.repeat(262145)),wrap('invalid JSON'),wrap(JSON.stringify({encoding:'gzip-base64',data:'AAAA'}))])assert.throws(()=>parseStudyLibrary(value));
 const envelope=JSON.parse(wrap(raw));envelope.notes=[];assert.throws(()=>parseStudyLibrary(JSON.stringify(envelope)));
});
