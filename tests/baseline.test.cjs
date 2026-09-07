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

test('app.js parses cleanly and contains workflow board functions', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(appCode));
  assert(appCode.includes('function recordStage'));
  assert(appCode.includes('function boardStages'));
  assert(appCode.includes('function workflowBoard'));
  assert(appCode.includes('function applyStageChange'));
});

test('Schema review stage derivation maps empty to Draft and keeps unfamiliar statuses visible', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {
    iso: v => /^\d{4}-\d{2}-\d{2}$/.test(v),
    today: () => '2026-09-07'
  };
  vm.runInNewContext(
    appCode.slice(appCode.indexOf('function recordStage'), appCode.indexOf('function workflowCard')),
    sandbox
  );

  const emptyRec = { fields: { Status: '' } };
  assert.equal(sandbox.recordStage(emptyRec, 'Schema review'), 'Draft / Needs review');

  const uploadedRec = { fields: { Status: 'uploaded' } };
  assert.equal(sandbox.recordStage(uploadedRec, 'Schema review'), 'Uploaded');

  const unfamiliarRec = { fields: { Status: 'Clinical review requested' } };
  assert.equal(sandbox.recordStage(unfamiliarRec, 'Schema review'), 'Clinical review requested');

  const stages = sandbox.boardStages([emptyRec, uploadedRec, unfamiliarRec], 'Schema review');
  assert(stages.includes('Draft / Needs review'));
  assert(stages.includes('Uploaded'));
  assert(stages.includes('Clinical review requested'), 'Unfamiliar status must be visible in board stages');
});

test('Podcast Episodes stage derivation accurately classifies editor readiness and release dates', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {
    iso: v => /^\d{4}-\d{2}-\d{2}$/.test(v),
    today: () => '2026-09-07'
  };
  vm.runInNewContext(
    appCode.slice(appCode.indexOf('function recordStage'), appCode.indexOf('function workflowCard')),
    sandbox
  );

  const needsEditor = { fields: { 'Audio editor': '', 'Point person': 'Sharmin', 'Release date': '2026-09-20' } };
  assert.equal(sandbox.recordStage(needsEditor, 'Podcast Episodes'), 'Needs Audio Editor');

  const inEditing = { fields: { 'Audio editor': 'Nic', 'Point person': 'Sharmin', 'Release date': '2026-09-20' } };
  assert.equal(sandbox.recordStage(inEditing, 'Podcast Episodes'), 'In Editing');

  const released = { fields: { 'Audio editor': 'Sumeet', 'Point person': '', 'Release date': '2020-11-19' } };
  assert.equal(sandbox.recordStage(released, 'Podcast Episodes'), 'Released');

  const customStatus = { fields: { Status: 'Recording in progress', 'Audio editor': '', 'Point person': '' } };
  assert.equal(sandbox.recordStage(customStatus, 'Podcast Episodes'), 'Recording in progress');

  const stages = sandbox.boardStages([needsEditor, inEditing, released, customStatus], 'Podcast Episodes');
  assert(stages.includes('Needs Audio Editor'));
  assert(stages.includes('In Editing'));
  assert(stages.includes('Released'));
  assert(stages.includes('Recording in progress'), 'Custom podcast status must be visible');
});

test('Residency Programs and CRC retired records achieve full workbook parity', () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'workbook.json'), 'utf8'));
  assert(data['Residency Programs'], 'Residency Programs dataset must exist');
  assert.equal(data['Residency Programs'].records.length, 6, 'Residency Programs must contain 6 records');
  assert(data['Residency Programs'].columns.includes('Residency Programs'));
  assert(data['Residency Programs'].columns.includes('Facilitator'));

  assert(data['CRC - retired'], 'CRC - retired dataset must exist');
  assert.equal(data['CRC - retired'].records.length, 417, 'CRC - retired must contain 417 records');
  assert(data['CRC - retired'].columns.includes('MENTEE'));
  assert(data['CRC - retired'].columns.includes('CPSOLVERS MENTOR'));
});

