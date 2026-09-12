'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workbook = JSON.parse(fs.readFileSync(path.join(__dirname, '../workbook.json'), 'utf8'));
const appJs = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

test('Important links dataset has exactly 13 snapshot records and valid structure', () => {
  const linksData = workbook['Important links'];
  assert.ok(linksData, 'Important links tab exists in workbook');
  assert.equal(linksData.records.length, 13, 'Contains exactly 13 snapshot records');
  assert.deepEqual(linksData.columns, ['Resource', 'Link']);

  for (const r of linksData.records) {
    assert.ok(r.id, 'Record has an ID');
    assert.ok(r.fields.Resource, 'Record has a non-empty Resource field');
    assert.ok('Link' in r.fields, 'Record has Link field in fields');
  }
});

test('Important links: purpose categories classify all 13 records cleanly without loss', () => {
  const categories = [
    { id: 'clinical-vmr', match: r => /vmr|whiteboard|teaching points/i.test(r.fields.Resource || '') },
    { id: 'schemas-video', match: r => /schema/i.test(r.fields.Resource || '') },
    { id: 'podcasts-media', match: r => /podcast|audio|some|social media|website/i.test(r.fields.Resource || '') },
    { id: 'operating-guides', match: r => /procedure|sop|booklet|operating|guide/i.test(r.fields.Resource || '') }
  ];

  const records = workbook['Important links'].records;
  const classified = records.map(r => {
    const found = categories.find(c => c.match(r));
    return { id: r.id, name: r.fields.Resource, cat: found ? found.id : 'other-resources' };
  });

  const clinical = classified.filter(c => c.cat === 'clinical-vmr');
  const schemas = classified.filter(c => c.cat === 'schemas-video');
  const podcasts = classified.filter(c => c.cat === 'podcasts-media');
  const operating = classified.filter(c => c.cat === 'operating-guides');
  const other = classified.filter(c => c.cat === 'other-resources');

  assert.equal(clinical.length, 4, '4 Clinical/VMR resources (VMR overview, Teaching Points Recap, CPS VMR Archive, CPS VMR New Whiteboard)');
  assert.equal(schemas.length, 3, '3 Schema resources (Creating schema videos, Recording schema videos, Drive folder schemas)');
  assert.equal(podcasts.length, 4, '4 Audio/podcast/media resources (Audio editing, Website uploading, Podcast best practices, SoMe workflow)');
  assert.equal(operating.length, 2, '2 Operating guide resources (Case Review SOP, Academy Booklet)');
  assert.equal(other.length, 0, 'All 13 snapshot records map to a justified category');
  assert.equal(clinical.length + schemas.length + podcasts.length + operating.length, 13);
});

test('Important links: Action labels and subtitle helper avoid raw URLs as primary labels', () => {
  function getResourceActionLabel(url) {
    if (!url) return 'Open resource';
    if (/presentation/i.test(url)) return 'Open whiteboard';
    if (/document/i.test(url)) return 'Open document';
    if (/drive\.google/i.test(url)) return 'Open folder';
    return 'Open resource';
  }

  function getResourceSubtitle(r) {
    const linkField = (r.fields.Link || '').trim();
    if (!linkField || /^https?:\/\//i.test(linkField)) return '';
    return linkField;
  }

  const records = workbook['Important links'].records;
  
  // Row 2: VMR overview -> Google Doc with subtitle "CPSolvers morning report - Overview"
  const row2 = records.find(r => r.row === 2);
  assert.equal(row2.fields.Resource, 'VMR overview');
  assert.equal(getResourceSubtitle(row2), 'CPSolvers morning report - Overview');
  assert.equal(getResourceActionLabel(row2.links.Link), 'Open document');

  // Row 3: Creating schema videos -> raw URL in fields.Link -> subtitle should be empty (no raw URL)
  const row3 = records.find(r => r.row === 3);
  assert.equal(row3.fields.Resource, 'Creating schema videos');
  assert.equal(getResourceSubtitle(row3), '', 'Raw URL in fields.Link is suppressed as label/subtitle');
  assert.equal(getResourceActionLabel(row3.links.Link), 'Open document');

  // Row 5: Audio editing -> missing link
  const row5 = records.find(r => r.row === 5);
  assert.equal(row5.fields.Resource, 'Audio editing');
  assert.equal(row5.fields.Link, '');
  assert.equal(getResourceSubtitle(row5), '');
  assert.equal(row5.links?.Link, undefined, 'No link in source');

  // Row 13: CPS VMR Archive -> Google Slides
  const row13 = records.find(r => r.row === 13);
  assert.equal(row13.fields.Resource, 'CPS VMR Archive');
  assert.equal(getResourceSubtitle(row13), 'VMR Whiteboard Archive');
  assert.equal(getResourceActionLabel(row13.links.Link), 'Open whiteboard');
});

test('Conferences dataset contains all 9 essential fields for EULAR Congress', () => {
  const confData = workbook['Conferences'];
  assert.ok(confData, 'Conferences tab exists');
  assert.equal(confData.records.length, 1, 'Contains exactly 1 snapshot conference');

  const conf = confData.records[0];
  const expectedCols = ['Congress', 'Subspecialty', 'Start', 'End', 'City', 'Members attending', 'Link', 'Scholarship', 'Note'];
  for (const col of expectedCols) {
    assert.ok(col in conf.fields, `Conference has column ${col}`);
  }

  assert.equal(conf.fields.Congress, 'EULAR Congress');
  assert.equal(conf.fields.Subspecialty, 'Rheumatology');
  assert.equal(conf.fields.Start, '2025-06-11');
  assert.equal(conf.fields.End, '2025-06-14');
  assert.equal(conf.fields.City, 'Barcelona');
  assert.equal(conf.fields['Members attending'], 'Julia, Lea');
  assert.equal(conf.fields.Link, 'https://congress.eular.org/');
  assert.equal(conf.fields.Scholarship, 'yes (Lea)');

  // Links preservation without network call
  assert.equal(conf.links.Link, 'https://congress.eular.org/');
  assert.ok(conf.links.City.includes('google.com/maps'), 'City has Google Maps link');
});

test('app.js defines dedicated views and routes for Important links and Conferences', () => {
  assert.ok(appJs.includes('function importantLinksView()'), 'app.js defines importantLinksView');
  assert.ok(appJs.includes('function conferencesView()'), 'app.js defines conferencesView');
  assert.ok(appJs.includes("tab==='Important links')importantLinksView()"), 'render() routes Important links');
  assert.ok(appJs.includes("tab==='Conferences')conferencesView()"), 'render() routes Conferences');
});

test('Local draft in workspace.added appears in small collections without schema change', () => {
  const workspace = {
    edits: {},
    added: [
      {
        id: 'local:draft-link-1',
        tab: 'Important links',
        source: 'Local draft',
        row: null,
        fields: { Resource: 'Custom Oncology Protocols', Link: 'https://docs.google.com/document/d/example' },
        links: { Link: 'https://docs.google.com/document/d/example' },
        flags: []
      },
      {
        id: 'local:draft-conf-1',
        tab: 'Conferences',
        source: 'Local draft',
        row: null,
        fields: {
          Congress: 'Internal Medicine 2026',
          Subspecialty: 'General Medicine',
          Start: '2026-04-10',
          End: '2026-04-13',
          City: 'Chicago',
          'Members attending': 'Zakariyya',
          Link: 'https://im2026.example.org',
          Scholarship: 'pending',
          Note: 'Poster presentation submission'
        },
        links: { Link: 'https://im2026.example.org' },
        flags: []
      }
    ],
    favorites: []
  };

  function getRecords(tab) {
    return [...(workbook[tab]?.records || []), ...workspace.added.filter(r => r.tab === tab)];
  }

  const links = getRecords('Important links');
  assert.equal(links.length, 14, '13 snapshot + 1 local draft');
  const draftLink = links.find(r => r.id === 'local:draft-link-1');
  assert.ok(draftLink, 'Draft link is present');
  assert.equal(draftLink.fields.Resource, 'Custom Oncology Protocols');

  const confs = getRecords('Conferences');
  assert.equal(confs.length, 2, '1 snapshot + 1 local draft');
  const draftConf = confs.find(r => r.id === 'local:draft-conf-1');
  assert.ok(draftConf, 'Draft conference is present');
  assert.equal(draftConf.fields.Congress, 'Internal Medicine 2026');
});
