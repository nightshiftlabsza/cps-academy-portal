'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');

function createHarness() {
  const start = app.indexOf('function getStaffingUrgency(');
  const end = app.indexOf('function weekKey(', start);
  assert(start >= 0 && end > start, 'Staffing helpers present in app.js');

  const workspace = { edits: {}, favorites: [], log: [] };
  let testRecords = [];

  const context = {
    today: () => '2026-09-08',
    SessionCore: require('../session-core.js'),
    dateValue: r => r.fields.Date,
    esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    records: () => testRecords,
    workspace,
    KEY: 'cps-test-key',
    localStorage: { getItem: () => null, setItem: () => {} },
    mutate: (fn, id) => { fn(workspace); return true; },
    log: (w, action, r, tab) => { w.log.push({ action, recordId: r?.id, tab }); },
    render: () => {},
    setRecords: (recs) => { testRecords = recs; }
  };

  vm.runInNewContext(app.slice(app.indexOf('function mrGaps('), start), context);
  vm.runInNewContext(app.slice(start, end), context);
  return context;
}

test('tokenizeStaff splits multi-person strings while strictly preserving parenthetical notes', () => {
  const h = createHarness();

  // Basic ampersand
  assert.deepEqual([...h.tokenizeStaff('Ravi & Kirtan')], ['Ravi', 'Kirtan']);
  assert.deepEqual([...h.tokenizeStaff('Dr. Helen Shi & Aye')], ['Dr. Helen Shi', 'Aye']);

  // Parenthetical note containing delimiters (comma, "friend") must remain 1 intact token
  const withNote = "Kyaw. Thet (Aye's friend, physician from Burma)";
  assert.deepEqual([...h.tokenizeStaff(withNote)], [withNote]);

  // Multiple people where one has parenthetical note
  const mixed = "Dr. Alice & Kyaw. Thet (Aye's friend, physician from Burma) + Bob";
  assert.deepEqual([...h.tokenizeStaff(mixed)], [
    'Dr. Alice',
    "Kyaw. Thet (Aye's friend, physician from Burma)",
    'Bob'
  ]);

  // Multi-delimiters: &, +, /, and, with, w/, comma
  assert.deepEqual([...h.tokenizeStaff('Alice + Bob / Charlie and Dave with Eve w/ Frank, Grace')], [
    'Alice', 'Bob', 'Charlie', 'Dave', 'Eve', 'Frank', 'Grace'
  ]);

  // Empty / placeholder values produce empty array
  for (const emptyVal of ['', '  ', 'tbd', 'TBD', 'none', 'None', 'n/a', '-', '—', null, undefined]) {
    assert.deepEqual([...h.tokenizeStaff(emptyVal)], [], `Should be empty for "${emptyVal}"`);
  }
});

test('renderStaffTokens outputs interactive token buttons, notes, and add button', () => {
  const h = createHarness();
  const tokens = ['Alice', "Kyaw. Thet (Aye's friend)"];
  const html = h.renderStaffTokens(tokens, 'Facilitator', 'session:123');

  assert(html.includes('class="staff-tokens-container"'), 'Container rendered');
  assert(html.includes('data-session-id="session:123"'), 'Session ID on container');
  assert(html.includes('data-token-name="Alice"'), 'Alice token data attribute');
  assert(html.includes('data-token-name="Kyaw. Thet (Aye&#39;s friend)"') || html.includes('data-token-name="Kyaw. Thet (Aye\'s friend)"'), 'Kyaw note token data attribute');
  assert(html.includes('class="staff-token-note"'), 'Note element rendered for parenthetical');
  assert(html.includes('class="staff-add-btn"'), 'Add button rendered');
  assert(html.includes('data-add-role="Facilitator"'), 'Add button has role attribute');
});

test('renderStaffTokens outputs read-only static spans for non-admins', () => {
  const h = createHarness();
  h.isAdmin = () => false;
  const tokens = ['Alice', 'Bob'];
  const html = h.renderStaffTokens(tokens, 'Facilitator', 'session:123');

  assert(html.includes('<span class="staff-token is-readonly-token"'), 'Static span rendered instead of button');
  assert(!html.includes('<button type="button" class="staff-token'), 'No button rendered for token');
  assert(!html.includes('class="staff-add-btn"'), 'No add button rendered for non-admin');
  assert(!html.includes('Click to swap or remove'), 'No swap or remove prompt in title');
});

test('swapStaffToken updates target person, preserves co-staff, and persists to workspace.edits', () => {
  const h = createHarness();
  const session = {
    id: 'session:mr-1',
    tab: 'Morning Report',
    fields: {
      Date: '2026-09-09',
      Facilitator: 'Ravi & Kirtan',
      Presenter: 'Dr. House'
    },
    flags: []
  };
  h.setRecords([session]);

  const res = h.swapStaffToken('session:mr-1', 'Facilitator', 'Ravi', 'Pooja');
  assert.equal(res.success, true);
  assert.deepEqual([...res.newTokens], ['Pooja', 'Kirtan']);
  assert.equal(h.workspace.edits['session:mr-1'].Facilitator, 'Pooja & Kirtan');
  assert.equal(session.fields.Presenter, 'Dr. House', 'Presenter remained untouched');
});

test('removeStaffToken removes person, leaving remaining tokens or opening the slot', () => {
  const h = createHarness();
  const session = {
    id: 'session:mr-2',
    tab: 'Morning Report',
    fields: {
      Date: '2026-09-10',
      Facilitator: 'Ravi & Kirtan'
    },
    flags: []
  };
  h.setRecords([session]);

  // Remove Ravi -> leaves Kirtan
  const res1 = h.removeStaffToken('session:mr-2', 'Facilitator', 'Ravi');
  assert.equal(res1.success, true);
  assert.deepEqual([...res1.newTokens], ['Kirtan']);
  assert.equal(h.workspace.edits['session:mr-2'].Facilitator, 'Kirtan');

  // Update records with current edits and remove Kirtan -> leaves empty (open slot)
  session.fields.Facilitator = 'Kirtan';
  const res2 = h.removeStaffToken('session:mr-2', 'Facilitator', 'Kirtan');
  assert.equal(res2.success, true);
  assert.deepEqual([...res2.newTokens], []);
  assert.equal(h.workspace.edits['session:mr-2'].Facilitator, '');
});

test('addStaffToken appends new person without duplicates', () => {
  const h = createHarness();
  const session = {
    id: 'session:mr-3',
    tab: 'Morning Report',
    fields: {
      Date: '2026-09-11',
      Presenter: 'Ethan'
    },
    flags: []
  };
  h.setRecords([session]);

  const res = h.addStaffToken('session:mr-3', 'Presenter', 'Dr. Helen');
  assert.equal(res.success, true);
  assert.deepEqual([...res.newTokens], ['Ethan', 'Dr. Helen']);
  assert.equal(h.workspace.edits['session:mr-3'].Presenter, 'Ethan & Dr. Helen');

  // Adding already-present person does not duplicate
  const dupRes = h.addStaffToken('session:mr-3', 'Presenter', 'ethan');
  assert.equal(dupRes.success, true);
  assert.deepEqual([...dupRes.newTokens], ['Ethan', 'Dr. Helen']);
});

test('sign-ups isolation: updating Teaching Points preserves Scribe and Presenter', () => {
  const h = createHarness();
  const session = {
    id: 'session:mr-4',
    tab: 'Morning Report',
    fields: {
      Date: '2026-09-12',
      Facilitator: 'Reza',
      'Scribe / teaching points sign-ups': 'Scribe: Dr. Alice | TP: Dr. Bob\nCase Presenter: Dr. Charlie'
    },
    flags: []
  };
  h.setRecords([session]);

  const res = h.swapStaffToken('session:mr-4', 'Teaching Points', 'Dr. Bob', 'Dr. Grace');
  assert.equal(res.success, true);

  const updatedSignups = h.workspace.edits['session:mr-4']['Scribe / teaching points sign-ups'];
  assert(updatedSignups.includes('Dr. Grace'), 'Dr. Grace assigned to TP');
  assert(updatedSignups.includes('Scribe: Dr. Alice'), 'Scribe remains Dr. Alice');
  assert(updatedSignups.includes('Case Presenter: Dr. Charlie'), 'Presenter remains Dr. Charlie');
});
