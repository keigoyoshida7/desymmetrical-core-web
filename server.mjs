import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export function startWebServer({port=Number(process.env.PORT||5174),root=resolve(dirname(fileURLToPath(import.meta.url)),'.'),onLog=console.log}={}){
 const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}const data=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);}catch{res.writeHead(404).end('Not found');}});
 const ready=new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{onLog(`Local: http://127.0.0.1:${server.address().port}`);resolve(server.address());});});
 return{ready,close:()=>new Promise(r=>server.close(r))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)startWebServer().ready.catch(e=>{console.error(e.message);process.exit(1);});
