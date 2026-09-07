'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const SessionCore=require('../session-core.js');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
const source=require('../workbook.json')['Morning Report'].records.find(r=>r.row===12);
function harness(edits={}) {
  const context={SessionCore,workspace:{edits,added:[],favorites:[]},db:{'Morning Report':{records:[source]}},esc:String};
  vm.runInNewContext(app.slice(app.indexOf('function sessionRecords'),app.indexOf('function bindCalendarButtons')),context);
  return context;
}
test('saving unrelated fields cannot silently confirm legacy session overrides',()=>{
  const h={};vm.runInNewContext(app.slice(app.indexOf('function changedFields'),app.indexOf('try{const saved=')),h);
  const before={Date:'2026-10-26',Presenter:''};
  const delta=h.changedFields({...before,Presenter:'QA Presenter'},before);
  assert.deepEqual(Object.keys(delta),['Presenter']);
  assert.deepEqual(Object.keys(h.changedFields(before,before,['Date'])),['Date']);
});
test('child session edits are isolated and legacy parent overrides remain reviewable',()=>{
  const parent=source.id,first=parent+'::session:1',second=parent+'::session:2';
  const h=harness({[parent]:{Facilitator:'Legacy ambiguous assignment'},[first]:{Presenter:'QA First'}});
  const children=h.records('Morning Report');
  assert.equal(children[0].fields.Presenter,'QA First');
  assert.notEqual(children[1].fields.Presenter,'QA First');
  assert.equal(children[1].session.legacyOverrides.Facilitator,'Legacy ambiguous assignment');
  assert.notEqual(children[1].fields.Facilitator,'Legacy ambiguous assignment');
  assert.equal(h.workspace.edits[parent].Facilitator,'Legacy ambiguous assignment');
  assert.equal(h.originalRecord(second,'Morning Report').fields.Facilitator,'Alec & Austin');
});
test('aligned legacy edits retain stable child identity and scalar date overrides block export',()=>{
  const h=harness({[source.id]:{Facilitator:'First\n&\nSecond',Date:'2026-12-01'}});
  const children=h.records('Morning Report');
  assert.equal(children[0].fields.Facilitator,'First');
  assert.equal(children[1].fields.Facilitator,'Second');
  assert.equal(children[1].id,source.id+'::session:2');
  assert.match(h.calendarButton(children[1],'Morning Report'),/unavailable/);
});
test('explicit child corrections clear only their own pending overrides',()=>{
  const id=source.id+'::session:2';
  const h=harness({[source.id]:{Date:'2026-12-01',Facilitator:'Ambiguous'},[id]:{Date:'2026-12-02'}});
  const child=h.records('Morning Report')[1];
  assert.equal(child.fields.Date,'2026-12-02');
  assert.equal(child.session.legacyOverrides.Date,undefined);
  assert.equal(child.session.legacyOverrides.Facilitator,'Ambiguous');
  assert.match(h.calendarButton(child,'Morning Report'),/data-calendar/);
});
test('removing a split local draft removes its child edits and pins without harming others',()=>{
  const h=harness(),draft={...source,id:'local:qa',tab:'Morning Report'};
  const child=SessionCore.splitMorningReport(draft)[0];
  const w={added:[draft,{id:'local:other'}],edits:{'local:qa::session:1':{Presenter:'QA'},other:{Presenter:'Keep'}},favorites:['local:qa::session:2','other']};
  h.removeLocalRecord(w,child);
  assert.equal(w.added.length,1);assert.equal(w.added[0].id,'local:other');
  assert.equal(w.edits['local:qa::session:1'],undefined);assert.equal(w.edits.other.Presenter,'Keep');
  assert.deepEqual(w.favorites,['other']);
});
test('local server allows shared logic but denies private ledger and identity files',async()=>{
  const {createServer}=require('../scripts/serve.cjs'),server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base=`http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base+'/session-core.js')).status,200);
    for(const resource of ['/historical-contributions.json','/data/logbook-identities.json','/scripts/compile-logbooks.cjs'])assert.equal((await fetch(base+resource)).status,404);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
