'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const workbook = JSON.parse(fs.readFileSync(path.join(root, 'workbook.json'), 'utf8'));
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function createHarness(edits = {}) {
  const sandbox = {
    workspace: { edits, added: [], favorites: [] },
    db: workbook,
    esc: String,
    title: (r, t) => r.fields?.Name || r.fields?.Presenter || r.fields?.['Residency Programs'] || r.fields?.MENTEE || r.fields?.['Team / responsibility'] || 'Untitled'
  };
  vm.createContext(sandbox);

  const startIdx = appCode.indexOf('const tabAliases=');
  const endIdx = appCode.indexOf('const recordSearchCache = new Map();');
  assert(startIdx !== -1 && endIdx !== -1, 'Could not locate classification slice in app.js');

  const slice = appCode.slice(startIdx, endIdx) +
    '; this.RECORD_CATEGORY = RECORD_CATEGORY; this.CRC_RETIRED_ROUNDS = CRC_RETIRED_ROUNDS;' +
    ' this.MEMBERS_STRUCTURAL_IDS = MEMBERS_STRUCTURAL_IDS; this.RESIDENCY_MONTH_HEADINGS = RESIDENCY_MONTH_HEADINGS;' +
    ' this.classifyRecord = classifyRecord; this.getRecordClassification = getRecordClassification;' +
    ' this.getClassificationCounts = getClassificationCounts; this.formatResultsCount = formatResultsCount;';

  vm.runInContext(slice, sandbox);
  return sandbox;
}

test('Residency: all five month sections are in strict workbook order with exactly one session in October', () => {
  const h = createHarness();
  const records = workbook['Residency Programs'].records;
  assert.equal(records.length, 6, 'Residency snapshot must contain exactly 6 records');

  const expectedMonths = ['October', 'November', 'December', 'January', 'February'];
  const monthHeadings = records.filter(r => h.classifyRecord(r, 'Residency Programs').category === h.RECORD_CATEGORY.SOURCE_HEADING);
  assert.equal(monthHeadings.length, 5, 'Must contain exactly 5 month headings');

  const foundMonths = monthHeadings.map(r => h.classifyRecord(r, 'Residency Programs').month);
  assert.deepEqual(foundMonths, expectedMonths, 'Months must appear in strict workbook order');

  const substantive = records.filter(r => h.classifyRecord(r, 'Residency Programs').isSubstantive);
  assert.equal(substantive.length, 1, 'Must have exactly 1 substantive session in baseline snapshot');

  const session = substantive[0];
  const sessionClass = h.classifyRecord(session, 'Residency Programs');
  assert.equal(sessionClass.month, 'October', 'Populated session must belong to October');
  assert.equal(session.row, 4, 'Session must correspond to source row 4');
});

test('Residency: populated session retains complete date text verbatim without year guessing', () => {
  const h = createHarness();
  const session = workbook['Residency Programs'].records.find(r => r.id === 'Residency Programs:4');
  assert.ok(session, 'Residency Programs:4 must exist');

  const dateText = session.fields['Residency Programs'];
  assert.equal(dateText, 'Saturday, 24th at 12:00 pm EST Allegheny Internal Medicine');
  assert.ok(!dateText.includes('2026') && !dateText.includes('2025'), 'No year must be guessed into original field');
  assert.equal(session.fields.Facilitator, 'Vini');
});

test('Residency: empty month sections have 0 sessions and truthfully indicate no session entered', () => {
  const h = createHarness();
  const records = workbook['Residency Programs'].records;

  const emptyMonths = ['November', 'December', 'January', 'February'];
  for (const m of emptyMonths) {
    const sessionsInMonth = records.filter(r => {
      const c = h.classifyRecord(r, 'Residency Programs');
      return c.isSubstantive && c.month === m;
    });
    assert.equal(sessionsInMonth.length, 0, `${m} must have 0 sessions in snapshot`);
  }
});

test('Residency: month headings are classified as structural and receive 0 calendar actions', () => {
  const h = createHarness();
  const headingIds = ['Residency Programs:3', 'Residency Programs:8', 'Residency Programs:13', 'Residency Programs:17', 'Residency Programs:21'];

  for (const hid of headingIds) {
    const rec = workbook['Residency Programs'].records.find(r => r.id === hid);
    assert.ok(rec);
    const c = h.classifyRecord(rec, 'Residency Programs');
    assert.equal(c.category, h.RECORD_CATEGORY.SOURCE_HEADING);
    assert.equal(c.isStructural, true);
    assert.equal(c.isSubstantive, false);
  }
});

test('Retired CRC: 15 rounds account for 400 cases, 15 headings, and 2 placeholders', () => {
  const h = createHarness();
  const records = workbook['CRC - retired'].records;
  assert.equal(records.length, 417, 'Snapshot must contain 417 records');

  const counts = h.getClassificationCounts(records, 'CRC - retired');
  assert.equal(counts.namedEntries, 400, 'Must have exactly 400 substantive cases');
  assert.equal(counts.sourceHeadings, 15, 'Must have exactly 15 round headings');
  assert.equal(counts.placeholders, 2, 'Must have exactly 2 template placeholders');
  assert.equal(counts.unknowns, 0, 'No unknowns in clean snapshot');

  assert.equal(Object.keys(counts.roundCounts).length, 15, 'All 15 rounds must be represented');
  for (let i = 1; i <= 15; i++) {
    assert.ok(counts.roundCounts[`Round ${i}`] > 0, `Round ${i} must contain cases`);
  }
});

test('Retired CRC: checkbox uncertainty is preserved and unchecked does not mean failed case', () => {
  const records = workbook['CRC - retired'].records;
  const sample = records.find(r => r.id === 'CRC - retired:4');
  assert.ok(sample);

  // In row 4, PRESENTED? is '0' or empty, but case is not a "failed case"
  assert.equal(sample.fields['PRESENTED?'], '0');
  assert.equal(sample.fields['CASE COMPLETE?'], '1');
  assert.equal(sample.fields['ISSUES/CONCERNS'], 'Unresponsive');
  // Raw fields remain intact
  assert.equal(typeof sample.fields['CASE COMPLETE?'], 'string');
});

test('Retired CRC: locally edited placeholder is promoted to substantive case and increases case count', () => {
  const targetId = 'CRC - retired:418';
  const baselineRec = workbook['CRC - retired'].records.find(r => r.id === targetId);

  const hClean = createHarness({});
  assert.equal(hClean.classifyRecord(baselineRec, 'CRC - retired').category, hClean.RECORD_CATEGORY.PLACEHOLDER);

  const hEdited = createHarness({
    [targetId]: {
      MENTEE: 'Dr. Maria Santos',
      'CPSOLVERS MENTOR': 'Dr. Sharmin',
      "PRESENTER'S COUNTRY": 'Brazil',
      'CASE COMPLETE?': '1'
    }
  });

  const c = hEdited.classifyRecord(baselineRec, 'CRC - retired');
  assert.equal(c.category, hEdited.RECORD_CATEGORY.NAMED_ENTRY);
  assert.equal(c.isSubstantive, true);
  assert.equal(c.wasPlaceholder, true);

  const counts = hEdited.getClassificationCounts(workbook['CRC - retired'].records, 'CRC - retired');
  assert.equal(counts.namedEntries, 401, 'Substantive case count must increment to 401');
  assert.equal(counts.placeholders, 1, 'Placeholder count must decrement to 1');
});

test('Phase 4: groups structure renames Sessions to Morning Report, moves CRC, and restricts People', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  const slice = appCode.slice(
    appCode.indexOf('const groups='),
    appCode.indexOf('const recordSearchCache = new Map();')
  ) + '; this.groups = groups; this.sectionLabels = sectionLabels; this.sectionLabel = sectionLabel; this.ORG_GROUPS = ORG_GROUPS;';
  vm.runInContext(slice, sandbox);

  // 1. Morning Report top-level group
  assert.ok(sandbox.groups['Morning Report'], 'Top-level group must be named "Morning Report"');
  assert.equal(sandbox.groups['Sessions'], undefined, '"Sessions" key must no longer exist in groups');
  assert.deepEqual([...sandbox.groups['Morning Report']], [
    'Morning Report',
    'CPS Academy VMRs',
    'Special VMRs',
    'Student Forum',
    'Residency Programs',
    'Leader of the Week',
    'CRC',
    'CRC - retired'
  ], 'Morning Report group must contain all 6 session sections plus active CRC and retired CRC');

  // 2. People group restricted to OrgStructure (first) and Members (second)
  assert.deepEqual([...sandbox.groups['People']], ['OrgStructure', 'Members'], 'People group must contain only OrgStructure (1st) and Members (2nd)');

  // 3. Visible labels
  assert.equal(sandbox.sectionLabel('CRC'), 'Case Review Committee (CRC)');
  assert.equal(sandbox.sectionLabel('CRC - retired'), 'Case Review Committee (CRC) — Retired');
  assert.equal(sandbox.sectionLabel('OrgStructure'), 'Org Structure');

  // 4. Case Review Committee Leadership remains strictly within OrgStructure VMR
  const vmrGroup = sandbox.ORG_GROUPS.find(g => g.id === 'vmr');
  assert.ok(vmrGroup, 'VMR group must exist in ORG_GROUPS');
  assert.ok(vmrGroup.recordIds.includes('OrgStructure:9'), 'OrgStructure:9 (Case Review Committee Leadership) must remain in VMR group');
  const crcLeadershipRec = workbook['OrgStructure'].records.find(r => r.id === 'OrgStructure:9');
  assert.ok(crcLeadershipRec);
  assert.equal(crcLeadershipRec.fields['Team / responsibility'], 'Case Review Committee Leadership');
});

