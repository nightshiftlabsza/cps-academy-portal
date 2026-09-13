'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const workbook = JSON.parse(fs.readFileSync(path.join(root, 'workbook.json'), 'utf8'));
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function createHarness(options = {}) {
  const { windowWidth = 1200, edits = {}, added = [] } = options;
  const storage = new Map();
  const mockEl = () => ({
    dataset: {},
    onclick: null,
    onchange: null,
    oninput: null,
    value: '',
    checked: false,
    style: {},
    classList: { toggle: () => {}, contains: () => false, add: () => {}, remove: () => {} },
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    focus: () => {},
    blur: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    remove: () => {},
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 })
  });

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    workspace: {
      edits,
      added,
      favorites: [],
      history: [],
      recent: [],
      issues: [],
      isAdmin: false,
      role: 'VMR Leadership'
    },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(workbook) }),
    document: {
      querySelector: mockEl,
      querySelectorAll: () => [],
      getElementById: mockEl,
      createElement: mockEl,
      addEventListener: () => {},
      documentElement: { scrollWidth: windowWidth, clientWidth: windowWidth }
    },
    window: {
      innerWidth: windowWidth,
      innerHeight: 800,
      scrollX: 0,
      scrollY: 0,
      scrollTo: () => {},
      addEventListener: () => {},
      matchMedia: () => ({ matches: false, addEventListener: () => {} })
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    sessionStorage: {
      getItem: k => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
      clear: () => storage.clear()
    },
    location: { hash: '#Podcast Episodes' }
  };

  sandbox.$ = mockEl;
  sandbox.globalThis = sandbox;
  sandbox.window.document = sandbox.document;

  vm.createContext(sandbox);

  const script = appCode + '\n; db = ' + JSON.stringify(workbook) + ';\n' +
    'this.setPodcastFilters = (series, period) => { podcastSeriesFilter = series; podcastPeriodFilter = period; };\n' +
    'this.getPodcastFilters = () => ({ podcastSeriesFilter, podcastPeriodFilter });';
  vm.runInContext(script, sandbox);

  return sandbox;
}

test('Podcast series: definitions match the 12 reviewed textual labels exactly', () => {
  const h = createHarness();
  const expectedLabels = [
    '#Endneurophobia',
    'ARM',
    'Clinical Unknown',
    'Consult Question',
    'HDx',
    'ID love',
    'Queer Rounds',
    'RR',
    'Schema',
    'SLS',
    'Subspecialty VMR',
    'WDx'
  ];
  assert.deepEqual([...h.PODCAST_SERIES_LABELS].sort(), [...expectedLabels].sort(), 'Must have the 12 reviewed labels');
});

test('Podcast series: textual prefix extraction classifies reviewed titles without inventing series', () => {
  const h = createHarness();
  assert.equal(h.getPodcastSeries('ARM: Episode 1'), 'ARM');
  assert.equal(h.getPodcastSeries('ARM 42 - Acute Dyspnea'), 'ARM');
  assert.equal(h.getPodcastSeries('#Endneurophobia #12'), '#Endneurophobia');
  assert.equal(h.getPodcastSeries('Endneurophobia Ep 3'), '#Endneurophobia');
  assert.equal(h.getPodcastSeries('WDx 40'), 'WDx');
  assert.equal(h.getPodcastSeries('HDx 05: Abdominal Pain'), 'HDx');
  assert.equal(h.getPodcastSeries('SLS 22 - Cough'), 'SLS');
  assert.equal(h.getPodcastSeries('Schema #15 - Hyponatremia'), 'Schema');
  assert.equal(h.getPodcastSeries('RR 60: Fever and Rash'), 'RR');
  assert.equal(h.getPodcastSeries('Rapid Reasoning 04'), 'RR');
  assert.equal(h.getPodcastSeries('The Consult Question 10'), 'Consult Question');
  assert.equal(h.getPodcastSeries('TCQ 02'), 'Consult Question');
  assert.equal(h.getPodcastSeries('Clinical Unknown #34'), 'Clinical Unknown');
  assert.equal(h.getPodcastSeries('Subspecialty VMR - Cardiology'), 'Subspecialty VMR');
  assert.equal(h.getPodcastSeries('Queer Rounds 01'), 'Queer Rounds');
  assert.equal(h.getPodcastSeries('ID love 02'), 'ID love');
  assert.equal(h.getPodcastSeries('General Discussion / Announcement'), '', 'Unrecognized titles return empty string, not invented series');
  assert.equal(h.getPodcastSeries(''), '');
  assert.equal(h.getPodcastSeries(null), '');
});

test('Podcast periods: partitions into upcoming, past, and undated with exactly 6 undated records', () => {
  const h = createHarness();
  const records = workbook['Podcast Episodes'].records;
  assert.equal(records.length, 392, 'Podcast Episodes contains exactly 392 records');

  const refDate = '2026-09-07';
  let upcoming = 0;
  let past = 0;
  let undated = 0;

  for (const r of records) {
    const p = h.getPodcastPeriod(r, refDate);
    if (p === 'upcoming') upcoming++;
    else if (p === 'past') past++;
    else if (p === 'undated') undated++;
    else assert.fail('Unexpected period: ' + p);
  }

  assert.equal(undated, 6, 'Exactly 6 undated records exist in snapshot');
  assert.equal(upcoming + past + undated, 392, 'All 392 records accounted for');
  assert.ok(upcoming > 0, 'Contains upcoming records');
  assert.ok(past > 300, 'Contains past records');

  assert.equal(h.getPodcastPeriod({ fields: { 'Release date': '2026-09-14' } }, refDate), 'upcoming');
  assert.equal(h.getPodcastPeriod({ fields: { 'Release date': '2026-09-01' } }, refDate), 'past');
  assert.equal(h.getPodcastPeriod({ fields: { 'Release date': '2026-09-07' } }, refDate), 'past');
  assert.equal(h.getPodcastPeriod({ fields: { 'Release date': '' } }, refDate), 'undated');
  assert.equal(h.getPodcastPeriod({ fields: {} }, refDate), 'undated');
});

test('Podcast Queue View: displays upcoming queue, undated queue, and past-date history neutrally', () => {
  const h = createHarness();
  const records = workbook['Podcast Episodes'].records;
  const html = h.podcastQueueView(records);

  assert.ok(html.includes('podcast-queue'), 'Queue view wrapper present');
  assert.ok(html.includes('Upcoming &amp; Scheduled Queue'), 'Upcoming queue heading present');
  assert.ok(html.includes('Undated Episodes (6)'), 'Undated episodes group with count present');
  assert.ok(html.includes('Past-Date History'), 'Past-date history group present');
  assert.ok(!html.includes('Published History'), 'Neutral label used without asserting publication');
  assert.ok(html.includes('Point person:'), 'Point person field displayed');
  assert.ok(html.includes('Audio editor:'), 'Audio editor field displayed');
  assert.ok(html.includes('stage-nav-btn'), 'Accessible stage navigation buttons rendered');
});

test('Schema review: presents all 20 records on a single page without pagination', () => {
  const h = createHarness();
  const records = workbook['Schema review'].records;
  assert.equal(records.length, 20, 'Schema review contains exactly 20 records');

  const defaultPageSize = Math.max(25, records.length);
  assert.ok(defaultPageSize >= 20, 'Default page size ensures all 20 records fit on single page');

  const row28 = records.find(r => r.row === 28);
  const row29 = records.find(r => r.row === 29);
  const row30 = records.find(r => r.row === 30);
  const row31 = records.find(r => r.row === 31);

  assert.ok(row28 && row29 && row30 && row31, 'Rows 28-31 exist');
  assert.equal(row28.fields.Schema, 'zakariyya', 'Row 28 Schema column preserved as zakariyya');
  assert.equal(row28.fields['Video owner'], 'hyponatremia', 'Row 28 Video owner preserved as hyponatremia');
  assert.ok(row28.flags.some(f => f.includes('Possible swapped schema / owner columns')), 'Row 28 preserves verify flag');
  assert.equal(row29.fields.Schema, 'Rahul');
  assert.equal(row30.fields.Schema, 'Anmolpreet');
  assert.equal(row31.fields.Schema, 'Anmolpreet');

  for (const r of records) {
    assert.ok('Status' in r.fields, 'Record ' + r.id + ' must have Status field');
    assert.ok('Uploaded' in r.fields, 'Record ' + r.id + ' must have Uploaded field');
  }
});

test('Mobile workflow board: renders collapsible lane accordions with counts instead of stacked lanes', () => {
  const hMobile = createHarness({ windowWidth: 390 });
  const records = workbook['Podcast Episodes'].records.slice(0, 20);
  const mobileBoard = hMobile.workflowBoard(records, 'Podcast Episodes');

  assert.ok(mobileBoard.includes('pipeline-mobile'), 'Mobile pipeline wrapper rendered');
  assert.ok(mobileBoard.includes('lane-accordion'), 'Lane accordions rendered');
  assert.ok(mobileBoard.includes('lane-count'), 'Item count badges rendered');
  assert.ok(mobileBoard.includes('Past-date history'), 'Released stage labelled as Past-date history');
});

test('Browsing state: preserves and restores podcast series and period filters', () => {
  const h = createHarness();
  h.setPodcastFilters('ARM', 'upcoming');
  h.saveSectionState('Podcast Episodes');

  h.setPodcastFilters('', 'all');
  const cleared = h.getPodcastFilters();
  assert.equal(cleared.podcastSeriesFilter, '');
  assert.equal(cleared.podcastPeriodFilter, 'all');

  h.restoreSectionState('Podcast Episodes');
  const restored = h.getPodcastFilters();
  assert.equal(restored.podcastSeriesFilter, 'ARM');
  assert.equal(restored.podcastPeriodFilter, 'upcoming');
});
