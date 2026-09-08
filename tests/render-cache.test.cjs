'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SessionCore = require('../session-core.js');
const SearchCore = require('../search-core.js');
const workbook = require('../workbook.json');

test('Repeated unchanged renders do not re-split source rows', () => {
  SessionCore.clearCaches();
  const mrRecords = workbook['Morning Report'].records;
  assert.ok(mrRecords.length > 50, 'Morning report records must be populated');

  const record = mrRecords[11]; // Known row 12 with multi-session
  const initialStats = SessionCore.getCacheStats();
  assert.equal(initialStats.splitHits, 0);

  const res1 = SessionCore.splitMorningReport(record);
  const res2 = SessionCore.splitMorningReport(record);
  const res3 = SessionCore.splitMorningReport(record);

  const stats = SessionCore.getCacheStats();
  assert.equal(stats.splitCalls, 3);
  assert.equal(stats.splitHits, 2);
  assert.equal(res1.length, res2.length);
  assert.equal(res2.length, res3.length);
  assert.deepEqual(res1[0].fields, res2[0].fields);
});

test('Editing a single cell invalidates only the affected record derived values', () => {
  SessionCore.clearCaches();
  SearchCore.clearSearchCache();

  const recordA = {
    id: 'MR:test:recA',
    source: 'Morning Report',
    fields: { Date: '2026-09-01', Type: 'VMR A', Facilitator: 'Dr. Alpha' }
  };
  const recordB = {
    id: 'MR:test:recB',
    source: 'Morning Report',
    fields: { Date: '2026-09-02', Type: 'VMR B', Facilitator: 'Dr. Beta' }
  };

  // Warm both
  SessionCore.splitMorningReport(recordA);
  SessionCore.splitMorningReport(recordB);
  SearchCore.buildSearchIndex(recordA, 'Morning Report');
  SearchCore.buildSearchIndex(recordB, 'Morning Report');

  let stats = SessionCore.getCacheStats();
  assert.equal(stats.splitHits, 0);

  // Invalidate only recordA
  SessionCore.invalidateRecord(recordA.id);
  SearchCore.invalidateSearchRecord(recordA.id);

  // Split both again: recordB should hit cache, recordA should miss
  SessionCore.splitMorningReport(recordB);
  stats = SessionCore.getCacheStats();
  assert.equal(stats.splitHits, 1, 'Record B should hit split cache');

  SessionCore.splitMorningReport(recordA);
  stats = SessionCore.getCacheStats();
  assert.equal(stats.splitHits, 1, 'Record A missed split cache because it was invalidated');

  // Next call to recordA now hits cache
  SessionCore.splitMorningReport(recordA);
  stats = SessionCore.getCacheStats();
  assert.equal(stats.splitHits, 2, 'Record A hits split cache after recomputation');
});

test('Facet filtering reuses pre-computed facilitator sets without re-tokenizing', () => {
  SessionCore.clearCaches();

  const rawFacilitator = 'Dr. Rabih Geha (Mentor) and Dr. Reza Manesh';
  const f1 = SessionCore.facilitatorNames(rawFacilitator);
  const f2 = SessionCore.facilitatorNames(rawFacilitator);
  const f3 = SessionCore.facilitatorNames(rawFacilitator);

  const stats = SessionCore.getCacheStats();
  assert.equal(stats.facilitatorCalls, 3);
  assert.equal(stats.facilitatorHits, 2);
  assert.deepEqual(f1, ['Dr. Rabih Geha (Mentor)', 'Dr. Reza Manesh']);
  assert.deepEqual(f1, f2);
  assert.deepEqual(f2, f3);

  // Test matchesFacets filtering over a set of records
  const records = Array.from({ length: 20 }, (_, i) => ({
    id: `MR:facet:${i}`,
    fields: { Type: 'Morning Report', Facilitator: rawFacilitator }
  }));

  const hitsBefore = SessionCore.getCacheStats().facilitatorHits;
  const filtered = records.filter(r => SessionCore.matchesFacets(r, { facilitator: 'Dr. Reza Manesh' }));
  const hitsAfter = SessionCore.getCacheStats().facilitatorHits;

  assert.equal(filtered.length, 20);
  assert.equal(hitsAfter - hitsBefore, 20, 'All 20 records should hit pre-computed facilitator sets');
});

test('Calendar exports reflect edits immediately without stale cache hits', () => {
  SessionCore.clearCaches();

  const record = {
    id: 'MR:test:calendar',
    source: 'Morning Report',
    row: 100,
    fields: {
      Date: '2026-10-05',
      'Pacific time (source)': '9:00 AM PT',
      Type: 'Case Presentation',
      Facilitator: 'Dr. Test'
    }
  };

  const cal1 = SessionCore.createCalendar(record);
  assert.match(cal1, /DTSTART:20261005T160000Z/);

  // Edit time and date
  const editedRecord = {
    ...record,
    fields: {
      ...record.fields,
      Date: '2026-10-06',
      'Pacific time (source)': '10:00 AM PT'
    }
  };

  // When record is invalidated, calendar must immediately reflect new time
  SessionCore.invalidateRecord(record.id);
  const cal2 = SessionCore.createCalendar(editedRecord);
  assert.match(cal2, /DTSTART:20261006T170000Z/);
  assert.notEqual(cal1, cal2);
});

test('Memory footprint stabilizes under repeated render-edit cycles', () => {
  SessionCore.clearCaches();

  // Simulate 5,000 distinct records split and parsed across multiple render passes
  for (let i = 0; i < 5000; i++) {
    const dummy = {
      id: `MR:dummy:${i}`,
      fields: {
        Date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
        'Pacific time (source)': `${(i % 12) + 1}:00 AM PT`,
        Facilitator: `Facilitator ${i % 300}`,
        Type: 'Morning Report'
      }
    };
    SessionCore.splitMorningReport(dummy);
    SessionCore.parseSessionTime(dummy);
    SessionCore.formatSessionTime(dummy, 'America/New_York');
    SessionCore.facilitatorNames(dummy.fields.Facilitator);
  }

  const stats = SessionCore.getCacheStats();
  assert.ok(stats.splitSize <= 4000, `splitSize (${stats.splitSize}) must not exceed 4000`);
  assert.ok(stats.timeResolutionSize <= 4000, `timeResolutionSize (${stats.timeResolutionSize}) must not exceed 4000`);
  assert.ok(stats.timeFormatSize <= 4000, `timeFormatSize (${stats.timeFormatSize}) must not exceed 4000`);
  assert.ok(stats.facilitatorSize <= 4000, `facilitatorSize (${stats.facilitatorSize}) must not exceed 4000`);
});
