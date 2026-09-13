'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SessionCore = require('../session-core.js');
const workbook = require('../workbook.json');

test('Week boundary convention strictly enforces Monday 00:00 UTC to Sunday 23:59 UTC', () => {
  // Test Monday (start)
  const mon = SessionCore.getWeekBounds('2026-09-07');
  assert.equal(mon.start, '2026-09-07', 'Monday must be week start');
  assert.equal(mon.end, '2026-09-13', 'Sunday must be week end');
  assert.match(mon.convention, /Monday to Sunday/i);

  // Test Sunday (end)
  const sun = SessionCore.getWeekBounds('2026-09-13');
  assert.equal(sun.start, '2026-09-07', 'Sunday must map to the same week starting previous Monday');
  assert.equal(sun.end, '2026-09-13', 'Sunday must be week end');

  // Test mid-week days (Tuesday, Wednesday, Saturday)
  for (const mid of ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']) {
    const bounds = SessionCore.getWeekBounds(mid);
    assert.equal(bounds.start, '2026-09-07', `${mid} start must be Monday 2026-09-07`);
    assert.equal(bounds.end, '2026-09-13', `${mid} end must be Sunday 2026-09-13`);
  }
});

test('Year boundary and leap day week calculations are preserved without drift', () => {
  // Leap day 2028-02-29 is Tuesday
  const leap = SessionCore.getWeekBounds('2028-02-29');
  assert.equal(leap.start, '2028-02-28');
  assert.equal(leap.end, '2028-03-05');

  // Year transition: 2026-01-01 is Thursday
  const yearEnd = SessionCore.getWeekBounds('2026-01-01');
  assert.equal(yearEnd.start, '2025-12-29');
  assert.equal(yearEnd.end, '2026-01-04');

  // 2020-12-31 is Thursday
  const leapYearEnd = SessionCore.getWeekBounds('2020-12-31');
  assert.equal(leapYearEnd.start, '2020-12-28');
  assert.equal(leapYearEnd.end, '2021-01-03');
});

test('addWeeks shifts weeks by strictly 7 days without arbitrary date fragmentation', () => {
  assert.equal(SessionCore.addWeeks('2026-09-07', 1), '2026-09-14');
  assert.equal(SessionCore.addWeeks('2026-09-07', -1), '2026-08-31');
  assert.equal(SessionCore.addWeeks('2026-09-07', 4), '2026-10-05');
  assert.equal(SessionCore.addWeeks('2026-09-07', 0), '2026-09-07');
});

test('Invalid, empty or ambiguous dates return null and do not invent weeks', () => {
  assert.equal(SessionCore.getWeekBounds(''), null);
  assert.equal(SessionCore.getWeekBounds('TBD'), null);
  assert.equal(SessionCore.getWeekBounds('#VALUE!'), null);
  assert.equal(SessionCore.getWeekBounds('not-a-date'), null);
  assert.equal(SessionCore.getWeekBounds('02/03/2026'), null); // ambiguous US date
});

test('Compound child sessions (split rows) belong to their respective week and are never dropped', () => {
  const r12 = workbook['Morning Report'].records.find(r => r.row === 12);
  assert.ok(r12, 'Row 12 exists in snapshot');

  const children = SessionCore.splitMorningReport(r12);
  assert.equal(children.length, 2, 'Row 12 produces exactly 2 child sessions');

  const targetWeek = SessionCore.getWeekBounds('2026-10-26');
  assert.equal(targetWeek.start, '2026-10-26');
  assert.equal(targetWeek.end, '2026-11-01');

  // Both child sessions have date 2026-10-26 and belong to the week
  for (const child of children) {
    const childDate = SessionCore.parseDate(child.fields.Date);
    assert.equal(childDate, '2026-10-26');
    assert.ok(childDate >= targetWeek.start && childDate <= targetWeek.end, `Child session ${child.id} must be within week`);
  }
});

test('Unresolved source dates (e.g. row 1830 #VALUE!) are detected and separated from calendar weeks', () => {
  const allSplit = workbook['Morning Report'].records.flatMap(r => SessionCore.splitMorningReport(r));
  const unresolved = allSplit.filter(r => !SessionCore.parseDate(r.fields.Date));

  assert.ok(unresolved.length >= 1, 'At least 1 unresolved date record in workbook');
  const r1830 = unresolved.find(r => r.row === 1830 || r.id === 'Morning Report:1830');
  assert.ok(r1830, 'Row 1830 is detected among unresolved');
  assert.equal(r1830.fields.Date, '#VALUE!');
  assert.equal(SessionCore.getWeekBounds(r1830.fields.Date), null, 'Unresolved date cannot be assigned a week');
});

test('All history encompasses sessions across the full snapshot range (2020 - 2026)', () => {
  const allSplit = workbook['Morning Report'].records.flatMap(r => SessionCore.splitMorningReport(r));
  const dated = allSplit.map(r => SessionCore.parseDate(r.fields.Date)).filter(Boolean);

  assert.ok(dated.length > 2500, `Total dated sessions: ${dated.length}`);
  const min = dated.reduce((a, b) => a < b ? a : b);
  const max = dated.reduce((a, b) => a > b ? a : b);

  assert.equal(min, '2020-03-15', 'Earliest session in Morning Report history is 2020-03-15');
  assert.equal(max, '2026-10-31', 'Latest session in Morning Report snapshot is 2026-10-31');
});
