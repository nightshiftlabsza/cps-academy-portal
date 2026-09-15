'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const workbook = JSON.parse(fs.readFileSync(path.join(root, 'workbook.json'), 'utf8'));
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function createClassifierHarness(edits = {}) {
  const sandbox = {
    workspace: { edits, added: [], favorites: [] },
    db: workbook,
    esc: String,
    title: (r, t) => r.fields?.Name || r.fields?.Presenter || r.fields?.['Residency Programs'] || r.fields?.MENTEE || r.fields?.['Team / responsibility'] || 'Untitled'
  };
  vm.createContext(sandbox);

  // Extract from app.js up to getClassificationCounts
  const startIdx = appCode.indexOf('const tabAliases=');
  const endIdx = appCode.indexOf('const recordSearchCache = new Map();');
  assert(startIdx !== -1 && endIdx !== -1, 'Could not locate classification slice in app.js');

  const slice = appCode.slice(startIdx, endIdx) +
    '; this.RECORD_CATEGORY = RECORD_CATEGORY; this.CRC_RETIRED_ROUNDS = CRC_RETIRED_ROUNDS;' +
    ' this.MEMBERS_STRUCTURAL_IDS = MEMBERS_STRUCTURAL_IDS; this.RESIDENCY_MONTH_HEADINGS = RESIDENCY_MONTH_HEADINGS;' +
    ' this.classifyRecord = classifyRecord; this.getRecordClassification = getRecordClassification;' +
    ' this.getClassificationCounts = getClassificationCounts; this.formatResultsCount = formatResultsCount;';

  vm.runInContext(slice, sandbox);
  return sandbox;
}

test('Members reconciliation accounts for 148 named rows and 6 structural entries across 4 cohorts', () => {
  const h = createClassifierHarness();
  const memRecords = workbook['Members'].records;
  assert.equal(memRecords.length, 154, 'Expected exactly 154 records in snapshot Members');

  const counts = h.getClassificationCounts(memRecords, 'Members');
  assert.equal(counts.namedEntries, 148, 'Must account for exactly 148 named member rows');
  assert.equal(counts.sourceHeadings, 6, 'Must account for exactly 6 structural entries');
  assert.equal(counts.placeholders, 0, 'No placeholders in clean snapshot Members');
  assert.equal(counts.unknowns, 0, 'No unknowns in clean snapshot Members');

  // Verify cohort breakdown
  assert.equal(counts.cohortCounts['Participants'], 15, '15 named rows in Participants cohort');
  assert.equal(counts.cohortCounts['Core team'], 54, '54 named rows in Core team cohort');
  assert.equal(counts.cohortCounts['Leaders'], 36, '36 named rows in Leaders cohort');
  assert.equal(counts.cohortCounts['Marked inactive in source'], 43, '43 named rows marked inactive in source');

  // Verify all 6 structural IDs
  const structuralIds = ['Members:80', 'Members:82', 'Members:146', 'Members:148', 'Members:189', 'Members:191'];
  for (const sid of structuralIds) {
    const rec = memRecords.find(r => r.id === sid);
    assert(rec, `Structural record ${sid} must exist in snapshot`);
    const c = h.classifyRecord(rec, 'Members');
    assert.equal(c.category, h.RECORD_CATEGORY.SOURCE_HEADING);
    assert.equal(c.isStructural, true);
    assert.equal(c.isSubstantive, false);
  }

  // Verify all raw fields remain pristine (no injected properties into raw fields)
  for (const r of memRecords) {
    assert.equal(r.fields.category, undefined, 'raw fields must not contain category');
    assert.equal(r.fields.cohort, undefined, 'raw fields must not contain cohort');
    assert.equal(r.fields.classification, undefined, 'raw fields must not contain classification');
  }
});

test('Residency Programs distinguishes 1 session from 5 month labels without record loss', () => {
  const h = createClassifierHarness();
  const resRecords = workbook['Residency Programs'].records;
  assert.equal(resRecords.length, 6, 'Expected exactly 6 records in Residency Programs');

  const counts = h.getClassificationCounts(resRecords, 'Residency Programs');
  assert.equal(counts.namedEntries, 1, 'Expected exactly 1 substantive session row');
  assert.equal(counts.sourceHeadings, 5, 'Expected exactly 5 month label headings');
  assert.equal(counts.total, 6);

  // Real session row
  const sessionRec = resRecords.find(r => r.id === 'Residency Programs:4');
  assert(sessionRec, 'Session row 4 must exist');
  const sessionClass = h.classifyRecord(sessionRec, 'Residency Programs');
  assert.equal(sessionClass.category, h.RECORD_CATEGORY.NAMED_ENTRY);
  assert.equal(sessionClass.role, 'session');
  assert.equal(sessionClass.month, 'October');
  assert.equal(sessionClass.isSubstantive, true);

  // Month labels
  const monthIds = ['Residency Programs:3', 'Residency Programs:8', 'Residency Programs:13', 'Residency Programs:17', 'Residency Programs:21'];
  for (const mid of monthIds) {
    const rec = resRecords.find(r => r.id === mid);
    assert(rec, `Month heading ${mid} must exist`);
    const c = h.classifyRecord(rec, 'Residency Programs');
    assert.equal(c.category, h.RECORD_CATEGORY.SOURCE_HEADING);
    assert.equal(c.role, 'month_heading');
    assert.equal(c.isStructural, true);
    assert.equal(c.isSubstantive, false);
  }
});

test('Retired CRC maintains traceable round boundaries across all 15 rounds with 400 cases and 2 placeholders', () => {
  const h = createClassifierHarness();
  const crcRecords = workbook['CRC - retired'].records;
  assert.equal(crcRecords.length, 417, 'Expected exactly 417 records in CRC - retired');

  const counts = h.getClassificationCounts(crcRecords, 'CRC - retired');
  assert.equal(counts.namedEntries, 400, 'Expected exactly 400 substantive cases');
  assert.equal(counts.sourceHeadings, 15, 'Expected exactly 15 round headings');
  assert.equal(counts.placeholders, 2, 'Expected exactly 2 checkbox-only placeholders');
  assert.equal(counts.total, 417);

  // Verify all 15 rounds are traceable and represented
  assert.equal(Object.keys(counts.roundCounts).length, 15, 'All 15 rounds must be present');
  for (let i = 1; i <= 15; i++) {
    const roundName = `Round ${i}`;
    assert(counts.roundCounts[roundName] > 0, `${roundName} must have associated cases/headings`);
  }

  // Check the two checkbox-only placeholders
  const p1 = crcRecords.find(r => r.id === 'CRC - retired:418');
  const p2 = crcRecords.find(r => r.id === 'CRC - retired:419');
  assert(p1 && p2, 'Placeholders 418 and 419 must exist');
  assert.equal(h.classifyRecord(p1, 'CRC - retired').category, h.RECORD_CATEGORY.PLACEHOLDER);
  assert.equal(h.classifyRecord(p2, 'CRC - retired').category, h.RECORD_CATEGORY.PLACEHOLDER);
});

test('Locally edited placeholder is dynamically re-evaluated and never hidden', () => {
  const targetId = 'CRC - retired:418';
  const rec = workbook['CRC - retired'].records.find(r => r.id === targetId);
  assert(rec);

  // Baseline is placeholder
  const hClean = createClassifierHarness({});
  const cleanClass = hClean.classifyRecord(rec, 'CRC - retired');
  assert.equal(cleanClass.category, hClean.RECORD_CATEGORY.PLACEHOLDER);
  assert.equal(cleanClass.isStructural, true);
  assert.equal(cleanClass.isSubstantive, false);

  // Locally edit placeholder with real mentee case
  const hEdited = createClassifierHarness({
    [targetId]: {
      MENTEE: 'Dr. Evelyn Reed',
      'CPSOLVERS MENTOR': 'Dr. S. Smith',
      'CONTACT INFO': 'evelyn@example.com'
    }
  });

  const editedClass = hEdited.classifyRecord(rec, 'CRC - retired');
  assert.equal(editedClass.category, hEdited.RECORD_CATEGORY.NAMED_ENTRY, 'Must be dynamically promoted to named entry');
  assert.equal(editedClass.isSubstantive, true);
  assert.equal(editedClass.isStructural, false);
  assert.equal(editedClass.wasPlaceholder, true);
  assert(editedClass.reviewNotice.includes('Locally edited from placeholder'));

  // Counts reflect the promotion
  const allRecs = workbook['CRC - retired'].records;
  const editedCounts = hEdited.getClassificationCounts(allRecs, 'CRC - retired');
  assert.equal(editedCounts.namedEntries, 401, 'Named entries count must increase by 1');
  assert.equal(editedCounts.placeholders, 1, 'Placeholders count must decrease by 1');
});

test('Locally edited heading is dynamically re-evaluated and promoted to substantive named entry', () => {
  const targetId = 'Members:80';
  const rec = workbook['Members'].records.find(r => r.id === targetId);
  assert(rec);

  const hEdited = createClassifierHarness({
    [targetId]: {
      Name: 'Dr. Marcus Vance',
      Email: 'marcus.vance@example.edu',
      Country: 'Canada'
    }
  });

  const editedClass = hEdited.classifyRecord(rec, 'Members');
  assert.equal(editedClass.category, hEdited.RECORD_CATEGORY.NAMED_ENTRY, 'Must be promoted to named entry');
  assert.equal(editedClass.wasHeading, true);
  assert.equal(editedClass.isSubstantive, true);
  assert.equal(editedClass.label, 'Dr. Marcus Vance');
  assert(editedClass.reviewNotice.includes('Locally edited from source heading'));

  const editedCounts = hEdited.getClassificationCounts(workbook['Members'].records, 'Members');
  assert.equal(editedCounts.namedEntries, 149);
  assert.equal(editedCounts.sourceHeadings, 5);
});

test('Unknown, malformed and blank records are safely classified and never lost or deleted', () => {
  const h = createClassifierHarness();

  // Malformed record missing fields
  const malformed = { id: 'test:corrupt', row: 999 };
  const malformedClass = h.classifyRecord(malformed, 'Members');
  assert.equal(malformedClass.category, h.RECORD_CATEGORY.UNKNOWN);
  assert.equal(malformedClass.isSubstantive, false);
  assert.equal(malformedClass.isStructural, false);

  // Totally empty record
  const empty = { id: 'test:empty', row: 1000, fields: { A: '', B: '   ' } };
  const emptyClass = h.classifyRecord(empty, 'Special VMRs');
  assert.equal(emptyClass.category, h.RECORD_CATEGORY.PLACEHOLDER);
  assert.equal(emptyClass.isStructural, true);

  // Ensure counts accurately record unknowns
  const mixedList = [malformed, empty, workbook['Members'].records[0]];
  const counts = h.getClassificationCounts(mixedList, 'Members');
  assert.equal(counts.unknowns, 1);
  assert.equal(counts.placeholders, 1);
  assert.equal(counts.namedEntries, 1);
  assert.equal(counts.total, 3);
});

test('Duplicate names retain distinct snapshot identities and separate classifications', () => {
  const h = createClassifierHarness();

  // Synthetic duplicate named entries
  const r1 = { id: 'Members:500', row: 500, fields: { Name: 'Jordan Lee', Email: 'j1@example.com' } };
  const r2 = { id: 'Members:501', row: 501, fields: { Name: 'Jordan Lee', Email: 'j2@example.com' } };

  const c1 = h.classifyRecord(r1, 'Members');
  const c2 = h.classifyRecord(r2, 'Members');

  assert.equal(c1.category, h.RECORD_CATEGORY.NAMED_ENTRY);
  assert.equal(c2.category, h.RECORD_CATEGORY.NAMED_ENTRY);
  assert.notEqual(r1.id, r2.id);
});

test('cps-hub-backup-v2 backup payload preserves classifications upon import', () => {
  // Simulating an exported backup with local edits
  const backup = {
    format: 'cps-hub-backup-v2',
    exportedAt: new Date().toISOString(),
    edits: {
      'CRC - retired:418': { MENTEE: 'Restored Mentee From Backup', 'CPSOLVERS MENTOR': 'Mentor One' },
      'Members:80': { Name: 'Restored Member From Backup', Email: 'restored@example.com' }
    },
    added: [],
    favorites: ['Members:80']
  };

  assert.equal(backup.format, 'cps-hub-backup-v2');

  const h = createClassifierHarness(backup.edits);
  const pRec = workbook['CRC - retired'].records.find(r => r.id === 'CRC - retired:418');
  const mRec = workbook['Members'].records.find(r => r.id === 'Members:80');

  const pClass = h.classifyRecord(pRec, 'CRC - retired');
  assert.equal(pClass.category, h.RECORD_CATEGORY.NAMED_ENTRY);
  assert.equal(pClass.wasPlaceholder, true);

  const mClass = h.classifyRecord(mRec, 'Members');
  assert.equal(mClass.category, h.RECORD_CATEGORY.NAMED_ENTRY);
  assert.equal(mClass.wasHeading, true);
});
