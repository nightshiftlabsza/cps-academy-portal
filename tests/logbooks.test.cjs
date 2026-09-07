'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {compile,peopleTokens,extractRoles,identityIndex,dateOf,writeImmutable,hash}=require('../scripts/compile-logbooks.cjs');
const person=(n,name,aliases=[])=>({id:'person-'+String(n).padStart(24,'0'),name,aliases});
const registry={schemaVersion:1,identities:[person(1,'Julia Zanco',['Julia Z']),person(2,'Julia Schlender',['Julia S']),person(3,'Chris Conway',['Chris C'])]};
const record=(id,fields)=>({id,source:'Morning Report',row:7,fields,links:{},flags:[]});
const workbook=records=>({'Morning Report':{records},'CPS Academy VMRs':{records:[]}});
const options={asOf:'2026-09-07',sourceHash:'fixture',registryHash:'fixture',splitMorningReport:r=>[r]};
test('name tokenizer preserves commas and conjunctions inside annotations',()=>{
  assert.deepEqual(peopleTokens("Julia Z & Chris Conway (friend, with mentor) / Julia S + Guest and Other w/ Third"),['Julia Z','Chris Conway (friend, with mentor)','Julia S','Guest','Other','Third']);
});
test('role labels bound values precisely including same-line labels',()=>{
  const result=extractRoles({'Scribe / teaching points sign-ups':'Scribe: Chris C Teaching Points: Julia Z\nCase Presenter: Julia S\nDiscord chat: Guest'});
  assert.deepEqual(result.segments.map(s=>[s.role,s.raw]),[['scribe','Chris C'],['teaching_points','Julia Z'],['presenter','Julia S'],['chat_support','Guest']]);
  const pipe=compile(workbook([record('MR:1',{'Scribe / teaching points sign-ups':'Scribe: Chris C | TP: Julia Z | Case Presenter: Julia S'})]),registry,options);
  assert.equal(pipe.audit.uniqueAssignments,3);
  assert.equal(pipe.people[registry.identities[0].id].entries[0].role,'teaching_points');
});
test('first-name collisions remain unresolved without cohort guessing',()=>{
  const index=identityIndex(registry);
  assert.equal(index.resolve('Julia').reason,'unverified-short-name');
  assert.equal(index.resolve('Julia').candidates.length,2);
  assert.equal(index.resolve('Julia Z.').id,registry.identities[0].id);
  const collision=identityIndex({schemaVersion:1,identities:[person(1,'Julia Zanco',['JZ']),person(2,'Julia Zane',['JZ'])]});
  assert.equal(collision.resolve('JZ').reason,'ambiguous-alias');
  assert.equal(index.resolve('Chris').reason,'unverified-short-name');
});
test('dates require explicit calendar evidence and reject overflow or numeric ambiguity',()=>{
  assert.equal(dateOf({Date:'2026-02-30'}),null);
  assert.equal(dateOf({'Date / time (source)':'09/07/2026'}),null);
  assert.equal(dateOf({'Date / time (source)':'Wednesday, June 14, 2023\n11 am PT'}),'2023-06-14');
});
test('ledger accounts for every token without turning future assignments into attendance',()=>{
  const result=compile(workbook([record('MR:1',{Date:'2026-09-08',Facilitator:'Julia Z & Julia & TBD','Scribe / teaching points sign-ups':'Scribe: Chris C\nCase Presenter: Guest'})]),registry,options);
  assert.equal(result.audit.tokenCount,5);
  assert.equal(result.audit.resolvedTokens,2);
  assert.equal(result.audit.unresolvedTokens,2);
  assert.equal(result.audit.placeholderTokens,1);
  const entry=result.people[registry.identities[0].id].entries[0];
  assert.equal(entry.temporalState,'scheduled');
  assert.equal(entry.status,'unverified-workbook-assignment');
  assert.equal(result.rows.length,1);
  assert.deepEqual(result,compile(workbook([record('MR:1',{Date:'2026-09-08',Facilitator:'Julia Z & Julia & TBD','Scribe / teaching points sign-ups':'Scribe: Chris C\nCase Presenter: Guest'})]),registry,options));
});
test('same-day distinct sessions survive deduplication while duplicate evidence merges',()=>{
  const r=record('MR:1',{Date:'2026-09-01','Scribe / teaching points sign-ups':'Scribe: Julia Z & Julia Z'});
  const result=compile(workbook([r]),registry,{...options,splitMorningReport:r=>[1,2].map(n=>({...r,id:r.id+'::session:'+n}))});
  assert.equal(result.people[registry.identities[0].id].entries.length,2);
  assert.equal(result.audit.duplicateTokens,2);
  assert.equal(result.audit.uniqueAssignments,2);
});
test('cancellations, conditional roles, unknown roles remain auditable and uncredited',()=>{
  const result=compile(workbook([record('MR:1',{Date:'2026-09-01',Notes:'Cancelled',Facilitator:'Julia Z'}),record('MR:2',{Facilitator:'Julia Z (backup: Chris C)','Scribe / teaching points sign-ups':'unlabelled text'})]),registry,options);
  assert.equal(Object.keys(result.people).length,0);
  assert.equal(result.audit.excludedTokens,1);
  assert.equal(result.audit.unresolvedTokens,1);
  assert.ok(result.unresolved.some(u=>u.reason==='unlabelled-role-text'));
});
test('alternative people and unassigned multi-session fields are withheld from both candidate identities',()=>{
  const result=compile(workbook([record('MR:1',{Facilitator:'Julia Z / or Julia S'}),record('MR:2',{Facilitator:'Chris C'})]),registry,{...options,splitMorningReport:r=>r.id==='MR:2'?[{...r,session:{unassignedFields:{Facilitator:'Chris C'},unresolved:['Facilitator alignment unknown']}}]:[r]});
  assert.equal(Object.keys(result.people).length,0);
  assert.equal(result.audit.unresolvedTokens,3);
  assert.ok(result.unresolved.some(u=>u.reason==='unassigned-session-field'));
});
test('compiler rejects implicit date and missing source series',()=>{
  assert.throws(()=>compile(workbook([]),registry,{...options,asOf:undefined}),/as-of/);
  assert.throws(()=>compile({},registry,options),/Missing series/);
});
test('immutable output permits byte-identical rebuild and blocks replacement by default',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cps-ledger-'));
  try {const file=path.join(dir,'ledger.json');assert.equal(writeImmutable(file,'one'),'written');assert.equal(writeImmutable(file,'one'),'unchanged');assert.throws(()=>writeImmutable(file,'two'),/differs/);assert.equal(fs.readFileSync(file,'utf8'),'one');assert.equal(writeImmutable(file,'two',true),'written');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('actual snapshot count and source audit cover every source row',()=>{
  const data=require('../workbook.json'),identities=require('../data/logbook-identities.json');
  const result=compile(data,identities,{...options,splitMorningReport:require('../session-core.js').splitMorningReport});
  assert.deepEqual(result.audit.seriesRows,{'Morning Report':2368,'CPS Academy VMRs':255});
  assert.equal(result.rows.length,2623);
  assert.equal(new Set(result.rows.map(r=>r.id)).size,2623);
  assert.equal(result.audit.tokenCount,result.audit.resolvedTokens+result.audit.unresolvedTokens+result.audit.placeholderTokens+result.audit.excludedTokens);
  assert.ok(result.rows.find(r=>r.id==='Morning Report:12').sessionIds.length>1);
});
test('approved ledger hashes identify its workbook, registry and compilation code',()=>{
  const ledger=require('../historical-contributions.json');
  for(const [key,file] of [['sourceHash','workbook.json'],['registryHash','data/logbook-identities.json'],['compilerHash','scripts/compile-logbooks.cjs'],['sessionParserHash','session-core.js']]) assert.equal(ledger[key],hash(fs.readFileSync(path.join(__dirname,'..',file))),`${key} changed: regenerate and review ledger`);
});
