import http from 'node:http';import handler from './api/index.mjs';
http.createServer((req,res)=>handler(req,res).catch(e=>{console.error(e.message);if(!res.headersSent)res.writeHead(500);res.end('Something went wrong. Please try again.');})).listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('KCNA Academy running on port '+(process.env.PORT||3000)));
