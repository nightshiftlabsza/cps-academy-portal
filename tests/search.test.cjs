const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'..','workbook.json'),'utf8'));

const tabAliases={
  'Morning Report':'morning report mr vmr daily session',
  'CPS Academy VMRs':'cps academy vmrs vmr archive session recording learning',
  'CRC':'crc clinical reasoning case presenter mentor',
  'OrgStructure':'orgstructure org structure org chart leadership teams',
  'Members':'members orgstructure org structure directory sponsors country',
  'Research @CPSolvers':'research cpsolvers collaborators publications skills',
  'Podcast Episodes':'podcast episodes audio editor release',
  'Schema review':'schema review infographic video pipeline',
  'Conferences':'conferences congress scholarship meeting',
  'Important links':'important links resources bookmarks recurring',
  'Leader of the Week':'leader of the week member',
  'Special VMRs':'special vmrs vmr details',
  'Student Forum':'student forum topic expert vmr',
  'Residency Programs':'residency programs partner hospital discussants junior member facilitator allegheny',
  'CRC - retired':'crc retired mentorship archive legacy mentee mentor case presentation'
};

function buildSearchIndex(r,t){return `${t} ${r.source||''} ${tabAliases[t]||''} ${Object.values(r.fields).join(' ')}`.toLowerCase()}

test('recognizes original workbook tab names and aliases', () => {
  for(const [t, grp] of Object.entries(data)){
    for(const r of grp.records){
      r._search = buildSearchIndex(r, t);
    }
  }

  const orgMatches = Object.keys(data).flatMap(t => data[t].records.filter(r => r._search.includes('orgstructure')).map(r => ({r, t})));
  assert(orgMatches.length >= 200, `Expected >= 200 matches for OrgStructure, got ${orgMatches.length}`);
  const hasMembers = orgMatches.some(m => m.t === 'Members');
  const hasOrg = orgMatches.some(m => m.t === 'OrgStructure');
  assert(hasMembers && hasOrg, 'Expected OrgStructure search to include both Members and OrgStructure records');

  const podcastMatches = Object.keys(data).flatMap(t => data[t].records.filter(r => r._search.includes('podcast')).map(r => ({r, t})));
  assert(podcastMatches.length >= 392, `Expected all podcast records matched, got ${podcastMatches.length}`);

  const schemaMatches = Object.keys(data).flatMap(t => data[t].records.filter(r => r._search.includes('schema')).map(r => ({r, t})));
  assert(schemaMatches.length >= 20, `Expected all schema records matched, got ${schemaMatches.length}`);
});

test('pagination reaches all results beyond 24', () => {
  const vmrMatches = Object.keys(data).flatMap(t => data[t].records.filter(r => r._search.includes('vmr')).map(r => ({r, t})));
  assert(vmrMatches.length > 24, 'VMR query should have more than 24 results');

  const PAGE_SIZE = 24;
  const totalPages = Math.ceil(vmrMatches.length / PAGE_SIZE);
  assert(totalPages > 1, 'Should have multiple pages');

  const seenIds = new Set();
  for (let page = 0; page < totalPages; page++) {
    const pageRecords = vmrMatches.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    assert(pageRecords.length <= PAGE_SIZE);
    if (page < totalPages - 1) {
      assert.equal(pageRecords.length, PAGE_SIZE);
    }
    for (const {r} of pageRecords) {
      assert(!seenIds.has(r.id), `Duplicate record ${r.id} found in pagination`);
      seenIds.add(r.id);
    }
  }
  assert.equal(seenIds.size, vmrMatches.length, 'Every matching record reached through pagination');
});
