const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const workbook = JSON.parse(fs.readFileSync(path.join(root, 'workbook.json'), 'utf8'));

test('OrgStructure dataset contains exactly 49 snapshot records and all 6 group headings', () => {
  const orgRecords = workbook['OrgStructure'].records;
  assert.equal(orgRecords.length, 49, 'Expected exactly 49 records in snapshot OrgStructure');

  const headingRows = [5, 24, 32, 35, 44, 49];
  const headingLabels = ['VMR', 'Journal', 'Academy', 'Podcasts', 'CPS Operations', 'CPS Website'];

  headingRows.forEach((row, i) => {
    const rec = orgRecords.find(r => r.row === row);
    assert(rec, `Heading row ${row} must exist`);
    assert.equal(rec.fields['Team / responsibility'], headingLabels[i]);
    assert.equal(rec.fields['Members'], '', `Heading row ${row} must have empty members`);
    assert.equal(rec.fields['Role'], '', `Heading row ${row} must have empty role`);
  });
});

test('SLS row 36 contains complete multiline text and all teamlets', () => {
  const rec = workbook['OrgStructure'].records.find(r => r.row === 36);
  assert(rec, 'SLS row 36 must exist');
  assert.equal(rec.id, 'OrgStructure:36');
  assert.equal(rec.fields['Team / responsibility'], 'Spaced Learning Series (SLS)');
  assert(rec.fields['Members'].includes('Jas, Vale, Mukund (audio editor), Elena, Anmol'));
  assert(rec.fields['Members'].includes('None.'));
  assert(rec.fields['Members'].includes('Alec, Mengyu, Parisa, Lera, Ethan'));
  assert(rec.fields['Members'].includes('Austin, Maryana, Oumaima, David, Zakariyya G'));
  assert.equal(rec.fields['Role'], 'Teamlet 1\nTeamlet 2\nTeamlet 3\nTeamlet 4');
});

test('app.js defines ORG_GROUPS with full 49-record coverage and no record loss', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(appCode));

  const sandbox = {};
  vm.createContext(sandbox);
  const slice = appCode.slice(appCode.indexOf('const tabAliases='), appCode.indexOf('const recordSearchCache = new Map();')) +
    '; this.ORG_GROUPS = ORG_GROUPS; this.ORG_HEADING_IDS = ORG_HEADING_IDS; this.tabAliases = tabAliases;';
  vm.runInContext(slice, sandbox);

  assert(sandbox.ORG_GROUPS, 'ORG_GROUPS must be defined in app.js');
  assert.equal(sandbox.ORG_GROUPS.length, 7, 'Must define the 7 primary groups');

  const allMappedIds = new Set();
  const headingIds = new Set();

  for (const group of sandbox.ORG_GROUPS) {
    if (group.headingId) {
      assert(!headingIds.has(group.headingId), `Duplicate heading ID: ${group.headingId}`);
      headingIds.add(group.headingId);
    }
    for (const rid of group.recordIds) {
      assert(!allMappedIds.has(rid), `Duplicate record ID in groups: ${rid}`);
      allMappedIds.add(rid);
    }
  }

  // 43 responsibilities + 6 headings = 49 records
  assert.equal(allMappedIds.size, 43, 'Expected 43 responsibility records mapped');
  assert.equal(headingIds.size, 6, 'Expected 6 group heading IDs mapped');

  const snapshotIds = new Set(workbook['OrgStructure'].records.map(r => r.id));
  assert.equal(snapshotIds.size, 49);

  for (const hid of headingIds) {
    assert(snapshotIds.has(hid), `Heading ${hid} not in snapshot`);
  }
  for (const rid of allMappedIds) {
    assert(snapshotIds.has(rid), `Record ${rid} not in snapshot`);
  }
});

test('VMR group contains Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  const slice = appCode.slice(appCode.indexOf('const tabAliases='), appCode.indexOf('const recordSearchCache = new Map();')) +
    '; this.ORG_GROUPS = ORG_GROUPS;';
  vm.runInContext(slice, sandbox);

  const vmr = sandbox.ORG_GROUPS.find(g => g.id === 'vmr');
  assert(vmr, 'VMR group must exist');
  assert.equal(vmr.headingId, 'OrgStructure:5');

  const orgRecords = workbook['OrgStructure'].records;
  const vmrTitles = vmr.recordIds.map(id => orgRecords.find(r => r.id === id)?.fields['Team / responsibility']);

  assert(vmrTitles.includes('Tuesday VMR'));
  assert(vmrTitles.includes('Wednesday VMR'));
  assert(vmrTitles.includes('Monday VMR'));
  assert(vmrTitles.includes('Thursday VMR'));
  assert(vmrTitles.includes('Friday VMR'));
  assert(vmrTitles.includes('Saturday VMR'));
  assert(vmrTitles.includes('Sunday Fundamentals VMR'));
  assert.equal(vmr.recordIds.length, 18, 'VMR group must have 18 responsibilities');
});

test('Journal group contains all editorial roles in the same group', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  const slice = appCode.slice(appCode.indexOf('const tabAliases='), appCode.indexOf('const recordSearchCache = new Map();')) +
    '; this.ORG_GROUPS = ORG_GROUPS;';
  vm.runInContext(slice, sandbox);

  const journal = sandbox.ORG_GROUPS.find(g => g.id === 'journal');
  assert(journal, 'Journal group must exist');
  assert.equal(journal.headingId, 'OrgStructure:24');

  const orgRecords = workbook['OrgStructure'].records;
  const journalTitles = journal.recordIds.map(id => orgRecords.find(r => r.id === id)?.fields['Team / responsibility']);

  assert(journalTitles.includes('Editor in Chief'));
  assert(journalTitles.includes('Associate Editors'));
  assert(journalTitles.includes('Consulting Editors'));
  assert(journalTitles.includes('Digital Platform and Infrastructure Manager'));
  assert(journalTitles.includes('Managing Editorial Team'));
  assert(journalTitles.includes('Production Editorial Team'));
  assert(journalTitles.includes('Social Media and Communications Editorial Team'));
  assert.equal(journal.recordIds.length, 7, 'Journal group must have 7 responsibilities');
});

test('Search aliases match "teams & leadership", "orgstructure", and member names', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  const slice = appCode.slice(appCode.indexOf('const tabAliases='), appCode.indexOf('const recordSearchCache = new Map();')) +
    '; this.tabAliases = tabAliases;';
  vm.runInContext(slice, sandbox);

  assert(sandbox.tabAliases['OrgStructure'].includes('teams & leadership'));
  assert(sandbox.tabAliases['OrgStructure'].includes('leadership'));
  assert(sandbox.tabAliases['OrgStructure'].includes('orgstructure'));
});

test('renderOrgRow outputs complete multiline text and action buttons', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {
    esc: v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    chip: (s, k) => `<span class="${k}">${s}</span>`,
    source: r => r.source || '',
    workspace: { edits: {}, favorites: [] }
  };
  vm.createContext(sandbox);
  const slice = appCode.slice(appCode.indexOf('function renderOrgRow'), appCode.indexOf('function orgStructureView')) +
    '; this.renderOrgRow = renderOrgRow;';
  vm.runInContext(slice, sandbox);

  const slsRec = workbook['OrgStructure'].records.find(r => r.row === 36);
  const html = sandbox.renderOrgRow(slsRec);

  assert(html.includes('Spaced Learning Series (SLS)'));
  assert(html.includes('data-open="OrgStructure:36"'));
  assert(html.includes('data-star="OrgStructure:36"'));
  assert(html.includes('org-multiline-text'));
  assert(html.includes('Jas, Vale, Mukund (audio editor), Elena, Anmol'));
  assert(html.includes('Teamlet 1'));
  assert(html.includes('Teamlet 4'));
});
