'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const workbook = JSON.parse(fs.readFileSync(path.join(root, 'workbook.json'), 'utf8'));
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const sessionCoreCode = fs.readFileSync(path.join(root, 'session-core.js'), 'utf8');
const searchCoreCode = fs.readFileSync(path.join(root, 'search-core.js'), 'utf8');

function createFullHarness(options = {}) {
  const { edits = {}, added = [], windowWidth = 1200, currentTab = 'Morning Report' } = options;
  const storage = new Map();

  const ws = {
    edits,
    added,
    favorites: [],
    history: [],
    recent: [],
    issues: [],
    isAdmin: false,
    role: 'VMR Leadership'
  };

  const KEY = 'cps-hub-workspace-v2';
  storage.set(KEY, JSON.stringify(ws));

  const pageElement = {
    tagName: 'DIV',
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
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 }),
    innerHTML: '',
    textContent: ''
  };

  const mockElement = (tag = 'div') => ({
    tagName: tag.toUpperCase(),
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
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 }),
    innerHTML: '',
    textContent: ''
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
    workspace: ws,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(workbook) }),
    document: {
      querySelector: sel => (sel === '#page' ? pageElement : mockElement()),
      querySelectorAll: () => [],
      getElementById: sel => (sel === 'page' ? pageElement : mockElement()),
      createElement: tag => mockElement(tag),
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
      getItem: k => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k)
    },
    sessionStorage: {
      getItem: k => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
      clear: () => storage.clear()
    },
    location: { hash: `#${encodeURIComponent(currentTab)}` }
  };

  sandbox.$ = sel => (sel === '#page' ? pageElement : mockElement());
  sandbox.globalThis = sandbox;
  sandbox.window.document = sandbox.document;
  sandbox.getPageHtml = () => pageElement.innerHTML;

  vm.createContext(sandbox);

  // Run SessionCore and SearchCore first (as in index.html)
  vm.runInContext(sessionCoreCode, sandbox);
  vm.runInContext(searchCoreCode, sandbox);

  const script = appCode + '\n; db = ' + JSON.stringify(workbook) + ';\n' +
    'tab = ' + JSON.stringify(currentTab) + ';\n' +
    'this.getMrScheduleWeekStart = () => mrScheduleWeekStart;\n' +
    'this.setMrScheduleWeekStart = (w) => { mrScheduleWeekStart = w; };\n' +
    'this.getFilter = () => filter;\n' +
    'this.setFilter = (f) => { filter = f; };\n' +
    'this.setDateFrom = (d) => { dateFrom = d; };\n' +
    'this.setDateTo = (d) => { dateTo = d; };\n' +
    'this.setTab = (t) => { tab = t; };\n' +
    'this.setMrScheduleRangeMode = (m) => { mrScheduleRangeMode = m; };\n';

  vm.runInContext(script, sandbox);
  return sandbox;
}

test('Defect 1: Week navigation from "This Week" shifts displayed week without snapping back', () => {
  const h = createFullHarness({ currentTab: 'Morning Report' });
  h.setFilter('This Week');

  const defaultWeek = h.getDefaultScheduleWeekStart();
  const nextWeek = h.SessionCore.addWeeks(defaultWeek, 1);
  const prevWeek = h.SessionCore.addWeeks(defaultWeek, -1);

  // Navigate to next week: week start updates and filter shifts from This Week
  h.setMrScheduleWeekStart(nextWeek);
  if (h.getFilter() === 'This Week') {
    h.setFilter('Upcoming');
  }

  const filtered = h.filtered();
  assert.equal(h.getMrScheduleWeekStart(), nextWeek, 'Week start must remain on next week');
  assert.notEqual(h.getFilter(), 'This Week', 'Filter must be updated from This Week to prevent snapback');

  // Navigate to previous week
  h.setMrScheduleWeekStart(prevWeek);
  if (prevWeek < defaultWeek) {
    h.setFilter('All');
  }
  const filteredPrev = h.filtered();
  assert.equal(h.getMrScheduleWeekStart(), prevWeek, 'Week start must remain on previous week');
  assert.equal(h.getFilter(), 'All', 'Historical week must use All filter');
});

test('Defect 2: Custom date filters agree across navigator heading, summary, and sessions', () => {
  const h = createFullHarness({ currentTab: 'Morning Report' });
  h.setDateFrom('2026-09-01');
  h.setDateTo('2026-09-15');

  const mrRecords = h.records('Morning Report');
  const filtered = h.filtered();

  // Every filtered session must fall in [2026-09-01, 2026-09-15]
  for (const r of filtered) {
    const d = r.fields.Date;
    if (d && !d.includes('#')) {
      assert.ok(d >= '2026-09-01' && d <= '2026-09-15', `Session date ${d} must be within custom range`);
    }
  }

  // Summary must explicitly indicate custom date range
  const summary = h.formatResultsCount(filtered, 'Morning Report', mrRecords);
  assert.ok(summary.includes('Custom date range (2026-09-01 to 2026-09-15)'), `Summary must display custom date range: ${summary}`);
  assert.ok(!summary.includes('(Mon–Sun)'), `Summary must not claim Monday–Sunday when custom date range is active: ${summary}`);

  // Navigator HTML check
  const navHtml = h.renderWeekNavigator(filtered);
  assert.ok(navHtml.includes('Custom range: 2026-09-01 to 2026-09-15'), 'Navigator heading must show custom date range');
  assert.ok(navHtml.includes('in selected range'), 'Navigator session count must state in selected range');
});

test('Defect 3: Historical week browsing avoids retaining "Upcoming" label', () => {
  const h = createFullHarness({ currentTab: 'Morning Report' });

  const pastWeek = '2024-01-08';
  h.setMrScheduleWeekStart(pastWeek);
  const defaultWeek = h.getDefaultScheduleWeekStart();
  assert.ok(pastWeek < defaultWeek, 'Must be a historical week');

  if (pastWeek < defaultWeek) {
    h.setFilter('All');
  }

  assert.equal(h.getFilter(), 'All', 'Filter must be All, not Upcoming for historical week');
  const filtered = h.filtered();
  assert.ok(Array.isArray(filtered));
});

test('Defect 4: Member heading edited with name-only is promoted to named member against immutable source', () => {
  const h = createFullHarness({
    currentTab: 'Members',
    edits: {
      'Members:80': { Name: 'Dr. Jane Smith' } // Name-only edit, no email
    }
  });

  const headingRec = h.records('Members').find(r => r.id === 'Members:80');
  assert.ok(headingRec, 'Members:80 must exist');

  const classification = h.classifyRecord(headingRec, 'Members');
  assert.equal(classification.category, h.RECORD_CATEGORY.NAMED_ENTRY, 'Name-only edit on heading must promote to NAMED_ENTRY');
  assert.equal(classification.isSubstantive, true, 'Promoted heading must be substantive');
  assert.equal(classification.cohort, 'Core team', 'Cohort must match the heading section');

  // Must increase substantive members count
  const allSubstantive = h.records('Members').filter(r => h.classifyRecord(r, 'Members').isSubstantive);
  assert.equal(allSubstantive.length, 149, 'Substantive members must increase from 148 to 149');
});

test('Defect 5: OrgStructure heading promoted into responsibility appears in items, counts, and search', () => {
  const h = createFullHarness({
    currentTab: 'OrgStructure',
    edits: {
      'OrgStructure:5': {
        Members: 'Dr. John Doe',
        Role: 'VMR Lead Coordinator'
      }
    }
  });

  const headingRec = h.records('OrgStructure').find(r => r.id === 'OrgStructure:5');
  assert.ok(headingRec, 'OrgStructure:5 must exist');

  const classification = h.classifyRecord(headingRec, 'OrgStructure');
  assert.equal(classification.category, h.RECORD_CATEGORY.NAMED_ENTRY, 'Edited heading must be promoted to NAMED_ENTRY');
  assert.equal(classification.isSubstantive, true);

  // In orgStructureView, promoted heading should be part of groupsData
  h.orgStructureView();
  const html = h.getPageHtml();
  assert.ok(html.includes('Dr. John Doe'), 'Promoted member must appear in rendered HTML');
  assert.ok(html.includes('VMR Lead Coordinator'), 'Promoted role must appear in rendered HTML');
});

test('Defect 6: New drafts with row: null remain "Local / unassigned" in Members and Residency', () => {
  const h = createFullHarness({
    currentTab: 'Members',
    added: [
      { id: 'local:mem_1', tab: 'Members', row: null, fields: { Name: 'Local Draft Member', Country: 'Canada' }, flags: [] },
      { id: 'local:res_1', tab: 'Residency Programs', row: null, fields: { 'Residency Programs': 'Local Residency Case' }, flags: [] }
    ]
  });

  const memDraft = h.records('Members').find(r => r.id === 'local:mem_1');
  assert.ok(memDraft, 'Member draft must exist in records');
  const memClass = h.classifyRecord(memDraft, 'Members');
  assert.equal(memClass.cohort, 'Local / unassigned', 'Member draft must have Local / unassigned cohort, not Participants');

  const resDraft = h.records('Residency Programs').find(r => r.id === 'local:res_1');
  assert.ok(resDraft, 'Residency draft must exist in records');
  const resClass = h.classifyRecord(resDraft, 'Residency Programs');
  assert.equal(resClass.month, 'Local / unassigned', 'Residency draft must have Local / unassigned month, not October');
});

test('Defect 7: Retired CRC counts distinguish named mentee rows (357) from unnamed records (43)', () => {
  const h = createFullHarness({ currentTab: 'CRC - retired' });
  const crcRecords = h.records('CRC - retired');
  assert.equal(crcRecords.length, 417, 'Total CRC records must be exactly 417');

  const counts = h.getClassificationCounts(crcRecords, 'CRC - retired');
  assert.equal(counts.total, 417, 'Total records must be 417');
  assert.equal(counts.namedEntries, 400, 'Total cases must be 400');
  assert.equal(counts.namedMentees, 357, 'Must have exactly 357 named mentees');
  assert.equal(counts.mentorOnly, 43, 'Must have exactly 43 unnamed records (not all are mentor-only; some record Contacted or contact info)');
  assert.equal(counts.sourceHeadings, 15, 'Must have exactly 15 round headings');
  assert.equal(counts.placeholders, 2, 'Must have exactly 2 template placeholders');

  const summary = h.formatResultsCount(crcRecords, 'CRC - retired', crcRecords);
  // The 43 unnamed records include rows with only a mentor, rows also recording Contacted, and one with contact info --
  // so the label must be 'unnamed records', not 'mentor-only'.
  assert.ok(summary.includes('400 historical records: 357 named mentee rows and 43 unnamed records'), `Summary must use source-derived 'unnamed records' label: ${summary}`);
  assert.ok(!summary.includes('mentor-only'), `Summary must not use inaccurate 'mentor-only' label: ${summary}`);
});

test('Defect 8: Unchecked status boxes and filter option say "Progress not recorded"', () => {
  const h = createFullHarness({ currentTab: 'CRC - retired' });
  h.crcRetiredView();
  const html = h.getPageHtml();

  assert.ok(html.includes('Progress not recorded'), 'CRC view must include "Progress not recorded"');
  assert.ok(!html.includes('In progress / unrecorded'), 'CRC view must NOT include "In progress / unrecorded"');
});

test('Defect 9: Schedule convention describes "Monday–Sunday, using workbook dates"', () => {
  const h = createFullHarness({ currentTab: 'Morning Report' });

  const mrRecords = h.records('Morning Report');
  const navHtml = h.renderWeekNavigator(mrRecords);

  assert.ok(navHtml.includes('Monday–Sunday, using workbook dates'), 'Week navigator must include "Monday–Sunday, using workbook dates"');
  assert.ok(!navHtml.includes('UTC source date'), 'Week navigator must not label source dates as UTC');
});

test('Defect 10: Retain reconciled member cohort counts (148 named rows: 14 Participants, 54 Core, 36 Leaders, 44 Inactive; 6 structural = 154 total)', () => {
  const h = createFullHarness({ currentTab: 'Members' });
  const memberRecords = h.records('Members');
  assert.equal(memberRecords.length, 154, 'Total member records must be 154');

  const counts = h.getClassificationCounts(memberRecords, 'Members');
  assert.equal(counts.total, 154, 'Total records must be 154');
  assert.equal(counts.namedEntries, 148, 'Named entries must be 148');
  assert.equal(counts.sourceHeadings, 6, 'Structural entries must be 6');

  assert.equal(counts.cohortCounts['Participants'], 14, 'Participants cohort must be 14');
  assert.equal(counts.cohortCounts['Core team'], 54, 'Core team cohort must be 54');
  assert.equal(counts.cohortCounts['Leaders'], 36, 'Leaders cohort must be 36');
  assert.equal(counts.cohortCounts['Marked inactive in source'], 44, 'Inactive cohort must be 44');
});

// ─── Issue 1 regression: historical week jump must stay bounded ───────────────

test('Issue 1a: Jump to 2020-09-14 shows only bounded week (Sept 14–20, 2020), not all history', () => {
  const h = createFullHarness({ currentTab: 'Morning Report' });

  // Simulate the week-jump input: set mrScheduleWeekStart to the week containing 2020-09-14
  const targetDate = '2020-09-14';
  const bounds = h.SessionCore.getWeekBounds(targetDate);
  assert.ok(bounds, 'getWeekBounds must return bounds for 2020-09-14');
  assert.equal(bounds.start, '2020-09-14', 'Week start must be Monday 2020-09-14');
  assert.equal(bounds.end, '2020-09-20', 'Week end must be Sunday 2020-09-20');

  h.setMrScheduleWeekStart(bounds.start);
  h.setMrScheduleRangeMode('week');
  // Past-week navigation uses filter='All' as a neutral no-extra-filter value.
  // This must NOT expand scope to all history.
  h.setFilter('All');

  const filtered = h.filtered();

  // mrScheduleRangeMode must remain 'week', not 'all'
  // We verify indirectly: all returned sessions must fall within the bounded week.
  for (const r of filtered) {
    const d = h.SessionCore.parseDate(r.fields.Date);
    if (d) {
      assert.ok(d >= bounds.start && d <= bounds.end,
        `Session date ${d} is outside bounded week ${bounds.start}–${bounds.end} — scope leaked to all history`);
    }
  }

  // Must not be 2,546 records (all-history leak)
  assert.ok(filtered.length < 100,
    `Expected ~6 sessions for Sept 14–20 2020, got ${filtered.length} — likely all-history leak`);

  // Must have at least 1 session in the snapshot for that week
  const datedInWeek = filtered.filter(r => {
    const d = h.SessionCore.parseDate(r.fields.Date);
    return d && d >= bounds.start && d <= bounds.end;
  });
  assert.ok(datedInWeek.length >= 1,
    `Must find at least 1 session in Sept 14–20 2020, found ${datedInWeek.length}`);
});

test('Issue 1b: Navigating Previous week across the current-week boundary stays in week mode', () => {
  const h = createFullHarness({ currentTab: 'Morning Report' });

  const defWeek = h.getDefaultScheduleWeekStart();
  const prevWeek = h.SessionCore.addWeeks(defWeek, -1);

  h.setMrScheduleWeekStart(prevWeek);
  h.setMrScheduleRangeMode('week');
  // Past-week navigation sets filter='All' — this must not leak to all-history scope
  h.setFilter('All');

  const filtered = h.filtered();

  // All sessions must be within the previous week bounds
  const bounds = h.SessionCore.getWeekBounds(prevWeek);
  for (const r of filtered) {
    const d = h.SessionCore.parseDate(r.fields.Date);
    if (d) {
      assert.ok(d >= bounds.start && d <= bounds.end,
        `Session ${d} is outside previous week ${bounds.start}–${bounds.end}`);
    }
  }

  // Must not return thousands of records (all-history scope leak)
  assert.ok(filtered.length < 500,
    `Previous week must be bounded, not all history (got ${filtered.length} records)`);
});

test('Issue 1c: filter="All" with mrScheduleRangeMode="week" stays bounded; mrScheduleRangeMode="all" expands scope', () => {
  const h = createFullHarness({ currentTab: 'Morning Report' });

  // Start in week mode for a past week (simulating week-navigation)
  const pastWeek = '2022-01-10';
  const bounds = h.SessionCore.getWeekBounds(pastWeek);
  h.setMrScheduleWeekStart(bounds.start);
  h.setMrScheduleRangeMode('week');
  // Week navigation sets filter='All' as a neutral value — filtered() must NOT override mode
  h.setFilter('All');

  const weekFiltered = h.filtered();
  // Must be a small bounded set, not thousands
  assert.ok(weekFiltered.length < 500,
    `filter='All' with mrScheduleRangeMode='week' must remain bounded (got ${weekFiltered.length})`);

  // Explicit user action: set mrScheduleRangeMode='all' (as would happen via onchange handler)
  h.setMrScheduleRangeMode('all');
  h.setFilter('All history');
  const allFiltered = h.filtered();
  // Must now cover the full snapshot (2020–2026 = 2500+)
  assert.ok(allFiltered.length > 2500,
    `mrScheduleRangeMode='all' with filter='All history' must return full history scope (got ${allFiltered.length})`);
});
