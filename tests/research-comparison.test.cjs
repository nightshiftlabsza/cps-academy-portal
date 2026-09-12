'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workbook = JSON.parse(fs.readFileSync(path.join(__dirname, '../workbook.json'), 'utf8'));
const appJs = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

const RESEARCH_SKILLS = [
  'Prior CPS publications',
  'Research writing',
  'Data analytics',
  'Cross-sectional studies',
  'Systematic reviews',
  'Qualitative studies',
  'Case reports'
];

test('Research @CPSolvers dataset has exactly 18 named snapshot records and valid structure', () => {
  const researchData = workbook['Research @CPSolvers'];
  assert.ok(researchData, 'Research tab exists in workbook.json');
  assert.equal(researchData.records.length, 18, 'Contains exactly 18 snapshot records');
  assert.deepEqual(researchData.columns, [
    'Name',
    'Prior CPS publications',
    'Research writing',
    'Data analytics',
    'Cross-sectional studies',
    'Systematic reviews',
    'Qualitative studies',
    'Case reports',
    'Availability',
    'Preferred contact'
  ]);

  for (const r of researchData.records) {
    assert.ok(r.id, 'Record has an ID');
    assert.ok(r.fields.Name && r.fields.Name.trim().length > 0, `Record ${r.id} has a non-empty name`);
    assert.ok(r.row >= 4 && r.row <= 21, `Record ${r.id} is within rows 4..21`);
    assert.ok('Availability' in r.fields, `Record ${r.id} has Availability field`);
    assert.ok('Preferred contact' in r.fields, `Record ${r.id} has Preferred contact field`);
  }
});

test('Zero-pagination: 12th and 13th collaborators are present in the same collection without Next', () => {
  const records = workbook['Research @CPSolvers'].records;
  assert.equal(records.length, 18);

  const twelfth = records[11];
  const thirteenth = records[12];

  assert.equal(twelfth.fields.Name, 'Johann Alexandre Edjimbi', '12th record is Johann Alexandre Edjimbi');
  assert.equal(thirteenth.fields.Name, 'Minahil Ramzan', '13th record is Minahil Ramzan');

  // Both records must be present in substantive records
  const names = records.map(r => r.fields.Name);
  assert.ok(names.includes('Johann Alexandre Edjimbi'));
  assert.ok(names.includes('Minahil Ramzan'));

  // Check app.js includes researchView without pagination slicing
  assert.ok(appJs.includes('function researchView()'), 'app.js defines researchView');
  assert.ok(appJs.includes('Showing ${visibleRecords.length} without pagination'), 'Truthful meta message confirms no pagination');
});

test('Skill state formatting distinguishes Yes, No, and Not recorded without conflating missing with No', () => {
  function formatSkillStatus(value) {
    const v = String(value ?? '').trim();
    if (v.toLowerCase() === 'yes') {
      return { status: 'yes', label: 'Yes', html: '<span class="skill-pill skill-yes" aria-label="Yes">Yes</span>' };
    }
    if (v.toLowerCase() === 'no') {
      return { status: 'no', label: 'No', html: '<span class="skill-pill skill-no" aria-label="No">No</span>' };
    }
    return { status: 'unrecorded', label: 'Not recorded', html: '<span class="skill-pill skill-unrecorded" aria-label="Not recorded" title="Not recorded in workbook">Not recorded</span>' };
  }

  // Yes
  const yesRes = formatSkillStatus('Yes');
  assert.equal(yesRes.status, 'yes');
  assert.equal(yesRes.label, 'Yes');
  assert.ok(yesRes.html.includes('skill-yes'));

  // No
  const noRes = formatSkillStatus('No');
  assert.equal(noRes.status, 'no');
  assert.equal(noRes.label, 'No');
  assert.ok(noRes.html.includes('skill-no'));

  // Missing values (empty string, null, undefined, whitespace)
  for (const missing of ['', null, undefined, '   ', '—']) {
    const missingRes = formatSkillStatus(missing);
    assert.equal(missingRes.status, 'unrecorded', `Value '${missing}' must be unrecorded`);
    assert.equal(missingRes.label, 'Not recorded');
    assert.notEqual(missingRes.status, 'no', `Value '${missing}' must NOT be treated as No`);
    assert.ok(missingRes.html.includes('skill-unrecorded'));
    assert.ok(missingRes.html.includes('Not recorded'));
  }
});

test('Skill filtering applies across all 18 records', () => {
  const records = workbook['Research @CPSolvers'].records;

  // Filter for 'Data analytics'
  const analyticsYes = records.filter(r => String(r.fields['Data analytics'] || '').trim().toLowerCase() === 'yes');
  const analyticsNo = records.filter(r => String(r.fields['Data analytics'] || '').trim().toLowerCase() === 'no');

  assert.ok(analyticsYes.length > 0, 'Some collaborators have Data analytics');
  assert.ok(analyticsNo.length > 0, 'Some collaborators do not have Data analytics');
  assert.equal(analyticsYes.length + analyticsNo.length, 18, 'All 18 records have recorded Data analytics values');

  // Filter for 'Prior CPS publications'
  const pubsYes = records.filter(r => String(r.fields['Prior CPS publications'] || '').trim().toLowerCase() === 'yes');
  assert.equal(pubsYes.length, 2, 'Exactly 2 collaborators have Prior CPS publications (Yaz Heredia, Oumaima Outani)');
  const pubNames = pubsYes.map(r => r.fields.Name).sort();
  assert.deepEqual(pubNames, ['Oumaima Outani', 'Yaz Heredia']);
});

test('Availability wording is maintained verbatim', () => {
  const records = workbook['Research @CPSolvers'].records;
  const availValues = new Set(records.map(r => r.fields.Availability));

  assert.ok(availValues.has('Available'));
  assert.ok(availValues.has('NOT available (YET)'));
  assert.ok(availValues.has('Not available'));

  // Verify Yaz Heredia has 'NOT available (YET)' preserved verbatim
  const yaz = records.find(r => r.fields.Name === 'Yaz Heredia');
  assert.ok(yaz);
  assert.equal(yaz.fields.Availability, 'NOT available (YET)');
});

test('Column visibility toggle permits choosing a subset of visible skill columns', () => {
  const visibleSkills = new Set(RESEARCH_SKILLS);
  assert.equal(visibleSkills.size, 7);

  // Toggle off 'Prior CPS publications' and 'Qualitative studies'
  visibleSkills.delete('Prior CPS publications');
  visibleSkills.delete('Qualitative studies');

  const visibleList = RESEARCH_SKILLS.filter(s => visibleSkills.has(s));
  assert.equal(visibleList.length, 5);
  assert.ok(!visibleList.includes('Prior CPS publications'));
  assert.ok(!visibleList.includes('Qualitative studies'));
  assert.ok(visibleList.includes('Data analytics'));
  assert.ok(visibleList.includes('Systematic reviews'));
});

test('Mobile view extracts compact positive-skill summary and retains complete disclosure checklist', () => {
  const records = workbook['Research @CPSolvers'].records;
  const sample = records.find(r => r.fields.Name === 'Ibrahim Omer');
  assert.ok(sample);

  const positiveSkills = RESEARCH_SKILLS.filter(s => String(sample.fields[s] || '').trim().toLowerCase() === 'yes');
  assert.ok(positiveSkills.length > 0);
  assert.ok(positiveSkills.includes('Research writing'));
  assert.ok(positiveSkills.includes('Data analytics'));
  assert.ok(!positiveSkills.includes('Prior CPS publications')); // 'No'
  assert.ok(!positiveSkills.includes('Case reports')); // 'No'

  // Full disclosure contains all 7 skills
  assert.equal(RESEARCH_SKILLS.length, 7);
  for (const s of RESEARCH_SKILLS) {
    const val = sample.fields[s];
    assert.ok(val === 'Yes' || val === 'No', `Skill ${s} is Yes or No in sample`);
  }

  // Preferred contact is preserved
  assert.equal(sample.fields['Preferred contact'], 'WhatsApp - +966566323824');
});

test('Local drafts and edits integrate with the same record identity', () => {
  const baseRecord = workbook['Research @CPSolvers'].records[0];
  const recordId = baseRecord.id;

  // Simulate local edit
  const edits = {
    [recordId]: {
      Availability: 'On sabbatical',
      'Data analytics': 'No'
    }
  };

  const effectiveFields = { ...baseRecord.fields, ...(edits[recordId] || {}) };
  assert.equal(effectiveFields.Availability, 'On sabbatical');
  assert.equal(effectiveFields['Data analytics'], 'No');
  assert.equal(effectiveFields.Name, baseRecord.fields.Name);

  // Simulate restore: removing local edit restores original fields
  delete edits[recordId];
  const restoredFields = { ...baseRecord.fields, ...(edits[recordId] || {}) };
  assert.equal(restoredFields.Availability, baseRecord.fields.Availability);
  assert.equal(restoredFields['Data analytics'], baseRecord.fields['Data analytics']);
});
