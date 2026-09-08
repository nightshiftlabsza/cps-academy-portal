'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {compile,peopleTokens,extractRoles,identityIndex,dateOf,writeImmutable,hash}=require('../scripts/compile-logbooks.cjs');
const {diffLedgers}=require('../scripts/diff-logbooks.cjs');
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
  for(const [key,file] of [['sourceHash','workbook.json'],['registryHash','data/logbook-identities.json'],['sessionParserHash','session-core.js']]) {
    assert.equal(ledger[key],hash(fs.readFileSync(path.join(__dirname,'..',file))),`${key} changed: regenerate and review ledger`);
  }
  assert.match(ledger.compilerHash,/^[a-f0-9]{64}$/);
});
test('recompiling identical inputs produces identical bytes',()=>{
  const aliases={
    schemaVersion:1,
    decisions:[
      {id:'dec-occ-1',type:'occurrence',status:'accepted',sessionId:'MR:1',role:'facilitator',raw:'Julia',personId:registry.identities[0].id},
      {id:'dec-glob-1',type:'global',status:'accepted',raw:'J. Zanco',personId:registry.identities[0].id}
    ]
  };
  const aliasHash=hash(JSON.stringify(aliases));
  const wb=workbook([
    record('MR:1',{Date:'2026-09-01',Facilitator:'Julia'}),
    record('MR:2',{Date:'2026-09-02',Facilitator:'J. Zanco'})
  ]);
  const run1=compile(wb,registry,{...options,aliases,aliasHash});
  const run2=compile(wb,registry,{...options,aliases,aliasHash});
  const s1=JSON.stringify(run1,null,2)+'\n';
  const s2=JSON.stringify(run2,null,2)+'\n';
  assert.equal(s1,s2);
  assert.equal(hash(s1),hash(s2));
  assert.equal(run1.aliasHash,aliasHash);
  assert.deepEqual(run1.decisionIds,['dec-glob-1','dec-occ-1']);
});
test('one accepted occurrence changes only its intended assignment',()=>{
  const wb=workbook([
    record('MR:101',{Date:'2026-09-01','Scribe / teaching points sign-ups':'Scribe: Julia'}),
    record('MR:102',{Date:'2026-09-02','Scribe / teaching points sign-ups':'Scribe: Julia'})
  ]);
  const aliases={
    schemaVersion:1,
    decisions:[
      {id:'dec-mr101',type:'occurrence',status:'accepted',sessionId:'MR:101',role:'scribe',raw:'Julia',personId:registry.identities[0].id},
      {id:'dec-pending',type:'occurrence',status:'pending',sessionId:'MR:102',role:'scribe',raw:'Julia',personId:registry.identities[1].id}
    ]
  };
  const result=compile(wb,registry,{...options,aliases,aliasHash:'hash-test'});
  const p1=result.people[registry.identities[0].id];
  assert.ok(p1,'Julia Zanco should have an assignment');
  assert.equal(p1.entries.length,1);
  assert.equal(p1.entries[0].sessionId,'MR:101');
  assert.equal(p1.entries[0].role,'scribe');
  assert.equal(result.people[registry.identities[1].id],undefined,'Pending decision must not be applied');
  const unresolvedMR102=result.unresolved.filter(u=>u.sessionId==='MR:102');
  assert.equal(unresolvedMR102.length,1);
  assert.equal(unresolvedMR102[0].reason,'unverified-short-name');
  assert.deepEqual(result.decisionIds,['dec-mr101']);
});
test('global aliases show the expected affected-occurrence count',()=>{
  const wb=workbook([
    record('MR:1',{Date:'2026-09-01',Facilitator:'J. Zanco'}),
    record('MR:2',{Date:'2026-09-02',Presenter:'J. Zanco'}),
    record('MR:3',{Date:'2026-09-03','Scribe / teaching points sign-ups':'Scribe: J. Zanco'}),
    record('MR:4',{Date:'2026-09-04',Facilitator:'Chris Conway'})
  ]);
  const baseResult=compile(wb,registry,options);
  assert.equal(baseResult.audit.resolvedTokens,1);
  assert.equal(baseResult.audit.unresolvedTokens,3);
  const aliases={
    schemaVersion:1,
    decisions:[
      {id:'dec-glob-jz',type:'global',status:'accepted',raw:'J. Zanco',personId:registry.identities[0].id}
    ]
  };
  const candidateResult=compile(wb,registry,{...options,aliases,aliasHash:'jz-hash'});
  assert.equal(candidateResult.audit.resolvedTokens,4);
  assert.equal(candidateResult.audit.unresolvedTokens,0);
  assert.equal(candidateResult.audit.uniqueAssignments,4);
  const p1=candidateResult.people[registry.identities[0].id];
  assert.equal(p1.entries.length,3);
  assert.deepEqual(candidateResult.decisionIds,['dec-glob-jz']);
  const diff=diffLedgers(baseResult,candidateResult);
  assert.equal(diff.newlyAttributed.length,3);
  assert.equal(diff.summary.resolvedTokens.delta,3);
  assert.equal(diff.summary.unresolvedTokens.delta,-3);
});
test('token-accounting totals remain balanced across all resolution types',()=>{
  const wb=workbook([
    record('MR:1',{Notes:'Cancelled',Facilitator:'Julia Z'}),
    record('MR:2',{Facilitator:'TBD'}),
    record('MR:3',{Facilitator:'Julia Z (backup)'}),
    record('MR:4',{Facilitator:'Julia Z'}),
    record('MR:5',{Facilitator:'J. Zanco'}),
    record('MR:6',{Facilitator:'Julia'}),
    record('MR:7',{Facilitator:'Unknown Guest'})
  ]);
  const aliases={
    schemaVersion:1,
    decisions:[
      {id:'dec-occ',type:'occurrence',status:'accepted',sessionId:'MR:6',role:'facilitator',raw:'Julia',personId:registry.identities[0].id},
      {id:'dec-glob',type:'global',status:'accepted',raw:'J. Zanco',personId:registry.identities[0].id}
    ]
  };
  const result=compile(wb,registry,{...options,aliases,aliasHash:'bal-hash'});
  assert.equal(result.audit.tokenCount,7);
  assert.equal(result.audit.excludedTokens,1);
  assert.equal(result.audit.placeholderTokens,1);
  assert.equal(result.audit.resolvedTokens,3);
  assert.equal(result.audit.unresolvedTokens,2);
  assert.equal(result.audit.tokenCount,result.audit.resolvedTokens+result.audit.unresolvedTokens+result.audit.placeholderTokens+result.audit.excludedTokens);
  assert.equal(result.audit.uniqueAssignments,result.audit.resolvedTokens-result.audit.duplicateTokens);
});
test('same-day sessions remain separate with alias resolution',()=>{
  const r=record('MR:1',{Date:'2026-09-01',Facilitator:'J. Zanco'});
  const aliases={
    schemaVersion:1,
    decisions:[{id:'dec-jz',type:'global',status:'accepted',raw:'J. Zanco',personId:registry.identities[0].id}]
  };
  const result=compile(workbook([r]),registry,{
    ...options,
    aliases,
    aliasHash:'sd-hash',
    splitMorningReport:rec=>[1,2].map(n=>({...rec,id:rec.id+'::session:'+n}))
  });
  const personEntries=result.people[registry.identities[0].id].entries;
  assert.equal(personEntries.length,2);
  const sessionIds=personEntries.map(e=>e.sessionId).sort();
  assert.deepEqual(sessionIds,['MR:1::session:1','MR:1::session:2']);
  assert.equal(personEntries[0].date,'2026-09-01');
  assert.equal(personEntries[1].date,'2026-09-01');
  assert.equal(result.audit.uniqueAssignments,2);
});
test('changing aliases does not change source/session identity or unrelated assignments',()=>{
  const wb=workbook([
    record('MR:1',{Date:'2026-09-01',Facilitator:'Julia Z'}),
    record('MR:2',{Date:'2026-09-02',Presenter:'Chris Conway'}),
    record('MR:3',{Date:'2026-09-03','Scribe / teaching points sign-ups':'Scribe: Julia'})
  ]);
  const baseLedger=compile(wb,registry,options);
  const aliases={
    schemaVersion:1,
    decisions:[
      {id:'dec-mr3',type:'occurrence',status:'accepted',sessionId:'MR:3',role:'scribe',raw:'Julia',personId:registry.identities[0].id}
    ]
  };
  const candidateLedger=compile(wb,registry,{...options,aliases,aliasHash:'test-hash'});
  assert.deepEqual(baseLedger.rows,candidateLedger.rows);
  assert.deepEqual(baseLedger.people[registry.identities[2].id],candidateLedger.people[registry.identities[2].id]);
  const diff=diffLedgers(baseLedger,candidateLedger);
  assert.equal(diff.removedOrReassigned.length,0);
  assert.equal(diff.newlyAttributed.length,1);
  assert.equal(diff.newlyAttributed[0].personId,registry.identities[0].id);
  assert.equal(diff.newlyAttributed[0].sessionId,'MR:3');
});
test('identity decisions do not override cancellation, boundary ambiguity, or conditionals',()=>{
  const wb=workbook([
    record('MR:1',{Notes:'Cancelled',Facilitator:'J. Zanco'}),
    record('MR:2',{Facilitator:'J. Zanco (backup)'}),
    record('MR:3',{Facilitator:'J. Zanco'})
  ]);
  const aliases={
    schemaVersion:1,
    decisions:[{id:'dec-jz',type:'global',status:'accepted',raw:'J. Zanco',personId:registry.identities[0].id}]
  };
  const result=compile(wb,registry,{
    ...options,
    aliases,
    aliasHash:'guard-hash',
    splitMorningReport:r=>r.id==='MR:3'?[{...r,session:{unassignedFields:{Facilitator:'J. Zanco'}}}] : [r]
  });
  assert.equal(Object.keys(result.people).length,0,'No assignments should be granted');
  assert.equal(result.audit.excludedTokens,1);
  assert.equal(result.audit.unresolvedTokens,2);
  assert.ok(result.exclusions.some(e=>e.reason==='cancellation-or-strikethrough'));
  assert.ok(result.unresolved.some(u=>u.reason==='conditional-assignment'));
  assert.ok(result.unresolved.some(u=>u.reason==='unassigned-session-field'));
});
