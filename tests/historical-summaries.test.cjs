'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appJsPath = path.resolve(__dirname, '..', 'app.js');
const appJsCode = fs.readFileSync(appJsPath, 'utf8');

function createHarness() {
  const domListeners = {};
  const elements = {};

  function makeElement(id = '', tag = 'div') {
    const el = {
      id,
      tagName: tag.toUpperCase(),
      dataset: {},
      style: {},
      children: [],
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); },
        toggle(c) { if (this._classes.has(c)) this._classes.delete(c); else this._classes.add(c); }
      },
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k] || null; },
      removeAttribute(k) { delete this[k]; },
      hasAttribute(k) { return k in this; },
      focus() {},
      blur() {},
      scrollIntoView() {},
      addEventListener(evt, fn) {
        if (!domListeners[evt]) domListeners[evt] = [];
        domListeners[evt].push(fn);
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      append(...args) { el.children.push(...args); },
      appendChild(c) { el.children.push(c); return c; },
      remove() {},
      after() {},
      dispatchEvent() { return true; },
      reportValidity() { return true; }
    };
    return el;
  }

  const mockDocument = {
    readyState: 'complete',
    addEventListener(evt, fn) {
      if (!domListeners[evt]) domListeners[evt] = [];
      domListeners[evt].push(fn);
    },
    getElementById(id) {
      if (!elements[id]) elements[id] = makeElement(id);
      return elements[id];
    },
    querySelector(sel) {
      if (sel.startsWith('#')) return mockDocument.getElementById(sel.slice(1));
      return makeElement('', 'div');
    },
    querySelectorAll() { return []; },
    createElement(tag) { return makeElement('', tag); },
    body: makeElement('body', 'body'),
    documentElement: { scrollWidth: 1000, clientWidth: 1000 }
  };

  const testDb = {
    'CPS Academy VMRs': {
      columns: ['Date / time (source)', 'Topic', 'Session title', 'Facilitator', 'Recording', 'Meeting info', 'Public flag (source)', 'Bonus learning'],
      records: Array.from({ length: 55 }, (_, i) => ({
        id: `vmr:${i + 1}`,
        flags: [],
        fields: {
          'Date / time (source)': i % 5 === 0 ? 'Undated Archive Notes' : `2025-0${(i % 8) + 1}-15`,
          'Topic': `Clinical Reasoning Case ${i + 1}`,
          'Session title': `VMR Discussion ${i + 1}`,
          'Facilitator': i % 2 === 0 ? 'Travis Smith' : 'Rabih Geha',
          'Recording': i % 3 === 0 ? `https://youtube.com/watch?v=vmr${i}` : '',
          'Meeting info': 'Zoom 12345',
          'Public flag (source)': 'Yes',
          'Bonus learning': 'Schema pearl'
        }
      }))
    },
    'Special VMRs': {
      columns: ['Date', 'Pacific time (source)', 'Eastern time (source)', 'Details', 'Person in charge', 'Facilitator', 'Type'],
      records: Array.from({ length: 30 }, (_, i) => ({
        id: `spec:${i + 1}`,
        flags: [],
        fields: {
          'Date': i % 4 === 0 ? 'TBD Date' : `2024-1${i % 2}-10`,
          'Pacific time (source)': '9:00 AM PT',
          'Eastern time (source)': '12:00 PM ET',
          'Details': `Special Session ${i + 1}`,
          'Person in charge': 'Reza Manesh',
          'Facilitator': 'Kian Mehrabani',
          'Type': 'Symposium'
        }
      }))
    },
    'Student Forum': {
      columns: ['Date', 'Pacific time (source)', 'Eastern time (source)', 'Topic', 'Expert', 'Person in charge', 'Recording', 'Type', 'Meeting info'],
      records: Array.from({ length: 20 }, (_, i) => ({
        id: `forum:${i + 1}`,
        flags: [],
        fields: {
          'Date': `2023-0${(i % 6) + 1}-20`,
          'Pacific time (source)': '10:00 AM PT',
          'Eastern time (source)': '1:00 PM ET',
          'Topic': `Student Case ${i + 1}`,
          'Expert': 'Prof Expert',
          'Person in charge': 'Student Leader',
          'Recording': `https://youtube.com/watch?v=forum${i}`,
          'Type': 'Case review',
          'Meeting info': 'Zoom 999'
        }
      }))
    },
    'CRC': {
      columns: ['Presenter', 'Mentor', 'Status', 'VMR date', 'Email', 'Country', 'Remarks'],
      records: Array.from({ length: 60 }, (_, i) => ({
        id: `crc:${i + 1}`,
        flags: [],
        fields: {
          'Presenter': `Presenter ${i + 1}`,
          'Mentor': `Mentor ${(i % 5) + 1}`,
          'Status': i % 3 === 0 ? 'Presented' : i % 3 === 1 ? 'In progress' : 'Active',
          'VMR date': i % 6 === 0 ? 'Unscheduled' : `2025-0${(i % 5) + 1}-10`,
          'Email': `presenter${i + 1}@example.com`,
          'Country': 'Global',
          'Remarks': 'Confidential note'
        }
      }))
    },
    'Morning Report': { columns: ['Date', 'Facilitator', 'Presenter'], records: [] },
    'Members': { columns: ['Name', 'Cohort', 'Country'], records: [] },
    'OrgStructure': { columns: ['Role', 'Name', 'Group'], records: [] },
    'Research @CPSolvers': { columns: ['Name'], records: [] },
    'Podcast Episodes': { columns: ['Title', 'Status'], records: [] },
    'Schema review': { columns: ['Title', 'Status'], records: [] },
    'Important links': { columns: ['Title', 'URL'], records: [] },
    'Conferences': { columns: ['Name', 'Date'], records: [] },
    'Residency Programs': { columns: ['Program'], records: [] },
    'Leader of the Week': { columns: ['Name'], records: [] },
    'CRC - retired': { columns: ['Presenter'], records: [] }
  };

  const mockSessionStorage = {
    _data: {},
    getItem(k) { return this._data[k] ?? null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
  };

  const mockLocalStorage = {
    _data: {},
    getItem(k) { return this._data[k] ?? null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
  };

  const sandbox = {
    document: mockDocument,
    window: {
      location: { hash: '#CPS%20Academy%20VMRs' },
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: mockDocument.addEventListener,
      matchMedia: () => ({ matches: false, addEventListener: () => {} }),
      scrollTo: () => {}
    },
    sessionStorage: mockSessionStorage,
    localStorage: mockLocalStorage,
    location: { hash: '#CPS%20Academy%20VMRs' },
    fetch: async () => ({ ok: true, json: async () => testDb }),
    setTimeout: () => 1,
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => fn(),
    Event: class Event { constructor(type) { this.type = type; } },
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    console
  };

  sandbox.testDb = testDb;
  vm.createContext(sandbox);
  const setupScript = appJsCode + `
    ; db = this.testDb;
    this.getStateVariables = () => ({ page, yearFilter, filter, tab });
    this.setStateVariables = (vals) => {
      if ('page' in vals) page = vals.page;
      if ('yearFilter' in vals) yearFilter = vals.yearFilter;
      if ('tab' in vals) tab = vals.tab;
    };
  `;
  vm.runInContext(setupScript, sandbox);
  return sandbox;
}

test('HISTORICAL_SUMMARY_CONFIG exists and defines all 4 requested routes', () => {
  const h = createHarness();
  assert.ok(h.HISTORICAL_SUMMARY_CONFIG, 'HISTORICAL_SUMMARY_CONFIG must be defined');

  const routes = ['CPS Academy VMRs', 'Special VMRs', 'Student Forum', 'CRC'];
  for (const r of routes) {
    const config = h.HISTORICAL_SUMMARY_CONFIG[r];
    assert.ok(config, `Config for ${r} must exist`);
    assert.equal(config.pageSize, 25, `${r} must have bounded pageSize of 25`);
    assert.ok(Array.isArray(config.columns), `${r} must define columns array`);
    assert.ok(Array.isArray(config.essentialKeys), `${r} must define essentialKeys array`);
    assert.ok(Array.isArray(config.secondaryKeys), `${r} must define secondaryKeys array`);
  }

  // Verify route specifics
  assert.equal(h.HISTORICAL_SUMMARY_CONFIG['CPS Academy VMRs'].hasDirectRecording, true);
  assert.equal(h.HISTORICAL_SUMMARY_CONFIG['Student Forum'].hasDirectRecording, true);
  assert.equal(h.HISTORICAL_SUMMARY_CONFIG['CRC'].hasDirectRecording, false);
});

test('Recognized years extraction strictly recognizes 4-digit years and never infers missing years', () => {
  const h = createHarness();
  const years = h.getRecognizedYearsForSection('CPS Academy VMRs');
  assert.ok(Array.isArray(years));
  assert.ok(years.includes('2025'), 'Recognized years must include 2025');

  // Verify every returned year is exactly 4 digits
  for (const y of years) {
    assert.match(y, /^\d{4}$/, `Year ${y} must be strictly 4 digits`);
  }

  // Verify that undated strings like "Undated Archive Notes" do not generate false years
  assert.ok(!years.includes('NaN'));
  assert.ok(!years.includes('undefined'));
});

test('Page clamping respects 25 records per page for historical routes', () => {
  const h = createHarness();

  // Test CPS Academy VMRs (55 records -> ceil(55 / 25) = 3 pages -> maxPage = 2)
  h.clampPageForSection('CPS Academy VMRs', 10);
  assert.equal(h.getStateVariables().page, 2, 'Page 10 must clamp to maxPage 2 for 55 records with pageSize 25');

  // Test extreme clamp
  h.clampPageForSection('CPS Academy VMRs', 999);
  assert.equal(h.getStateVariables().page, 2, 'Page 999 must clamp to maxPage 2');

  // Test negative page clamp
  h.clampPageForSection('CPS Academy VMRs', -5);
  assert.equal(h.getStateVariables().page, 0, 'Negative page must clamp to 0');
});

test('renderHistoricalTableRow renders sticky-capable structure with actions', () => {
  const h = createHarness();
  const config = h.HISTORICAL_SUMMARY_CONFIG['CPS Academy VMRs'];
  const record = h.testDb['CPS Academy VMRs'].records[0];

  const rowHtml = h.renderHistoricalTableRow(record, 'CPS Academy VMRs', config);
  assert.ok(rowHtml.includes('class="historical-row'), 'Row must have historical-row class');
  assert.ok(rowHtml.includes(`data-record-id="${record.id}"`), 'Row must have data-record-id');
  assert.ok(rowHtml.includes(`data-open="${record.id}"`), 'Row must include Details button with data-open');
  assert.ok(rowHtml.includes(`data-star="${record.id}"`), 'Row must include star button with data-star');
});

test('renderHistoricalMobileRow outputs concise layout with expandable secondary details', () => {
  const h = createHarness();
  const config = h.HISTORICAL_SUMMARY_CONFIG['CPS Academy VMRs'];
  const record = h.testDb['CPS Academy VMRs'].records[0]; // undated record

  const mobileHtml = h.renderHistoricalMobileRow(record, 'CPS Academy VMRs', config);
  assert.ok(mobileHtml.includes('compact-summary-card'), 'Mobile row must have compact-summary-card class');
  assert.ok(mobileHtml.includes('compact-essential-fields'), 'Mobile row must render compact-essential-fields');
  assert.ok(mobileHtml.includes('<details class="compact-secondary-details">'), 'Mobile row must render expandable secondary details');
  assert.ok(mobileHtml.includes('Meeting info'), 'Secondary details must include Meeting info');
  assert.ok(mobileHtml.includes(`data-open="${record.id}"`), 'Mobile row must have open details button');
  assert.ok(mobileHtml.includes('Uncertain date'), 'Undated record must show Uncertain date badge');
});

test('CRC essential fields prioritize Presenter, Mentor, Status, VMR date and leave remarks in secondary', () => {
  const h = createHarness();
  const config = h.HISTORICAL_SUMMARY_CONFIG['CRC'];
  const record = h.testDb['CRC'].records[0];

  assert.deepEqual([...config.essentialKeys], ['Presenter', 'Mentor', 'Status', 'VMR date']);
  assert.deepEqual([...config.secondaryKeys], ['Email', 'Country', 'Remarks']);

  const rowHtml = h.renderHistoricalTableRow(record, 'CRC', config);
  assert.ok(rowHtml.includes('Presenter 1'));
  assert.ok(rowHtml.includes('Mentor 1'));
  assert.ok(rowHtml.includes('tag')); // status tag
});
