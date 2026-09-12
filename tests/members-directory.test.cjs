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
  assert.equal(counts.cohortCounts['Participants'], 14);
  assert.equal(counts.cohortCounts['Core team'], 54);
  assert.equal(counts.cohortCounts['Leaders'], 36);
  assert.equal(counts.cohortCounts['Marked inactive in source'], 44);

  // Ensure no birthday fields are present or inferred
  for (const r of allRecords) {
    assert.equal(r.fields.Birthday, undefined, 'Birthday field must be excluded');
    assert.equal(r.fields.birthdate, undefined, 'Birthdate must be excluded');
  }
});

test('FormatResultsCount presents named-entry totals and excludes headings from people count', () => {
  const h = createHarness();
  const allRecords = workbook['Members'].records;

  const unfilteredText = h.formatResultsCount(allRecords, 'Members', allRecords);
  assert.ok(unfilteredText.includes('148 named member rows (4 cohorts)'));
  assert.ok(unfilteredText.includes('6 structural entries'));
  assert.ok(unfilteredText.includes('154 total records'));

  // Filtered subset (e.g. 14 participants)
  const participants = allRecords.filter(r => r.row < 80);
  const filteredText = h.formatResultsCount(participants, 'Members', allRecords);
  assert.ok(filteredText.includes('Showing 14 named rows'));
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
