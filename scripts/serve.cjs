const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const allowed=new Set(['index.html','app.js','styles.css','workbook.json']);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
function createServer(){return http.createServer((req,res)=>{
 let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html'}catch{res.writeHead(400).end();return}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return}
 if(!allowed.has(name)){res.writeHead(404).end('Not found');return}
 fs.readFile(path.join(root,name),(error,data)=>{if(error){res.writeHead(500).end('File unavailable');return}res.writeHead(200,{'Content-Type':types[path.extname(name)]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data)});
})}
if(require.main===module){const port=Number(process.env.PORT||4173);const server=createServer();server.on('error',e=>{console.error('Could not start:',e.message);process.exitCode=1});server.listen(port,'127.0.0.1',()=>console.log(`CPS Academy Portal: http://127.0.0.1:${port}\nPress Ctrl+C to stop. Local computer only.`))}
module.exports={createServer};
