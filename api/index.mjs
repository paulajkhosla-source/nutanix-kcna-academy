import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../private');
const read=n=>fs.readFileSync(path.join(base,n),'utf8');
let secrets;try{secrets=JSON.parse(read('secret.json'));}catch{secrets={};}
const signing=process.env.SESSION_SECRET||secrets.session;
const hash=process.env.PASSWORD_HASH||secrets.hash;
const salt=process.env.PASSWORD_SALT||secrets.salt;
const sign=v=>crypto.createHmac('sha256',signing).update(v).digest('base64url');
const safe=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&crypto.timingSafeEqual(x,y);};
export function tokenValid(token){try{const [exp,nonce,sig]=token.split('.');return Number(exp)>Date.now()&&Number(exp)<Date.now()+8*86400000&&safe(sign(exp+'.'+nonce),sig);}catch{return false;}}
const tries=new Map();
const send=(res,status,body,type='text/html; charset=utf-8')=>{res.statusCode=status;res.setHeader('Content-Type',type);res.end(body);};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://i.ytimg.com data:; connect-src 'self'; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
 const url=new URL(req.url,'http://localhost'); const route=url.pathname;
 if(!signing||!hash||!salt)return send(res,503,'Application authentication is not configured.');
 const secure=process.env.VERCEL||req.headers['x-forwarded-proto']==='https'; const cookieExtra='; Path=/; HttpOnly; SameSite=Strict'+(secure?'; Secure':'');
 if(req.method==='POST'){
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,'Request origin rejected.');
  if(route==='/logout'){res.setHeader('Set-Cookie','kcna_session=; Max-Age=0'+cookieExtra);res.statusCode=303;res.setHeader('Location','/');return res.end();}
  if(route!=='/login')return send(res,404,'Not found');
  const ip=req.headers['x-forwarded-for']?.split(',')[0]||req.socket?.remoteAddress||'unknown';const now=Date.now();if(tries.size>10000){for(const [k,v]of tries)if(v.until<now)tries.delete(k);}
  let rate=tries.get(ip);if(!rate||rate.until<now){rate={count:0,until:now+600000};tries.set(ip,rate);}if(rate.count>=12){res.setHeader('Retry-After','600');return send(res,429,login('Too many attempts. Please try again in 10 minutes.'));}rate.count++;
  let raw='';if(req.body!==undefined){raw=typeof req.body==='string'?req.body:new URLSearchParams(req.body).toString();}else{for await(const chunk of req){raw+=chunk;if(raw.length>4096)return send(res,413,'Request too large');}}
  const password=new URLSearchParams(raw).get('password')||'';if(password.length>256)return send(res,400,login('Password is too long.'));
  const candidate=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(e,k)=>e?reject(e):resolve(k.toString('hex'))));
  if(!safe(candidate,hash))return send(res,401,login('That password is not correct. Try again.'));
  tries.delete(ip);const value=(Date.now()+7*86400000)+'.'+crypto.randomBytes(16).toString('hex');res.setHeader('Set-Cookie','kcna_session='+value+'.'+sign(value)+'; Max-Age=604800'+cookieExtra);res.statusCode=303;res.setHeader('Location','/');return res.end();
 }
 if(!['GET','HEAD'].includes(req.method))return send(res,405,'Method not allowed');
 if(route==='/style.css')return send(res,200,read('style.css'),'text/css; charset=utf-8');
 const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('kcna_session='))?.slice(13);
 if(!tokenValid(token)){if(route==='/'||route==='/login')return send(res,200,login());return send(res,401,'Sign in required.','text/plain');}
 const routes={'/car':['car.html','text/html'],'/car/':['car.html','text/html'],'/car.js':['car.js','text/javascript'],'/audio-engine.js':['audio-engine.js','text/javascript'],'/car.css':['car.css','text/css'],'/':['app.html','text/html'],'/app.js':['app.js','text/javascript'],'/content.json':['content.json','application/json'],'/videos.json':['videos.json','application/json']};
 if(routes[route])return send(res,200,read(routes[route][0]),routes[route][1]+'; charset=utf-8');
 return send(res,404,'Not found','text/plain');
}
function login(error=''){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in · KCNA Academy</title><link rel="stylesheet" href="/style.css"></head><body class="login-body"><main class="login-card"><div class="brand"><span class="brand-mark">K</span><span>KCNA<span class="brand-light"> / ACADEMY</span></span></div><span class="eyebrow">NUTANIX TEAM LEARNING</span><h1>Your next<br>certification<br><span class="purple">starts here.</span></h1><p>One place to learn Kubernetes, practise together and prepare for KCNA.</p><form method="post" action="/login"><label for="password">Team password</label><input id="password" type="password" name="password" autocomplete="current-password" required autofocus maxlength="256"><p class="error" role="alert">${error}</p><button class="primary wide" type="submit">Enter the academy <span>→</span></button></form><div class="login-meta"><span>4 exam domains</span><span>21 lessons</span><span>150 questions</span></div><small>Independent study resource · Current syllabus checked 21 Sep 2026</small></main></body></html>`;}
