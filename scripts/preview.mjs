import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/info'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({preview:true}));return;}const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)&&file!==root)throw Error();const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}}).listen(8799,'127.0.0.1',()=>console.log('Monitor: http://127.0.0.1:8799/monitor.html?modo=demo&sala=4321 — Controle: http://127.0.0.1:8799/controle.html?modo=demo&sala=4321'));
