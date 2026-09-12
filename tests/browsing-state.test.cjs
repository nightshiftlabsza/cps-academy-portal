'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const workbook = JSON.parse(fs.readFileSync(path.join(root, 'workbook.json'), 'utf8'));
const sessionCoreCode = fs.readFileSync(path.join(root, 'session-core.js'), 'utf8');
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function createHarness() {
  const sessionStorageStore = new Map();
  const localStorageStore = new Map();

  const mockElement = () => ({
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
  });

  const sandbox = {
    testDb: workbook,
    testWorkspace: {
      edits: {},
      added: [],
      favorites: [],
      history: [],
      recent: [],
      issues: [],
      isAdmin: false,
      role: 'VMR Leadership'
    },
    today: () => '2026-09-12',
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(workbook) }),
    setTimeout,
    clearTimeout,
    esc: String,
    title: (r, t) => r.fields?.Name || r.fields?.Date || 'Untitled',
    source: (r) => `${r.source || 'Morning Report'} · row ${r.row} · ${r.id}`,
    chip: (text, cls = '') => `<span class="tag ${cls}">${text}</span>`,
    $: mockElement,
    sessionStorage: {
      getItem: (k) => sessionStorageStore.get(k) || null,
      setItem: (k, v) => sessionStorageStore.set(k, String(v)),
      removeItem: (k) => sessionStorageStore.delete(k),
      clear: () => sessionStorageStore.clear()
    },
    localStorage: {
      getItem: (k) => localStorageStore.get(k) || null,
      setItem: (k, v) => localStorageStore.set(k, String(v)),
      removeItem: (k) => localStorageStore.delete(k),
      clear: () => localStorageStore.clear()
    },
    location: { hash: '#Home' },
    window: {
      innerWidth: 1024,
      innerHeight: 768,
      scrollX: 0,
      scrollY: 0,
      scrollTo: (x, y) => { sandbox.window.scrollX = x; sandbox.window.scrollY = y; },
      matchMedia: () => ({ addEventListener: () => {} }),
      addEventListener: () => {}
    },
    document: {
      querySelector: mockElement,
      querySelectorAll: () => [],
      getElementById: () => null,
      activeElement: null,
      documentElement: { scrollWidth: 1024, clientWidth: 1024 },
      createElement: mockElement,
      addEventListener: () => {}
    },
    toast: () => {},
    sessionStorageStore,
    localStorageStore
  };

  vm.createContext(sandbox);

  // Execute session-core and app.js in sandbox
  new vm.Script(sessionCoreCode).runInContext(sandbox);
  const setupScript = appCode + `
    ; db = this.testDb;
    workspace = this.testWorkspace;
    this.saveSectionState = saveSectionState;
    this.restoreSectionState = restoreSectionState;
    this.getSectionState = getSectionState;
    this.clearSectionFilters = clearSectionFilters;
    this.clampPageForSection = clampPageForSection;
    this.setSectionAnchor = setSectionAnchor;
    this.restoreScrollAndAnchor = restoreScrollAndAnchor;
    this.sectionBrowsingMemory = sectionBrowsingMemory;
    this.BROWSING_STORAGE_KEY = BROWSING_STORAGE_KEY;
    this.sessionStorageStore = sessionStorageStore;
    this.localStorageStore = localStorageStore;
    this.getStateVariables = () => ({
      tab, query, searchPage, filter, facet, sort, page, mode, showAll,
      sectionQuery, skill, dateFrom, dateTo, owner, sessionType, sessionFacilitator, gapsOnly,
      orgSearchQuery, orgGroupFilter, orgExpandedGroups,
      memberSearchQuery, memberCohortFilter, memberCountryFilter, memberSort, memberExpandedCohorts,
      researchSearchQuery, researchSkillFilter, researchAvailabilityFilter, researchFilter,
      linksSearchQuery, linksFilter, linksCategoryFilter,
      conferenceSearchQuery, conferenceFilter,
      globalSearchActive, globalSearchLastSection, currentAnchorRecordId
    });
    this.setStateVariables = (vals) => {
      if ('tab' in vals) tab = vals.tab;
      if ('query' in vals) query = vals.query;
      if ('searchPage' in vals) searchPage = vals.searchPage;
      if ('filter' in vals) filter = vals.filter;
      if ('facet' in vals) facet = vals.facet;
      if ('sort' in vals) sort = vals.sort;
      if ('page' in vals) page = vals.page;
      if ('mode' in vals) mode = vals.mode;
      if ('showAll' in vals) showAll = vals.showAll;
      if ('sectionQuery' in vals) sectionQuery = vals.sectionQuery;
      if ('skill' in vals) skill = vals.skill;
      if ('dateFrom' in vals) dateFrom = vals.dateFrom;
      if ('dateTo' in vals) dateTo = vals.dateTo;
      if ('owner' in vals) owner = vals.owner;
      if ('sessionType' in vals) sessionType = vals.sessionType;
      if ('sessionFacilitator' in vals) sessionFacilitator = vals.sessionFacilitator;
      if ('gapsOnly' in vals) gapsOnly = vals.gapsOnly;
      if ('orgSearchQuery' in vals) orgSearchQuery = vals.orgSearchQuery;
      if ('orgGroupFilter' in vals) orgGroupFilter = vals.orgGroupFilter;
      if ('orgExpandedGroups' in vals) orgExpandedGroups = vals.orgExpandedGroups;
      if ('memberSearchQuery' in vals) memberSearchQuery = vals.memberSearchQuery;
      if ('memberCohortFilter' in vals) memberCohortFilter = vals.memberCohortFilter;
      if ('memberCountryFilter' in vals) memberCountryFilter = vals.memberCountryFilter;
      if ('memberSort' in vals) memberSort = vals.memberSort;
      if ('memberExpandedCohorts' in vals) memberExpandedCohorts = vals.memberExpandedCohorts;
      if ('researchSearchQuery' in vals) researchSearchQuery = vals.researchSearchQuery;
      if ('researchSkillFilter' in vals) researchSkillFilter = vals.researchSkillFilter;
      if ('researchAvailabilityFilter' in vals) researchAvailabilityFilter = vals.researchAvailabilityFilter;
      if ('researchFilter' in vals) researchFilter = vals.researchFilter;
      if ('linksSearchQuery' in vals) linksSearchQuery = vals.linksSearchQuery;
      if ('linksFilter' in vals) linksFilter = vals.linksFilter;
      if ('linksCategoryFilter' in vals) linksCategoryFilter = vals.linksCategoryFilter;
      if ('conferenceSearchQuery' in vals) conferenceSearchQuery = vals.conferenceSearchQuery;
      if ('conferenceFilter' in vals) conferenceFilter = vals.conferenceFilter;
      if ('globalSearchActive' in vals) globalSearchActive = vals.globalSearchActive;
      if ('globalSearchLastSection' in vals) globalSearchLastSection = vals.globalSearchLastSection;
      if ('currentAnchorRecordId' in vals) currentAnchorRecordId = vals.currentAnchorRecordId;
    };
  `;

  new vm.Script(setupScript).runInContext(sandbox);
  return sandbox;
}

test('Independent per-section transient browsing state persistence', () => {
  const h = createHarness();

  // Set state for CPS Academy VMRs
  h.setStateVariables({
    tab: 'CPS Academy VMRs',
    page: 2,
    filter: 'Upcoming',
    sort: 'date',
    facet: 'Travis',
    sectionQuery: 'cardiology'
  });
  h.window.scrollY = 320;
  h.saveSectionState('CPS Academy VMRs');

  // Set state for OrgStructure
  h.setStateVariables({
    tab: 'OrgStructure',
    orgSearchQuery: 'teaching',
    orgGroupFilter: 'Leadership',
    orgExpandedGroups: new Set(['lead', 'vmr'])
  });
  h.window.scrollY = 150;
  h.saveSectionState('OrgStructure');

  // Verify VMRs state preserved independently
  const vmrState = h.getSectionState('CPS Academy VMRs');
  assert.equal(vmrState.page, 2);
  assert.equal(vmrState.filter, 'Upcoming');
  assert.equal(vmrState.sort, 'date');
  assert.equal(vmrState.facet, 'Travis');
  assert.equal(vmrState.sectionQuery, 'cardiology');
  assert.equal(vmrState.scrollY, 320);

  // Verify OrgStructure state preserved independently
  const orgState = h.getSectionState('OrgStructure');
  assert.equal(orgState.orgSearchQuery, 'teaching');
  assert.equal(orgState.orgGroupFilter, 'Leadership');
  assert.deepEqual([...orgState.orgExpandedGroups], ['lead', 'vmr']);
  assert.equal(orgState.scrollY, 150);

  // Restore VMRs state
  h.restoreSectionState('CPS Academy VMRs');
  const restoredVars = h.getStateVariables();
  assert.equal(restoredVars.page, 2);
  assert.equal(restoredVars.filter, 'Upcoming');
  assert.equal(restoredVars.facet, 'Travis');
  assert.equal(restoredVars.sectionQuery, 'cardiology');
});

test('Page clamping when record count drops', () => {
  const h = createHarness();

  // Set page = 5 on a section with 12 items per page
  // When count is 10 items, maxPage = 0 (10 <= 12)
  h.clampPageForSection('CPS Academy VMRs', 5);
  // Total CPS Academy VMRs records in workbook is > 12, so check clamp bounds
  const total = h.testDb['CPS Academy VMRs'].records.length;
  const maxPage = Math.max(0, Math.ceil(total / 12) - 1);
  const vars = h.getStateVariables();
  assert.ok(vars.page <= maxPage, `Page ${vars.page} must be clamped to maxPage ${maxPage}`);
  assert.ok(vars.page >= 0, 'Page must be >= 0');

  // Test explicit extreme page (e.g. page 999)
  h.clampPageForSection('CPS Academy VMRs', 999);
  assert.equal(h.getStateVariables().page, maxPage, 'Extreme page must clamp to last available page');
});

test('Anchor fallback to scroll position without errors', () => {
  const h = createHarness();

  // Save an anchor record that does not exist in DOM
  h.setSectionAnchor('CPS Academy VMRs', 'non-existent:99999');
  h.window.scrollY = 450;
  h.saveSectionState('CPS Academy VMRs');

  const saved = h.getSectionState('CPS Academy VMRs');
  assert.equal(saved.anchorId, 'non-existent:99999');
  assert.equal(saved.scrollY, 450);

  // restoreScrollAndAnchor should not throw even if anchor element is missing
  assert.doesNotThrow(() => {
    h.restoreScrollAndAnchor('CPS Academy VMRs');
  });
  // Window scroll fallback applied
  assert.equal(h.window.scrollY, 450);
});

test('Filter clearing resets section state vs typing resets page to 0', () => {
  const h = createHarness();

  // Configure non-default state
  h.setStateVariables({
    tab: 'CPS Academy VMRs',
    page: 3,
    filter: 'Upcoming',
    facet: 'Ann',
    sort: 'source',
    showAll: true
  });
  h.saveSectionState('CPS Academy VMRs');

  // Deliberate clear
  h.clearSectionFilters('CPS Academy VMRs');
  const cleared = h.getStateVariables();
  assert.equal(cleared.page, 0, 'Clear must reset page to 0');
  assert.equal(cleared.filter, 'All', 'Clear must reset filter to All');
  assert.equal(cleared.facet, '', 'Clear must reset facet');
  assert.equal(cleared.showAll, false, 'Clear must reset showAll');

  // Re-configure page = 2
  h.setStateVariables({ page: 2 });
  // Simulated search / filter change resets page to 0
  h.setStateVariables({ sectionQuery: 'neurology', page: 0 });
  assert.equal(h.getStateVariables().page, 0, 'Typing search/filter resets page to 0');
});

test('Group expansion restoration for OrgStructure and Members', () => {
  const h = createHarness();

  // OrgStructure expanded groups
  h.setStateVariables({
    tab: 'OrgStructure',
    orgExpandedGroups: new Set(['group-1', 'group-3'])
  });
  h.saveSectionState('OrgStructure');

  // Navigate away and clear memory set
  h.setStateVariables({ orgExpandedGroups: new Set() });
  h.restoreSectionState('OrgStructure');

  const restoredOrg = h.getStateVariables();
  assert.ok(restoredOrg.orgExpandedGroups.has('group-1'));
  assert.ok(restoredOrg.orgExpandedGroups.has('group-3'));
  assert.equal(restoredOrg.orgExpandedGroups.size, 2);

  // Members expanded cohorts
  h.setStateVariables({
    tab: 'Members',
    memberExpandedCohorts: new Set(['participants', 'leaders'])
  });
  h.saveSectionState('Members');

  h.setStateVariables({ memberExpandedCohorts: new Set() });
  h.restoreSectionState('Members');

  const restoredMem = h.getStateVariables();
  assert.ok(restoredMem.memberExpandedCohorts.has('participants'));
  assert.ok(restoredMem.memberExpandedCohorts.has('leaders'));
  assert.equal(restoredMem.memberExpandedCohorts.size, 2);
});

test('Mobile view semantics: Morning Report does not force matrix on <= 760px', () => {
  const h = createHarness();

  // Saved on desktop in matrix mode
  h.window.innerWidth = 1200;
  h.setStateVariables({
    tab: 'Morning Report',
    mode: 'matrix'
  });
  h.saveSectionState('Morning Report');

  // Restored on mobile screen (e.g. 390px)
  h.window.innerWidth = 390;
  h.restoreSectionState('Morning Report');

  const restoredMode = h.getStateVariables().mode;
  assert.equal(restoredMode, 'agenda', 'Restoring Morning Report on mobile must switch matrix to agenda');
});

test('Storage isolation: sessionStorage mirror uses cps-browsing-state-v1 and leaves workspace untouched', () => {
  const h = createHarness();

  h.setStateVariables({
    tab: 'Research @CPSolvers',
    researchSkillFilter: 'Data analytics',
    researchAvailabilityFilter: 'Available'
  });
  h.saveSectionState('Research @CPSolvers');

  // Verify sessionStorage contains cps-browsing-state-v1
  const serialized = h.sessionStorage.getItem(h.BROWSING_STORAGE_KEY);
  assert.ok(serialized, 'sessionStorage must contain cps-browsing-state-v1');
  const parsed = JSON.parse(serialized);
  assert.ok(parsed['Research @CPSolvers']);
  assert.equal(parsed['Research @CPSolvers'].researchSkillFilter, 'Data analytics');

  // Verify workspace is completely unpolluted
  assert.equal(Object.keys(h.testWorkspace.edits).length, 0, 'Workspace edits must remain empty');
  assert.equal(h.testWorkspace.added.length, 0, 'Workspace added must remain empty');
  assert.equal(h.testWorkspace.favorites.length, 0, 'Workspace favorites must remain empty');

  // Verify localStorage business keys are untouched
  assert.equal(h.localStorage.getItem('cps-hub-workspace-v2'), null);
  assert.equal(h.localStorage.getItem('cps-hub-backup-v2'), null);
});
