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
  const { edits = {}, added = [], windowWidth = 1200 } = options;
  const mockEl = () => ({
    dataset: {},
    onclick: null,
    onchange: null,
    value: '',
    checked: false,
    style: {},
    classList: { toggle: () => {}, contains: () => false, add: () => {}, remove: () => {} },
    setAttribute: () => {},
    getAttribute: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    showModal: () => {},
    close: () => {},
    focus: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    remove: () => {},
    removeAttribute: () => {},
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
    Set,
    Map,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(workbook) }),
    db: workbook,
    records: t => {
      const base = workbook[t]?.records || [];
      const withEdits = base.map(r => edits[r.id] ? { ...r, fields: { ...r.fields, ...edits[r.id] } } : r);
      const localAdded = (added || []).filter(a => a.tab === t);
      return [...withEdits, ...localAdded];
    },
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
    document: {
      querySelector: mockEl,
      querySelectorAll: () => [],
      getElementById: mockEl,
      createElement: mockEl,
      addEventListener: () => {}
    },
    window: {
      innerWidth: windowWidth,
      innerHeight: 800,
      addEventListener: () => {},
      matchMedia: () => ({ matches: false, addEventListener: () => {} })
    },
    location: { hash: '#Leader of the Week' }
  };

  sandbox.$ = mockEl;
  sandbox.globalThis = sandbox;
  sandbox.window.document = sandbox.document;

  vm.createContext(sandbox);
  const script = appCode + '\n; db = ' + JSON.stringify(workbook) + ';\n tab = "Leader of the Week";\n' +
    'workspace.added = ' + JSON.stringify(added) + ';\n' +
    'workspace.edits = ' + JSON.stringify(edits) + ';\n';
  vm.runInContext(script, sandbox);
  return sandbox;
}

test('parseLeaderDateRange: identifies yearless MM/DD ranges without guessing year', () => {
  const h = createHarness();
  const res1 = h.parseLeaderDateRange('09/07 - 09/13');
  assert.equal(res1.isYearless, true);
  assert.equal(res1.isExplicit, false);
  assert.equal(res1.start, '');
  assert.equal(res1.end, '');
  assert.equal(res1.raw, '09/07 - 09/13');

  // Space-tolerant format from workbook row 23
  const res2 = h.parseLeaderDateRange('07/13 - 07 /19');
  assert.equal(res2.isYearless, true);
  assert.equal(res2.isExplicit, false);

  // Cross-year yearless range
  const res3 = h.parseLeaderDateRange('12/28 - 01/04');
  assert.equal(res3.isYearless, true);
  assert.equal(res3.isExplicit, false);
});

test('parseLeaderDateRange: validates explicit ISO and 4-digit year ranges', () => {
  const h = createHarness();
  const isoRange = h.parseLeaderDateRange('2026-09-07 - 2026-09-13');
  assert.equal(isoRange.isExplicit, true);
  assert.equal(isoRange.isYearless, false);
  assert.equal(isoRange.start, '2026-09-07');
  assert.equal(isoRange.end, '2026-09-13');

  // Explicit range with 'to' and en-dash
  const toRange = h.parseLeaderDateRange('2026-09-07 to 2026-09-13');
  assert.equal(toRange.isExplicit, true);
  assert.equal(toRange.start, '2026-09-07');

  const dashRange = h.parseLeaderDateRange('2026-09-07 – 2026-09-13');
  assert.equal(dashRange.isExplicit, true);

  // US format with 4-digit years
  const usRange = h.parseLeaderDateRange('09/07/2026 - 09/13/2026');
  assert.equal(usRange.isExplicit, true);
  assert.equal(usRange.start, '2026-09-07');
  assert.equal(usRange.end, '2026-09-13');

  // Cross-year explicit range
  const crossYear = h.parseLeaderDateRange('2025-12-28 - 2026-01-04');
  assert.equal(crossYear.isExplicit, true);
  assert.equal(crossYear.start, '2025-12-28');
  assert.equal(crossYear.end, '2026-01-04');
});

test('parseLeaderDateRange: rejects invalid dates, inverted ranges, and empty inputs', () => {
  const h = createHarness();
  // Impossible date (Feb 30)
  const feb30 = h.parseLeaderDateRange('2026-02-30 - 2026-03-05');
  assert.equal(feb30.isExplicit, false);
  assert.equal(feb30.isInvalid, true);

  // Inverted range (start > end)
  const inverted = h.parseLeaderDateRange('2026-09-15 - 2026-09-10');
  assert.equal(inverted.isExplicit, false);
  assert.equal(inverted.isInvalid, true);

  // Out-of-bounds months
  const badMonth = h.parseLeaderDateRange('13/01 - 13/07');
  assert.equal(badMonth.isExplicit, false);
  assert.equal(badMonth.isInvalid, true);

  // Empty / absent
  assert.equal(h.parseLeaderDateRange('').hasDates, false);
  assert.equal(h.parseLeaderDateRange(null).hasDates, false);
  assert.equal(h.parseLeaderDateRange(undefined).hasDates, false);
});

test('currentLeader: all 32 workbook snapshot records return null across reference dates', () => {
  const h = createHarness();
  const snapshotCount = workbook['Leader of the Week'].records.length;
  assert.equal(snapshotCount, 32, 'Snapshot contains 32 Leader of the Week records');

  // Freeze reference dates
  const refDates = [
    '2026-01-01',
    '2026-01-07',
    '2026-07-15',
    '2026-09-07',
    '2026-09-10',
    '2026-09-13',
    '2026-12-31',
    '2027-01-01'
  ];

  for (const ref of refDates) {
    const leader = h.currentLeader(ref);
    assert.equal(leader, null, `Reference date ${ref} must not match historical yearless data`);
  }
});

test('currentLeader: explicit ranges match on exact boundaries and midpoint, but not outside', () => {
  const explicitRecord = {
    id: 'Leader of the Week:custom1',
    row: 100,
    source: 'Leader of the Week',
    fields: {
      Week: '2nd week of September',
      Dates: '2026-09-07 - 2026-09-13',
      Member: 'Ravi',
      Comments: 'Explicit assignment'
    },
    links: {},
    flags: []
  };

  const h = createHarness({
    added: [{ tab: 'Leader of the Week', ...explicitRecord }]
  });

  // Start boundary
  assert.equal(h.currentLeader('2026-09-07')?.fields.Member, 'Ravi');
  // Midpoint
  assert.equal(h.currentLeader('2026-09-10')?.fields.Member, 'Ravi');
  // End boundary
  assert.equal(h.currentLeader('2026-09-13')?.fields.Member, 'Ravi');

  // Outside boundaries
  assert.equal(h.currentLeader('2026-09-06'), null);
  assert.equal(h.currentLeader('2026-09-14'), null);
});

test('currentLeader: cross-year explicit range correctly spans year boundary', () => {
  const crossYearRecord = {
    id: 'Leader of the Week:cross1',
    row: 101,
    source: 'Leader of the Week',
    fields: {
      Week: 'New Year Week',
      Dates: '2025-12-28 - 2026-01-04',
      Member: 'Rabih',
      Comments: 'Cross year'
    },
    links: {},
    flags: []
  };

  const h = createHarness({
    added: [{ tab: 'Leader of the Week', ...crossYearRecord }]
  });

  assert.equal(h.currentLeader('2025-12-28')?.fields.Member, 'Rabih');
  assert.equal(h.currentLeader('2025-12-31')?.fields.Member, 'Rabih');
  assert.equal(h.currentLeader('2026-01-01')?.fields.Member, 'Rabih');
  assert.equal(h.currentLeader('2026-01-04')?.fields.Member, 'Rabih');
  assert.equal(h.currentLeader('2025-12-27'), null);
  assert.equal(h.currentLeader('2026-01-05'), null);
});

test('UI Presentation: card, table, and details display (Year not specified) for yearless ranges', () => {
  const h = createHarness();
  const sample = workbook['Leader of the Week'].records[0]; // Dates: '12/28 - 01/04'

  // Card view
  const cardHtml = h.card(sample, 'Leader of the Week');
  assert.ok(cardHtml.includes('12/28 - 01/04'), 'Preserves source text verbatim');
  assert.ok(cardHtml.includes('(Year not specified)'), 'Card displays (Year not specified)');

  // Table view (desktop)
  const desktopTable = h.table([sample]);
  assert.ok(desktopTable.includes('12/28 - 01/04'));
  assert.ok(desktopTable.includes('(Year not specified)'), 'Desktop table displays (Year not specified)');

  // Table view (mobile)
  const hMobile = createHarness({ windowWidth: 390 });
  const mobileTable = hMobile.table([sample]);
  assert.ok(mobileTable.includes('12/28 - 01/04'));
  assert.ok(mobileTable.includes('(Year not specified)'), 'Mobile list displays (Year not specified)');

  // Details dialog
  let dialogContent = '';
  h.document.querySelector = selector => {
    if (selector === '#dialog-content') {
      return {
        set innerHTML(html) { dialogContent = html; },
        querySelectorAll: () => []
      };
    }
    return {
      textContent: '',
      setAttribute: () => {},
      style: {},
      showModal: () => {},
      focus: () => {}
    };
  };

  h.viewDetailDialog(sample, 'Leader of the Week');
  assert.ok(dialogContent.includes('12/28 - 01/04'));
  assert.ok(dialogContent.includes('(Year not specified)'), 'Details dialog displays (Year not specified)');
});

test('UI Presentation: explicit date range does not show (Year not specified)', () => {
  const h = createHarness();
  const explicitRecord = {
    id: 'Leader of the Week:explicit1',
    row: 1,
    source: 'Leader of the Week',
    fields: {
      Week: 'Explicit week',
      Dates: '2026-09-07 - 2026-09-13',
      Member: 'Ravi'
    },
    links: {},
    flags: []
  };

  const cardHtml = h.card(explicitRecord, 'Leader of the Week');
  assert.ok(cardHtml.includes('2026-09-07 - 2026-09-13'));
  assert.ok(!cardHtml.includes('(Year not specified)'), 'Explicit range must not display (Year not specified)');
});
