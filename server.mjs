import http from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({app:'sprite-check',version:1}));}const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=await realpath(path.join(root,rel==='/'?'index.html':rel));const safe=path.relative(await realpath(root),file);if(safe.startsWith('..')||path.isAbsolute(safe)){res.writeHead(403);return res.end('Forbidden');}const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}});
server.listen(4317,'127.0.0.1',()=>console.log('Sprite Check: http://127.0.0.1:4317'));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
