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
    location: { hash: '#Podcast Episodes' }
  };

  sandbox.$ = mockEl;
  sandbox.globalThis = sandbox;
  sandbox.window.document = sandbox.document;

  vm.createContext(sandbox);
  const script = appCode + '\n; db = ' + JSON.stringify(workbook) + ';\n tab = "Podcast Episodes";\n' +
    'workspace.added = ' + JSON.stringify(added) + ';\n' +
    'workspace.edits = ' + JSON.stringify(edits) + ';\n';
  vm.runInContext(script, sandbox);
  return sandbox;
}

test('recordStage: classifies past planned release date as Release date passed, never confirmed Released', () => {
  const h = createHarness();
  const refDate = '2026-09-07';

  const pastEpisode = {
    id: 'Podcast Episodes:10',
    fields: {
      Week: '10',
      Episode: 'ARM: Episode 1',
      'Point person': 'Sharmin',
      'Audio editor': 'Nic',
      'Release date': '2020-11-19'
    }
  };

  const stage = h.recordStage(pastEpisode, 'Podcast Episodes', refDate);
  assert.equal(stage, 'Release date passed', 'Past planned release date must not assert publication');
  assert.notEqual(stage, 'Released', 'Past planned release date must not be labelled Released');
});

test('recordStage: preserves explicit recorded status verbatim without modification', () => {
  const h = createHarness();
  const refDate = '2026-09-07';

  const explicitRec1 = {
    id: 'Podcast Episodes:custom1',
    fields: {
      Episode: 'ARM: Special',
      Status: 'Recording in progress',
      'Release date': '2020-01-01'
    }
  };
  assert.equal(h.recordStage(explicitRec1, 'Podcast Episodes', refDate), 'Recording in progress');

  const explicitRec2 = {
    id: 'Podcast Episodes:custom2',
    fields: {
      Episode: 'WDx 42',
      Status: 'Released',
      'Release date': '2026-10-01'
    }
  };
  assert.equal(h.recordStage(explicitRec2, 'Podcast Episodes', refDate), 'Released');
});

test('recordStage: derives assignment stages for upcoming and undated episodes', () => {
  const h = createHarness();
  const refDate = '2026-09-07';

  const needsEditor = {
    id: 'Podcast Episodes:up1',
    fields: {
      Episode: 'ARM: Upcoming',
      'Release date': '2026-09-20',
      'Point person': 'Sharmin',
      'Audio editor': ''
    }
  };
  assert.equal(h.recordStage(needsEditor, 'Podcast Episodes', refDate), 'Needs Audio Editor');

  const needsPointPerson = {
    id: 'Podcast Episodes:up2',
    fields: {
      Episode: 'ARM: Upcoming 2',
      'Release date': '2026-09-20',
      'Point person': '',
      'Audio editor': 'Zakariyya'
    }
  };
  assert.equal(h.recordStage(needsPointPerson, 'Podcast Episodes', refDate), 'Needs Point Person');

  const inEditing = {
    id: 'Podcast Episodes:up3',
    fields: {
      Episode: 'ARM: Upcoming 3',
      'Release date': '2026-09-20',
      'Point person': 'Sharmin',
      'Audio editor': 'Zakariyya'
    }
  };
  assert.equal(h.recordStage(inEditing, 'Podcast Episodes', refDate), 'In Editing');

  // Undated episode
  const undatedNeedsEditor = {
    id: 'Podcast Episodes:undated1',
    fields: {
      Episode: 'Special Discussion',
      'Release date': '',
      'Point person': 'Sharmin',
      'Audio editor': ''
    }
  };
  assert.equal(h.recordStage(undatedNeedsEditor, 'Podcast Episodes', refDate), 'Needs Audio Editor');
});

test('recordStage: rejects invalid dates from being treated as Release date passed', () => {
  const h = createHarness();
  const refDate = '2026-09-07';

  // Invalid calendar day 2026-02-31
  const invalidDateEp = {
    id: 'Podcast Episodes:inv1',
    fields: {
      Episode: 'ARM: Leap Test',
      'Release date': '2026-02-31',
      'Point person': 'Sharmin',
      'Audio editor': 'Nic'
    }
  };
  assert.notEqual(h.recordStage(invalidDateEp, 'Podcast Episodes', refDate), 'Release date passed');
  assert.equal(h.recordStage(invalidDateEp, 'Podcast Episodes', refDate), 'In Editing');

  // Malformed text date
  const malformedEp = {
    id: 'Podcast Episodes:inv2',
    fields: {
      Episode: 'ARM: Bad Date',
      'Release date': 'September 2026',
      'Point person': '',
      'Audio editor': ''
    }
  };
  assert.notEqual(h.recordStage(malformedEp, 'Podcast Episodes', refDate), 'Release date passed');
  assert.equal(h.recordStage(malformedEp, 'Podcast Episodes', refDate), 'Needs Audio Editor');
});

test('recordStage: behaves consistently across frozen reference date shifts', () => {
  const h = createHarness();
  const ep = {
    id: 'Podcast Episodes:timeline',
    fields: {
      Episode: 'Timeline Test',
      'Release date': '2026-09-15',
      'Point person': 'Sharmin',
      'Audio editor': 'Nic'
    }
  };

  // When reference date is before release date
  assert.equal(h.recordStage(ep, 'Podcast Episodes', '2026-09-10'), 'In Editing');

  // When reference date is on exact release date
  assert.equal(h.recordStage(ep, 'Podcast Episodes', '2026-09-15'), 'Release date passed');

  // When reference date is after release date
  assert.equal(h.recordStage(ep, 'Podcast Episodes', '2026-09-20'), 'Release date passed');
});

test('isPodcastStageInferred & formatPodcastStageBadge: labels inferred assignment stages as (suggested)', () => {
  const h = createHarness();

  const inferredEp = { fields: { 'Point person': 'Sharmin', 'Audio editor': 'Nic' } };
  assert.equal(h.isPodcastStageInferred(inferredEp), true);
  assert.equal(h.formatPodcastStageBadge('In Editing', true), 'In Editing (suggested)');
  assert.equal(h.formatPodcastStageBadge('Needs Audio Editor', true), 'Needs Audio Editor (suggested)');
  assert.equal(h.formatPodcastStageBadge('Needs Point Person', true), 'Needs Point Person (suggested)');
  assert.equal(h.formatPodcastStageBadge('Release date passed', true), 'Release date passed');

  // Explicit status does not receive (suggested)
  const explicitEp = { fields: { Status: 'In Editing' } };
  assert.equal(h.isPodcastStageInferred(explicitEp), false);
  assert.equal(h.formatPodcastStageBadge('In Editing', false), 'In Editing');

  const customEp = { fields: { Status: 'Recorded' } };
  assert.equal(h.isPodcastStageInferred(customEp), false);
  assert.equal(h.formatPodcastStageBadge('Recorded', false), 'Recorded');
});

test('boardStages: uses Release date passed in base workflow stages and includes custom statuses', () => {
  const h = createHarness();
  const stages = h.boardStages([
    { fields: { 'Point person': '', 'Audio editor': '' } },
    { fields: { 'Point person': 'A', 'Audio editor': 'B', 'Release date': '2020-01-01' } },
    { fields: { Status: 'Post-production' } }
  ], 'Podcast Episodes');

  assert.deepEqual([...stages], [
    'Needs Audio Editor',
    'Needs Point Person',
    'In Editing',
    'Post-production',
    'Release date passed'
  ]);
  assert.ok(!stages.includes('Released'), 'Workflow stages must not contain unconfirmed Released');
});

test('UI Presentation: card, tables, queue, and details present neutral status consistently across desktop and mobile', () => {
  const h = createHarness();
  const pastEp = {
    id: 'Podcast Episodes:card1',
    fields: {
      Week: '1',
      Episode: 'ARM: Episode 1',
      'Point person': 'Sharmin',
      'Audio editor': 'Nic',
      'Release date': '2020-11-19'
    },
    flags: []
  };

  // Card view
  const cardHtml = h.card(pastEp, 'Podcast Episodes');
  assert.ok(cardHtml.includes('Release date passed'), 'Card tag displays Release date passed');
  assert.ok(cardHtml.includes('(Release date passed)'), 'Card release date shows passed notice');
  assert.ok(!cardHtml.includes('chip(\'Released\')'), 'Card does not declare confirmed Released');

  // Inferred card
  const upcomingEp = {
    id: 'Podcast Episodes:card2',
    fields: {
      Week: '50',
      Episode: 'WDx: Episode 50',
      'Point person': 'Sharmin',
      'Audio editor': '',
      'Release date': '2028-01-01'
    },
    flags: []
  };
  const upCardHtml = h.card(upcomingEp, 'Podcast Episodes');
  assert.ok(upCardHtml.includes('Needs Audio Editor (suggested)'), 'Inferred stage has (suggested) marker');

  // Desktop Table
  const tableDesktop = h.table([pastEp]);
  assert.ok(tableDesktop.includes('(Release date passed)'), 'Desktop table displays release date passed notice');

  // Mobile Table
  const hMobile = createHarness({ windowWidth: 390 });
  const tableMobile = hMobile.table([pastEp]);
  assert.ok(tableMobile.includes('(Release date passed)'), 'Mobile table displays release date passed notice');
  assert.ok(tableMobile.includes('Release date passed'), 'Mobile table displays stage badge');

  // Queue View
  const queueHtml = h.podcastQueueView([pastEp, upcomingEp]);
  assert.ok(queueHtml.includes('Release date passed'), 'Queue item shows Release date passed badge');
  assert.ok(queueHtml.includes('Needs Audio Editor (suggested)'), 'Queue item shows suggested badge');
  assert.ok(!queueHtml.includes('Published History'), 'Queue view does not assert publication');
});
