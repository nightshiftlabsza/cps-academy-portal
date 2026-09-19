const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const allowed=new Set(['index.html','session-core.js','search-core.js','identity.js','offline.js','logbook.js','windowed-list.js','members.js','app.js','styles.css','members.css','workbook.json','sw.js']);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
function createServer(){return http.createServer((req,res)=>{
 let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html'}catch{res.writeHead(400).end();return}
 if(name==='api/login'){
   try {
     const handler = require('../api/login.js');
     return handler(req, res);
   } catch (e) {
     res.writeHead(500).end(JSON.stringify({ error: 'SERVER_ERROR', message: e.message }));
     return;
   }
 }
 if(name==='api/mutate'){
   try {
     const handler = require('../api/mutate.js');
     return handler(req, res);
   } catch (e) {
     res.writeHead(500).end(JSON.stringify({ error: 'SERVER_ERROR', message: e.message }));
     return;
   }
 }
 if(name==='api/sync'){
   try {
     const handler = require('../api/sync.js');
     return handler(req, res);
   } catch (e) {
     res.writeHead(500).end(JSON.stringify({ error: 'SERVER_ERROR', message: e.message }));
     return;
   }
 }
 if(name==='api/sync-webhook'){
   try {
     const handler = require('../api/sync-webhook.js');
     return handler(req, res);
   } catch (e) {
     res.writeHead(500).end(JSON.stringify({ error: 'SERVER_ERROR', message: e.message }));
     return;
   }
 }
 if(name==='api/profile'){
   try {
     const handler = require('../api/profile.js');
     return handler(req, res);
   } catch (e) {
     res.writeHead(500).end(JSON.stringify({ error: 'SERVER_ERROR', message: e.message }));
     return;
   }
 }
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return}
 if(!allowed.has(name)){res.writeHead(404).end('Not found');return}
 fs.readFile(path.join(root,name),(error,data)=>{
   if(error){res.writeHead(500).end('File unavailable');return}
   if(name==='workbook.json'){
     try{
       const wb=JSON.parse(data.toString('utf8'));
       if(wb.Members&&Array.isArray(wb.Members.records)){
         wb.Members.records=wb.Members.records.map(rec=>({
           ...rec,
           fields:{...rec.fields,Birthday:rec.fields?.Birthday?'Redacted':''}
         }));
         data=Buffer.from(JSON.stringify(wb));
       }
     }catch{}
   }
   const headers={'Content-Type':types[path.extname(name)]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};if(name==='sw.js')headers['Service-Worker-Allowed']='/';res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:data)
 });
})}
if(require.main===module){const port=Number(process.env.PORT||4173);const server=createServer();server.on('error',e=>{console.error('Could not start:',e.message);process.exitCode=1});server.listen(port,'127.0.0.1',()=>console.log(`CPS Academy Portal: http://127.0.0.1:${port}\nPress Ctrl+C to stop. Local computer only.`))}
module.exports={createServer};
