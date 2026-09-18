'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SessionCore = require('../session-core.js');

const root = path.resolve(__dirname, '..');
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function createMockElement() {
  return {
    onclick: null,
    onchange: null,
    oninput: null,
    value: '',
    checked: false,
    dataset: {},
    style: {},
    classList: { toggle: () => {}, contains: () => false, add: () => {}, remove: () => {} },
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    focus: () => {},
    blur: () => {},
    setSelectionRange: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    reportValidity: () => true,
    showModal: () => {},
    close: () => {},
    remove: () => {},
    append: () => {},
    after: () => {},
    closest: () => null,
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 })
  };
}

function setupTestEnvironment(customWorkspace = {}, customRecords = {}) {
  const context = {
    console,
    Date,
    Math,
    Intl,
    Set,
    Map,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    SessionCore,
    today: () => '2026-09-15',
    staffingDays: (d1, d2 = '2026-09-15') => {
      const p1 = String(d1 || '').slice(0, 10);
      const p2 = String(d2 || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p1) || !/^\d{4}-\d{2}-\d{2}$/.test(p2)) return null;
      const t1 = Date.UTC(parseInt(p1.slice(0, 4)), parseInt(p1.slice(5, 7)) - 1, parseInt(p1.slice(8, 10)));
      const t2 = Date.UTC(parseInt(p2.slice(0, 4)), parseInt(p2.slice(5, 7)) - 1, parseInt(p2.slice(8, 10)));
      return Math.round((t1 - t2) / 86400000);
    },
    recordDate: r => {
      if (!r || !r.fields) return '';
      const raw = r.fields.Date || r.fields['Date / time (source)'] || r.fields.Start || '';
      const m = String(raw).match(/\b(\d{4}-\d{2}-\d{2})\b/);
      return m ? m[1] : '';
    },
    dateValue: r => r?.fields?.Date || '',
    esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    chip: (text, cls = '') => `<span class="tag ${cls}">${text}</span>`,
    urls: (r, field) => r?.fields?.[field] ? [r.fields[field]] : [],
    sessionZoomUrl: r => r?.fields?.Zoom || '',
    title: (r, t) => r?.fields?.['Topic / Case'] || r?.fields?.Date || 'Session',
    mrGaps: () => [],
    staffingSlot: () => '<span>Staff Member</span>',
    getStaffingUrgency: () => 'calm',
    header: (title, sub) => `<header class="page-header"><h1>${title}</h1><p>${sub}</p></header>`,
    banner: () => '',
    currentLeader: () => ({ id: 'recLeader1', fields: { Member: 'Dr. Jane Smith', Week: 'Week 37', Dates: '2026-09-14 - 2026-09-20' } }),
    exportBackup: () => {},
    render: () => {},
    toast: () => {},
    workspace: {
      favorites: [],
      history: [],
      edits: {},
      added: [],
      reporterName: null,
      ...customWorkspace
    },
    Identity: {
      getCurrentUser: () => customWorkspace.currentUser || null,
      getCurrentProfile: () => customWorkspace.currentUser || null,
      subscribe: () => () => {}
    },
    db: {
      'Morning Report': { records: customRecords['Morning Report'] || [] },
      'CPS Academy VMRs': { records: customRecords['CPS Academy VMRs'] || [] },
      'Special VMRs': { records: customRecords['Special VMRs'] || [] },
      'Student Forum': { records: customRecords['Student Forum'] || [] },
      'Members': { records: customRecords['Members'] || [] },
      'Important links': { records: customRecords['Important links'] || [] },
      'Leader of the Week': { records: customRecords['Leader of the Week'] || [] }
    },
    records: tabName => context.db[tabName]?.records || [],
    pageHtml: '',
    location: { hash: '#Home' },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    window: {
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener: () => {},
      matchMedia: () => ({ addEventListener: () => {} })
    },
    document: {
      querySelector: selector => {
        if (selector === '#page') {
          return {
            set innerHTML(val) { context.pageHtml = val; },
            get innerHTML() { return context.pageHtml; }
          };
        }
        return createMockElement();
      },
      querySelectorAll: () => [],
      getElementById: id => {
        if (id === 'page') {
          return {
            set innerHTML(val) { context.pageHtml = val; },
            get innerHTML() { return context.pageHtml; }
          };
        }
        return createMockElement();
      },
      addEventListener: () => {}
    }
  };

  context.window.document = context.document;
  context.globalThis = context;
  context.testDb = context.db;
  context.testWorkspace = context.workspace;
  vm.createContext(context);
  const setupScript = appCode + `
    ; db = this.testDb;
    workspace = { ...workspace, ...this.testWorkspace };
  `;
  vm.runInContext(setupScript, context);
  return context;
}

test('getUserCommitments enforces strictly 7 calendar days boundary (0 <= d <= 6)', () => {
  const user = { name: 'Kirtan Patel', email: 'kirtan@example.com' };
  const testRecords = [
    // Today (d = 0): included
    { id: 'sess-today', fields: { Date: '2026-09-15', Facilitator: 'Kirtan Patel' } },
    // Tomorrow (d = 1): included
    { id: 'sess-day1', fields: { Date: '2026-09-16', Presenter: 'Kirtan Patel' } },
    // 6 days out (d = 6): included (last day of window)
    { id: 'sess-day6', fields: { Date: '2026-09-21', Scribe: 'Kirtan Patel' } },
    // 7 days out (d = 7): EXCLUDED
    { id: 'sess-day7', fields: { Date: '2026-09-22', Facilitator: 'Kirtan Patel' } },
    // Past session (d = -1): EXCLUDED
    { id: 'sess-past', fields: { Date: '2026-09-14', Facilitator: 'Kirtan Patel' } }
  ];

  const env = setupTestEnvironment({ currentUser: user }, { 'Morning Report': testRecords });
  const commitments = env.getUserCommitments(user, 7, { referenceDate: '2026-09-15' });

  assert.equal(commitments.length, 3, 'Only sessions with 0 <= d <= 6 are included');
  assert.equal(commitments[0].sessionId, 'sess-today');
  assert.equal(commitments[1].sessionId, 'sess-day1');
  assert.equal(commitments[2].sessionId, 'sess-day6');
});

test('getUserCommitments groups multiple roles for the same session together', () => {
  const user = { name: 'Kirtan Patel' };
  const sessionWithMultipleRoles = {
    id: 'sess-dual-role',
    fields: {
      Date: '2026-09-16',
      Facilitator: 'Kirtan Patel',
      'Scribe / teaching points sign-ups': 'Scribe: Kirtan Patel | Teaching Points: Alice Chen'
    }
  };

  const env = setupTestEnvironment({ currentUser: user }, { 'Morning Report': [sessionWithMultipleRoles] });
  const commitments = env.getUserCommitments(user, 7, { referenceDate: '2026-09-15' });

  assert.equal(commitments.length, 1, 'Grouped into a single commitment card');
  assert.deepEqual(Array.from(commitments[0].roles), ['Facilitator', 'Scribe'], 'Both roles recorded');
  assert.equal(commitments[0].role, 'Facilitator, Scribe');
});

test('getSessionRoleEntries cleanly separates Active Participant from Discussant', () => {
  const env = setupTestEnvironment();

  // Session with Active Participants
  const sessionActive = {
    fields: {
      'Active participant 1': 'Dr. Participant One',
      'Active participant 2': 'Dr. Participant Two'
    }
  };
  const rolesActive = env.getSessionRoleEntries(sessionActive);
  const activeEntry = rolesActive.find(r => r.role === 'Active Participant');
  const discussantEntry = rolesActive.find(r => r.role === 'Discussant');

  assert.ok(activeEntry, 'Active Participant entry exists');
  assert.match(activeEntry.val, /Dr\. Participant One/);
  assert.equal(discussantEntry, undefined, 'Active participants must not be classified as Discussant');

  // Session with explicit Discussant
  const sessionDiscussant = {
    fields: {
      Discussant: 'Dr. Case Discussant'
    }
  };
  const rolesDiscussant = env.getSessionRoleEntries(sessionDiscussant);
  const disc = rolesDiscussant.find(r => r.role === 'Discussant');
  assert.ok(disc, 'Explicit discussant found');
  assert.equal(disc.val, 'Dr. Case Discussant');
});

test('getUserCommitments excludes cancelled sessions', () => {
  const user = { name: 'Kirtan Patel' };
  const testRecords = [
    { id: 'sess-cancelled-fac', fields: { Date: '2026-09-16', Facilitator: 'Kirtan Patel (Cancelled)' } },
    { id: 'sess-cancelled-notes', fields: { Date: '2026-09-17', Facilitator: 'Kirtan Patel', Notes: 'Canceled session' } },
    { id: 'sess-active', fields: { Date: '2026-09-18', Facilitator: 'Kirtan Patel' } }
  ];

  const env = setupTestEnvironment({ currentUser: user }, { 'Morning Report': testRecords });
  const commitments = env.getUserCommitments(user, 7, { referenceDate: '2026-09-15' });

  assert.equal(commitments.length, 1);
  assert.equal(commitments[0].sessionId, 'sess-active');
});

test('renderMyCommitmentsWidget shows signed-out prompt and quiet empty state appropriately', () => {
  // Signed out
  const envSignedOut = setupTestEnvironment({ currentUser: null });
  const signedOutHtml = envSignedOut.renderMyCommitmentsWidget();
  assert(signedOutHtml.includes('Signed out · Personal schedule'), 'Prompt shown when signed out');
  assert(signedOutHtml.includes('id="commitments-open-prefs-btn"'));

  // Signed in but 0 commitments
  const envEmpty = setupTestEnvironment({ currentUser: { name: 'Dr. No Commitments' } });
  const emptyHtml = envEmpty.renderMyCommitmentsWidget();
  assert(emptyHtml.includes('No scheduled commitments in the next 7 days.'), 'Quiet empty state shown');
  assert(emptyHtml.includes('Your roles · Next 7 days'));
});

test('getBirthdaysToday returns plain-text member names matching today and rejects invalid/month-only dates', () => {
  const members = [
    { fields: { Name: 'Alice Birthday', Birthday: '2026-09-15' } },
    { fields: { Name: 'Bob September', Birthday: 'September 15' } },
    { fields: { Name: 'Charlie Tomorrow', Birthday: 'September 16' } },
    { fields: { Name: 'Month Only Dave', Birthday: 'June' } }, // day is 0, must be rejected
    { fields: { Name: 'Leap Member', Birthday: 'February 29' } }
  ];

  const env = setupTestEnvironment({}, { Members: members });

  // Today = 2026-09-15
  const matches = env.getBirthdaysToday({ referenceDate: '2026-09-15', records: members });
  assert.equal(matches.length, 2);
  const names = matches.map(m => m.fields.Name);
  assert(names.includes('Alice Birthday'));
  assert(names.includes('Bob September'));

  // Render widget has plain-text names and no link cards
  const widgetHtml = env.renderBirthdaysTodayWidget({ referenceDate: '2026-09-15', records: members });
  assert(widgetHtml.includes('Alice Birthday'));
  assert(widgetHtml.includes('Bob September'));
  assert(widgetHtml.includes('Birthdays today'));
  assert(!widgetHtml.includes('<a href'), 'Must be plain-text names only');

  // When 0 matches, widget returns empty string
  const emptyWidget = env.renderBirthdaysTodayWidget({ referenceDate: '2026-01-01', records: members });
  assert.equal(emptyWidget, '', 'Widget is completely hidden when no birthdays today');

  // Leap day on non-leap year (2026-02-28): Leap Member must NOT match on Feb 28
  const feb28Matches = env.getBirthdaysToday({ referenceDate: '2026-02-28', records: members });
  assert.equal(feb28Matches.length, 0, 'Feb 29 birthday must not match on Feb 28 in non-leap year');
});

test('getNextSevenVMRs returns up to 7 upcoming sessions sorted chronologically by date and resolved time', () => {
  const mrSessions = [
    // Past session: excluded
    { id: 'sess-past', fields: { Date: '2026-09-10' } },
    // Cancelled session: excluded
    { id: 'sess-canc', fields: { Date: '2026-09-16', Facilitator: 'Cancelled' } },
    // Same day sessions with different times
    { id: 'sess-late', fields: { Date: '2026-09-16', 'Pacific time (source)': '11:00 AM PT' } },
    { id: 'sess-early', fields: { Date: '2026-09-16', 'Pacific time (source)': '8:00 AM PT' } },
    // Subsequent days
    { id: 'sess-day3', fields: { Date: '2026-09-17' } },
    { id: 'sess-day4', fields: { Date: '2026-09-18' } },
    { id: 'sess-day5', fields: { Date: '2026-09-19' } },
    { id: 'sess-day6', fields: { Date: '2026-09-20' } },
    { id: 'sess-day7', fields: { Date: '2026-09-21' } },
    { id: 'sess-day8', fields: { Date: '2026-09-22' } } // 8th upcoming: should be sliced out
  ];

  const env = setupTestEnvironment({}, { 'Morning Report': mrSessions });
  const next7 = env.getNextSevenVMRs({ referenceDate: '2026-09-15', records: mrSessions });

  assert.equal(next7.length, 7, 'Caps at exactly 7 upcoming sessions');
  // Order on 2026-09-16: early (8:00 AM) before late (11:00 AM)
  assert.equal(next7[0].id, 'sess-early', 'Earlier start time comes first');
  assert.equal(next7[1].id, 'sess-late', 'Later start time comes second');
  assert.equal(next7[6].id, 'sess-day7', '7th session is included');
  assert(!next7.some(s => s.id === 'sess-day8'), '8th session is excluded');
  assert(!next7.some(s => s.id === 'sess-canc'), 'Cancelled session is excluded');
  assert(!next7.some(s => s.id === 'sess-past'), 'Past session is excluded');
});

test('getNextSevenVMRs does not substitute historical sessions when upcoming is empty', () => {
  const onlyPastSessions = [
    { id: 'past-1', fields: { Date: '2026-08-01' } },
    { id: 'past-2', fields: { Date: '2026-08-02' } }
  ];

  const env = setupTestEnvironment({}, { 'Morning Report': onlyPastSessions });
  const next7 = env.getNextSevenVMRs({ referenceDate: '2026-09-15', records: onlyPastSessions });

  assert.equal(next7.length, 0, 'Must never substitute historical sessions when upcoming list is empty');
});

test('Home renders strictly the 5 specified sections in exact order without pinned, recents, or backup panels', () => {
  const user = { name: 'Kirtan Patel' };
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const members = [{ fields: { Name: 'Birthday Doctor', Birthday: todayStr } }];
  const mr = [{ id: 'mr-1', fields: { Date: '2026-09-16', Facilitator: 'Kirtan Patel' } }];
  const links = [{ id: 'link-1', fields: { Resource: 'Google Drive Academy Folder - Schemas', Link: 'https://drive.google.com' } }];
  const leaders = [{ id: 'recLeader1', fields: { Member: 'Dr. Jane Smith', Dates: '2020-01-01 - 2030-12-31', Week: 'Week 37' } }];

  const env = setupTestEnvironment({ currentUser: user, favorites: ['mr-1'], history: [{ action: 'Edit', title: 'Session', tab: 'Morning Report', at: Date.now() }] }, {
    'Morning Report': mr,
    'Members': members,
    'Important links': links,
    'Leader of the Week': leaders
  });

  env.home();
  const html = env.pageHtml;

  // Check 5 sections presence
  const posCommitments = html.indexOf('id="my-commitments-widget"');
  const posBirthdays = html.indexOf('id="birthdays-today-section"');
  const posNext7 = html.indexOf('id="home-next-vmrs"');
  const posLeader = html.indexOf('class="panel leader-banner"');
  const posResources = html.indexOf('id="home-essential-resources"');

  assert.ok(posCommitments !== -1, 'Commitments section present');
  assert.ok(posBirthdays !== -1, 'Birthdays section present');
  assert.ok(posNext7 !== -1, 'Next 7 VMRs section present');
  assert.ok(posLeader !== -1, 'Leader of the Week present');
  assert.ok(posResources !== -1, 'Essential resources present');

  // Verify strict order: 1 -> 2 -> 3 -> 4 -> 5
  assert.ok(posCommitments < posBirthdays, 'Section 1 (Commitments) precedes Section 2 (Birthdays)');
  assert.ok(posBirthdays < posNext7, 'Section 2 (Birthdays) precedes Section 3 (Next 7 VMRs)');
  assert.ok(posNext7 < posLeader, 'Section 3 (Next 7 VMRs) precedes Section 4 (Leader of the Week)');
  assert.ok(posLeader < posResources, 'Section 4 (Leader) precedes Section 5 (Essential Resources)');

  // Verify complete removal of removed sections
  assert(!html.includes('Pinned for quick access'), 'Pinned section must be removed from Home');
  assert(!html.includes('Recently opened records'), 'Recently opened records must be removed from Home');
  assert(!html.includes('Local storage &amp; backup'), 'Backup panel must be removed from Home');
  assert(!html.includes('Recent local changes'), 'Local changes list must be removed from Home');
  assert(!html.includes('home-backup-btn'), 'Home backup button must be removed');
});
