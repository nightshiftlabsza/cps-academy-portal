'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  slugify,
  generateDeterministicId,
  parseMorningReport
} = require('../api/_lib/sheets-reader.cjs');

test('slugify cleans diverse inputs into URL/ID safe strings', () => {
  assert.equal(slugify('Case Conference (In-Person)'), 'case-conference-in-person');
  assert.equal(slugify('  9:00 AM  '), '9-00-am');
  assert.equal(slugify('Dr. Jane Doe-Smith'), 'dr-jane-doe-smith');
  assert.equal(slugify(''), '');
});

test('generateDeterministicId creates stable keys regardless of row index', () => {
  const fields = {
    Date: '2026-11-04',
    Type: 'Spontaneous',
    'Pacific time (source)': '6:00 AM'
  };

  const id1 = generateDeterministicId('Morning Report', fields, new Set());
  assert.equal(id1, 'mr-2026-11-04-spontaneous-6-00-am');

  // Even if evaluated in another context, same fields produce the exact same ID
  const id2 = generateDeterministicId('Morning Report', fields, new Set());
  assert.equal(id1, id2);
});

test('Shelly bulk upload scenario: 60 rows added in batch without _cps_id get collision-free IDs', () => {
  // Simulate Shelly pasting 60 future dates (Nov & Dec 2026)
  const rows = [
    [], [], [], [], [], [], // 6 header rows
  ];

  for (let d = 1; d <= 60; d++) {
    const dayStr = d <= 30 ? `2026-11-${String(d).padStart(2, '0')}` : `2026-12-${String(d - 30).padStart(2, '0')}`;
    rows.push([
      dayStr,
      '6:00 AM',
      '9:00 AM',
      'Spontaneous',
      '',
      'Rabih',
      'Presenter TBD'
    ]);
  }

  const result = parseMorningReport(rows);
  assert.equal(result.records.length, 60);

  const stableIds = result.records.map(r => r.stableId);
  const uniqueIds = new Set(stableIds);

  // Every single row must have a unique stable ID
  assert.equal(uniqueIds.size, 60, 'All 60 bulk-added rows must have distinct stable IDs');
  assert.ok(stableIds[0].startsWith('mr-2026-11-01'));
  assert.ok(stableIds[59].startsWith('mr-2026-12-30'));
});

test('Duplicate date and time in bulk additions receive deterministic sequence disambiguation', () => {
  const seen = new Set();
  const fields = {
    Date: '2026-12-15',
    Type: 'Spontaneous',
    'Pacific time (source)': '6:00 AM'
  };

  const id1 = generateDeterministicId('Morning Report', fields, seen);
  const id2 = generateDeterministicId('Morning Report', fields, seen);
  const id3 = generateDeterministicId('Morning Report', fields, seen);

  assert.equal(id1, 'mr-2026-12-15-spontaneous-6-00-am');
  assert.equal(id2, 'mr-2026-12-15-spontaneous-6-00-am-seq2');
  assert.equal(id3, 'mr-2026-12-15-spontaneous-6-00-am-seq3');
});

test('Physical row shifting does NOT alter the record stableId', () => {
  const rowA = ['2026-12-25', '6:00 AM', '9:00 AM', 'Special', '', 'Rabih'];

  // Positioned at row 10
  const batch1 = [[], [], [], [], [], [], ...Array(3).fill([]), rowA];
  const parsed1 = parseMorningReport(batch1);
  const idAtRow10 = parsed1.records[0].stableId;

  // Positioned at row 50 (Shelly inserted 40 rows above it)
  const batch2 = [[], [], [], [], [], [], ...Array(43).fill([]), rowA];
  const parsed2 = parseMorningReport(batch2);
  const idAtRow50 = parsed2.records[0].stableId;

  assert.equal(idAtRow10, idAtRow50, 'Stable ID must be completely invariant to row movement');
});
