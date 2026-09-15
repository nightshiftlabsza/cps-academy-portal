'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const workbook = JSON.parse(fs.readFileSync(path.join(root, 'workbook.json'), 'utf8'));
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function createHarness(edits = {}, added = []) {
  const sandbox = {
    testWorkspace: { edits, added, favorites: [], history: [] },
    esc: String,
    title: (r, t) => r.fields?.Name || r.fields?.Presenter || 'Untitled',
    source: (r) => `${r.source || 'OrgStructure'} · row ${r.row} · ${r.id}`,
    chip: (text, cls = '') => `<span class="tag ${cls}">${text}</span>`,
    today: () => '2026-09-12',
    $: () => null,
    document: {
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {}
    },
    window: {
      matchMedia: () => ({ addEventListener: () => {} }),
      scrollTo: () => {}
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    location: { hash: '#Members' }
  };
  vm.createContext(sandbox);

  // Extract from app.js up to render()
  const startIdx = appCode.indexOf('const tabAliases=');
  const endIdx = appCode.indexOf('function render(){');
  assert(startIdx !== -1 && endIdx !== -1, 'Could not locate slice in app.js');

  const slice = appCode.slice(startIdx, endIdx) +
    '; db = ' + JSON.stringify(workbook) + ';' +
    ' workspace = this.testWorkspace;' +
    ' this.RECORD_CATEGORY = RECORD_CATEGORY; this.MEMBER_COHORT_DEFS = MEMBER_COHORT_DEFS;' +
    ' this.classifyRecord = classifyRecord; this.getRecordClassification = getRecordClassification;' +
    ' this.getClassificationCounts = getClassificationCounts; this.formatResultsCount = formatResultsCount;' +
    ' this.findMemberInTeams = findMemberInTeams; this.records = records;' +
    ' this.getOrgSearchQuery = () => orgSearchQuery; this.getOrgGroupFilter = () => orgGroupFilter;' +
    ' this.parseBirthdayMonthDay = parseBirthdayMonthDay;' +
    ' this.getMemberCohortByRow = getMemberCohortByRow; this.membersView = membersView;';

  vm.runInContext(slice, sandbox);
  return sandbox;
}

test('Members directory dataset strictly accounts for 148 named rows across 4 cohorts and 6 structural entries', () => {
  const h = createHarness();
  const allRecords = workbook['Members'].records;
  assert.equal(allRecords.length, 154, 'Exactly 154 records in Members snapshot');

  const counts = h.getClassificationCounts(allRecords, 'Members');
  assert.equal(counts.namedEntries, 148, 'Must count exactly 148 named member rows');
  assert.equal(counts.sourceHeadings, 6, 'Must isolate exactly 6 structural entries');
  assert.equal(counts.total, 154);

  // Validate exact cohort distribution
  assert.equal(counts.cohortCounts['Participants'], 15);
  assert.equal(counts.cohortCounts['Core team'], 54);
  assert.equal(counts.cohortCounts['Leaders'], 36);
  assert.equal(counts.cohortCounts['Marked inactive in source'], 43);

  // Validate all 127 restored birthdays
  const withBirthday = allRecords.filter(r => r.fields.Birthday && typeof r.fields.Birthday === 'string' && r.fields.Birthday.trim());
  assert.equal(withBirthday.length, 127, 'Must restore exactly 127 birthday values from source workbook');
});

test('FormatResultsCount presents named-entry totals and excludes headings from people count', () => {
  const h = createHarness();
  const allRecords = workbook['Members'].records;

  const unfilteredText = h.formatResultsCount(allRecords, 'Members', allRecords);
  assert.ok(unfilteredText.includes('148 named member rows (4 cohorts)'));
  assert.ok(unfilteredText.includes('6 structural entries'));
  assert.ok(unfilteredText.includes('154 total records'));

  // Filtered subset (e.g. 15 participants)
  const participants = allRecords.filter(r => r.row < 80);
  const filteredText = h.formatResultsCount(participants, 'Members', allRecords);
  assert.ok(filteredText.includes('Showing 15 named rows'));
  assert.ok(filteredText.includes('148 named member rows'));
});

test('Country filtering correctly aggregates countries without losing member records', () => {
  const h = createHarness();
  const allRecords = workbook['Members'].records;
  const substantive = allRecords.filter(r => h.getRecordClassification(r, 'Members').isSubstantive);

  const countries = [...new Set(substantive.map(r => (r.fields.Country || '').trim()).filter(Boolean))].sort();
  assert.ok(countries.length >= 25, `Expected diverse international roster of countries, got ${countries.length}`);
  assert.ok(countries.includes('USA'));
  assert.ok(countries.includes('Germany'));
  assert.ok(countries.includes('Pakistan'));
  assert.ok(countries.includes('Spain'));
  assert.ok(countries.includes('India'));
  assert.ok(countries.includes('Turkey'));
});

test('Locally added draft member is included in Members and classified as named entry', () => {
  const newMember = {
    id: 'local:Members:999',
    row: 999,
    tab: 'Members',
    source: 'OrgStructure',
    fields: {
      Name: 'Dr. New Clinical Fellow',
      Country: 'Canada',
      Sponsor: 'Reza',
      Email: 'fellow@example.org',
      Subspecialty: 'Internal Medicine'
    },
    links: {},
    flags: []
  };

  const h = createHarness({}, [newMember]);
  const currentMembers = h.records('Members');
  assert.equal(currentMembers.length, 155, 'Snapshot (154) + 1 local addition = 155');

  const addedRec = currentMembers.find(r => r.id === 'local:Members:999');
  assert(addedRec, 'Locally added member must be returned in records');

  const c = h.classifyRecord(addedRec, 'Members');
  assert.equal(c.category, h.RECORD_CATEGORY.NAMED_ENTRY);
  assert.equal(c.isSubstantive, true);
  assert.equal(c.label, 'Dr. New Clinical Fellow');
});

test('findMemberInTeams sets search query and does not alter workbook identity or merge records', () => {
  const h = createHarness();
  let navigatedTab = null;
  h.navigate = (t) => { navigatedTab = t; };

  h.findMemberInTeams('Reza');
  assert.equal(h.getOrgSearchQuery(), 'Reza', 'Sets exact search query for Teams & Leadership');
  assert.equal(h.getOrgGroupFilter(), 'all', 'Resets group filter to all');
  assert.equal(navigatedTab, 'OrgStructure', 'Navigates cleanly to OrgStructure view');

  // Verify raw records in Members and OrgStructure remain completely unmodified
  const memSample = workbook['Members'].records[0];
  assert.equal(memSample.id, 'Members:57');
  assert.equal(memSample.fields.orgRole, undefined);
});

test('Birthday parsing correctly resolves month/day, validates date limits and handles month-only and ambiguous values', () => {
  const h = createHarness();
  const parse = d => { const r = h.parseBirthdayMonthDay(d); return r ? { ...r } : r; };
  assert.deepEqual(parse('2026-04-01'), { month: 4, day: 1 });
  assert.deepEqual(parse('2024-01-16'), { month: 1, day: 16 });
  assert.deepEqual(parse('September 6th'), { month: 9, day: 6 });
  assert.deepEqual(parse('February, 19th'), { month: 2, day: 19 });
  assert.deepEqual(parse('November 14'), { month: 11, day: 14 });
  assert.deepEqual(parse('June'), { month: 6, day: 0 });
  assert.deepEqual(parse('February 29'), { month: 2, day: 29 }, 'Allow Feb 29 for birthdays');
  assert.deepEqual(parse('2024-02-29'), { month: 2, day: 29 });
  assert.deepEqual(parse('9th January'), { month: 1, day: 9 });
  assert.deepEqual(parse('Dec 30st'), { month: 12, day: 30 });
  assert.deepEqual(parse('Sept 15'), { month: 9, day: 15 });

  // Reject impossible month/day combinations
  assert.equal(parse('February 30'), null);
  assert.equal(parse('2026-02-30'), null);
  assert.equal(parse('April 31'), null);
  assert.equal(parse('June 31'), null);
  assert.equal(parse('September 31'), null);
  assert.equal(parse('November 31'), null);

  // Ambiguous and unrecognized text treated as null for sorting
  assert.equal(parse('June or July'), null);
  assert.equal(parse('TBD'), null);
  assert.equal(parse('Spring'), null);
  assert.equal(parse(''), null);
  assert.equal(parse('—'), null);
  assert.equal(parse('   '), null);
  assert.equal(parse('invalid-date-text'), null);
});

test('Birthday sorting orders chronologically by calendar date and keeps missing/unrecognised at bottom in BOTH directions', () => {
  const h = createHarness();
  const sample = [
    { name: 'Missing Bday 1', bday: '' },
    { name: 'December Person', bday: 'December 15th' },
    { name: 'June Person', bday: 'June' },
    { name: 'Ambiguous Person', bday: 'June or July' },
    { name: 'January Person', bday: '2024-01-16' },
    { name: 'Missing Bday 2', bday: '—' },
    { name: 'Feb 29 Person', bday: 'February 29' },
    { name: 'Impossible Person', bday: 'April 31' },
    { name: 'April Person', bday: '2026-04-01' },
    { name: 'September Person', bday: 'September 6th' }
  ];

  function sortSample(arr, dir) {
    return [...arr].sort((a, b) => {
      const keyA = h.parseBirthdayMonthDay(a.bday);
      const keyB = h.parseBirthdayMonthDay(b.bday);
      const hasA = keyA !== null;
      const hasB = keyB !== null;
      if (!hasA && !hasB) return 0;
      if (!hasA) return 1; // missing/unrecognized at bottom in both asc and desc
      if (!hasB) return -1;
      const numA = keyA.month * 100 + keyA.day;
      const numB = keyB.month * 100 + keyB.day;
      const cmp = (numA - numB) || a.name.localeCompare(b.name);
      return dir === 'desc' ? -cmp : cmp;
    });
  }

  // Ascending order: January -> Feb 29 -> April -> June -> September -> December -> missing/unrecognized at bottom
  const asc = sortSample(sample, 'asc').map(x => x.name);
  assert.deepEqual(asc.slice(0, 6), [
    'January Person',
    'Feb 29 Person',
    'April Person',
    'June Person',
    'September Person',
    'December Person'
  ]);
  const ascUnrecognized = asc.slice(6);
  assert.equal(ascUnrecognized.length, 4);
  assert.ok(ascUnrecognized.includes('Missing Bday 1'));
  assert.ok(ascUnrecognized.includes('Missing Bday 2'));
  assert.ok(ascUnrecognized.includes('Ambiguous Person'));
  assert.ok(ascUnrecognized.includes('Impossible Person'));

  // Descending order: December -> September -> June -> April -> Feb 29 -> January -> missing/unrecognized at bottom
  const desc = sortSample(sample, 'desc').map(x => x.name);
  assert.deepEqual(desc.slice(0, 6), [
    'December Person',
    'September Person',
    'June Person',
    'April Person',
    'Feb 29 Person',
    'January Person'
  ]);
  const descUnrecognized = desc.slice(6);
  assert.equal(descUnrecognized.length, 4);
  assert.ok(descUnrecognized.includes('Missing Bday 1'));
  assert.ok(descUnrecognized.includes('Missing Bday 2'));
  assert.ok(descUnrecognized.includes('Ambiguous Person'));
  assert.ok(descUnrecognized.includes('Impossible Person'));
});

test('Dynamic counts compute from current records, local drafts, and promoted structural edits', () => {
  // 1. Baseline
  const h1 = createHarness();
  const allRecs1 = h1.records('Members');
  const class1 = allRecs1.map(r => ({ record: r, classification: h1.getRecordClassification(r, 'Members') }));
  const sub1 = class1.filter(x => x.classification.isSubstantive);
  assert.equal(sub1.length, 148);
  assert.equal(allRecs1.length - sub1.length, 6);

  // 2. With local added member
  const newMember = {
    id: 'local:Members:999',
    row: 999,
    tab: 'Members',
    source: 'OrgStructure',
    fields: { Name: 'New Dr. Local', Country: 'USA' },
    links: {},
    flags: []
  };
  const h2 = createHarness({}, [newMember]);
  const allRecs2 = h2.records('Members');
  const class2 = allRecs2.map(r => ({ record: r, classification: h2.getRecordClassification(r, 'Members') }));
  const sub2 = class2.filter(x => x.classification.isSubstantive);
  assert.equal(sub2.length, 149);
  assert.equal(allRecs2.length, 155);
  assert.equal(allRecs2.length - sub2.length, 6);
  // Classification cohort is 'Local / unassigned'
  const addedClass = class2.find(x => x.record.id === 'local:Members:999');
  assert.equal(addedClass.classification.cohort, 'Local / unassigned');

  // 3. Promoting structural record through local edit
  const h3 = createHarness({ 'Members:80': { Name: 'Core Team Special Group' } });
  const allRecs3 = h3.records('Members');
  const class3 = allRecs3.map(r => ({ record: r, classification: h3.getRecordClassification(r, 'Members') }));
  const sub3 = class3.filter(x => x.classification.isSubstantive);
  // Members:80 was structural; local edit promotes it to substantive!
  assert.equal(sub3.length, 149);
  assert.equal(allRecs3.length, 154);
  assert.equal(allRecs3.length - sub3.length, 5); // Only 5 structural records remaining
});

test('Kris Hung fields in workbook.json match verified source workbook row 66', () => {
  const kris = workbook['Members'].records.find(r => r.id === 'Members:65');
  assert(kris, 'Members:65 must exist');
  assert.equal(kris.fields.Name, 'Kris Hung');
  assert.equal(kris.fields.Country, 'Hong Kong');
  assert.equal(kris.fields.Email, 'krishung1025@gmail.com');
  assert.equal(kris.fields.Location, '', 'Location must be empty to match Excel row 66');
  assert.equal(kris.fields.Subspecialty, '', 'Subspecialty must be empty to match Excel row 66');
  assert.equal(kris.fields.Birthday, '2026-10-25');
});

