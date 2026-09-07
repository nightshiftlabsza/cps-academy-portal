const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('source parses and workbook references remain unique',()=>{
 new vm.Script(fs.readFileSync(path.join(root,'app.js'),'utf8'));
 const data=JSON.parse(fs.readFileSync(path.join(root,'workbook.json'),'utf8'));const ids=new Set();
 for(const area of Object.values(data))for(const record of area.records){assert(!ids.has(record.id));ids.add(record.id);assert(record.source);assert(record.fields);assert(Array.isArray(record.flags))}
 assert(ids.size>3000);
});
test('local server serves assets but hides repository and original workbook',async()=>{
 const {createServer}=require('../scripts/serve.cjs');const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const base=`http://127.0.0.1:${server.address().port}`;for(const url of ['/','/app.js','/styles.css','/workbook.json'])assert.equal((await fetch(base+url)).status,200);for(const url of ['/.git/config','/.env','/README.md','/upload/file.xlsx','/%2e%2e/package.json'])assert.equal((await fetch(base+url)).status,404)}finally{await new Promise(r=>server.close(r))}
});
