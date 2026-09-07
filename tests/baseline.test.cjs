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
test('Leader of the Week source dates establish current leader or null when out of range',()=>{
 const data=JSON.parse(fs.readFileSync(path.join(root,'workbook.json'),'utf8'));
 const leaders=data['Leader of the Week'].records;
 function getLeaderForDate(dateStr){
  for(const r of leaders){
   const m=(r.fields.Dates||'').match(/^(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})$/);
   if(m){
    const sYear=m[1]==='12'&&m[3]==='01'?'2025':'2026';
    const start=`${sYear}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`,end=`2026-${m[3].padStart(2,'0')}-${m[4].padStart(2,'0')}`;
    if(dateStr>=start&&dateStr<=end)return r;
   }
  }
  return null;
 }
 assert.equal(getLeaderForDate('2026-09-07')?.fields.Member,'Ravi');
 assert.equal(getLeaderForDate('2026-10-15'),null);
});

