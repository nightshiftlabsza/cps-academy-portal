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
    assert.equal((await fetch(base+'/identity.js')).status,200);
    assert.equal((await fetch(base+'/logbook.js')).status,200);
    for(const resource of ['/historical-contributions.json','/data/logbook-identities.json','/scripts/compile-logbooks.cjs'])assert.equal((await fetch(base+resource)).status,404);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

function claimHarness(initialEdits = {}, initialUser = { id: 'zg', name: 'Zakariyya G' }) {
  let dialogOpened = false;
  const storage = {};
  const mockLocalStorage = {
    getItem: k => storage[k] || null,
    setItem: (k, v) => { storage[k] = String(v); }
  };
  mockLocalStorage.setItem('cps-hub-workspace-v2', JSON.stringify({
    edits: structuredClone(initialEdits),
    added: [],
    favorites: [],
    history: []
  }));

  const ctx = {
    SessionCore,
    Identity: {
      getCurrentUser: () => initialUser,
      getDevelopmentProfile: () => ({ id: 'zg', name: 'Zakariyya G' })
    },
    KEY: 'cps-hub-workspace-v2',
    localStorage: mockLocalStorage,
    workspace: {
      edits: structuredClone(initialEdits),
      added: [],
      favorites: [],
      history: []
    },
    db: { 'Morning Report': { records: [source] } },
    titles: { 'Morning Report': 'Date' },
    title: (r) => r.fields.Date || 'Untitled',
    dateValue: (r) => r.fields.Date || '',
    esc: String,
    $: () => null,
    structuredClone,
    setTimeout,
    clearTimeout,
    render: () => {},
    toast: () => {},
    log: (w, action, r, t) => {
      w.history.unshift({ action, title: r?.fields?.Date || 'Untitled', tab: t, at: new Date().toISOString() });
      w.history = w.history.slice(0, 100);
    },
    openQuickClaim: () => { dialogOpened = true; },
    getDialogOpened: () => dialogOpened
  };

  const code = [
    app.slice(app.indexOf('function save(next)'), app.indexOf('function sessionRecords')),
    app.slice(app.indexOf('function sessionRecords'), app.indexOf('function bindCalendarButtons')),
    app.slice(app.indexOf('function mrGaps'), app.indexOf('function weekKey')),
    app.slice(app.indexOf('let lastClaim'), app.indexOf('function openQuickClaim'))
  ].join('\n;\n');

  vm.runInNewContext(code, ctx);
  return ctx;
}

test('One click claims an empty role without opening a text-input dialog', () => {
  const childId = source.id + '::session:1';
  const h = claimHarness();
  const res = h.claimRole(childId, 'Scribe');

  assert.equal(res.success, true);
  assert.equal(h.getDialogOpened(), false, 'Text input dialog must NOT be opened');
  const edits = h.workspace.edits[childId];
  assert.ok(edits['Scribe / teaching points sign-ups'].includes('Scribe: Zakariyya G'));
  assert.equal(h.workspace.history.length, 1);
});

test('Double-clicking creates one assignment and one history event', () => {
  const childId = source.id + '::session:1';
  const h = claimHarness();

  h.claimRole(childId, 'Teaching Points');
  h.claimRole(childId, 'Teaching Points');

  const historyEvents = h.workspace.history.filter(x => x.action.includes('Claimed Teaching Points'));
  assert.equal(historyEvents.length, 1, 'Double-click must create exactly one history event');
});

test('Claiming one split session leaves its sibling unchanged', () => {
  const firstChild = source.id + '::session:1';
  const secondChild = source.id + '::session:2';
  const h = claimHarness();

  h.claimRole(firstChild, 'Teaching Points');

  assert.ok(h.workspace.edits[firstChild]);
  assert.equal(h.workspace.edits[secondChild], undefined, 'Sibling split session must have no edits applied');
  const records = h.records('Morning Report');
  assert.notEqual(records[0].fields['Scribe / teaching points sign-ups'], records[1].fields['Scribe / teaching points sign-ups']);
});

test('Occupied roles are not overwritten', () => {
  const childId = source.id + '::session:1';
  // Pre-assign Facilitator
  const h = claimHarness({ [childId]: { Facilitator: 'Existing Lead' } });

  const res = h.claimRole(childId, 'Facilitator');
  assert.equal(res.success, false);
  assert.equal(res.reason, 'occupied');
  assert.equal(h.workspace.edits[childId].Facilitator, 'Existing Lead', 'Occupied role must not be overwritten');
});

test('Teaching Points changes preserve Scribe and Presenter', () => {
  const childId = source.id + '::session:1';
  const initialSignups = 'Presenter: Dr. Alice | Scribe: Bob C | TP: ';
  const h = claimHarness({ [childId]: { 'Scribe / teaching points sign-ups': initialSignups } });

  h.claimRole(childId, 'Teaching Points');

  const finalSignups = h.workspace.edits[childId]['Scribe / teaching points sign-ups'];
  assert.ok(finalSignups.includes('Presenter: Dr. Alice'), 'Must preserve Presenter: Dr. Alice');
  assert.ok(finalSignups.includes('Scribe: Bob C'), 'Must preserve Scribe: Bob C');
  assert.ok(finalSignups.includes('TP: Zakariyya G') || finalSignups.includes('Teaching Points: Zakariyya G'), 'Must update TP');
});

test('Undo refuses to overwrite a subsequent edit', () => {
  const childId = source.id + '::session:1';
  const h = claimHarness();

  h.claimRole(childId, 'Facilitator');
  assert.equal(h.workspace.edits[childId].Facilitator, 'Zakariyya G');

  // Simulate a subsequent edit to Facilitator
  h.workspace.edits[childId].Facilitator = 'Subsequent Assigned Person';
  h.localStorage.setItem('cps-hub-workspace-v2', JSON.stringify(h.workspace));

  // Attempt Undo
  const undoResult = h.undoClaim();
  assert.equal(undoResult, false, 'Undo must refuse when field was changed since');
  assert.equal(h.workspace.edits[childId].Facilitator, 'Subsequent Assigned Person', 'Subsequent edit must remain intact');
});

