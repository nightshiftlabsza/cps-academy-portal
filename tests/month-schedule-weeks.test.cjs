'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const MR = require('../morning-report.js');

test('getMonthCalendarWeeks correctly splits 6-week months', () => {
  // August 2026 starts on Saturday Aug 1 (UTC) and has 31 days.
  // Week 1: Aug 1 - Aug 2 (Sat - Sun)
  // Week 2: Aug 3 - Aug 9 (Mon - Sun)
  // Week 3: Aug 10 - Aug 16 (Mon - Sun)
  // Week 4: Aug 17 - Aug 23 (Mon - Sun)
  // Week 5: Aug 24 - Aug 30 (Mon - Sun)
  // Week 6: Aug 31 - Aug 31 (Mon)
  const augWeeks = MR.getMonthCalendarWeeks('2026-08');
  assert.equal(augWeeks.length, 6);
  assert.equal(augWeeks[0].startDate, '2026-08-01');
  assert.equal(augWeeks[0].endDate, '2026-08-02');
  assert.deepEqual(augWeeks[0].days, ['2026-08-01', '2026-08-02']);

  assert.equal(augWeeks[1].startDate, '2026-08-03');
  assert.equal(augWeeks[1].endDate, '2026-08-09');
  assert.equal(augWeeks[1].days.length, 7);

  assert.equal(augWeeks[5].startDate, '2026-08-31');
  assert.equal(augWeeks[5].endDate, '2026-08-31');
  assert.deepEqual(augWeeks[5].days, ['2026-08-31']);
});

test('getMonthCalendarWeeks correctly splits 5-week months', () => {
  // September 2026 starts Tuesday Sep 1 and has 30 days.
  // Week 1: Sep 1 - Sep 6 (Tue - Sun)
  // Week 2: Sep 7 - Sep 13 (Mon - Sun)
  // Week 3: Sep 14 - Sep 20 (Mon - Sun)
  // Week 4: Sep 21 - Sep 27 (Mon - Sun)
  // Week 5: Sep 28 - Sep 30 (Mon - Wed)
  const sepWeeks = MR.getMonthCalendarWeeks('2026-09');
  assert.equal(sepWeeks.length, 5);
  assert.equal(sepWeeks[0].startDate, '2026-09-01');
  assert.equal(sepWeeks[0].endDate, '2026-09-06');
  assert.equal(sepWeeks[4].startDate, '2026-09-28');
  assert.equal(sepWeeks[4].endDate, '2026-09-30');
});

test('getMonthCalendarWeeks correctly splits 4-week months (exact 28 days Mon-Sun)', () => {
  // February 2021 started on Monday Feb 1 and had 28 days (exact 4 weeks).
  const febWeeks = MR.getMonthCalendarWeeks('2021-02');
  assert.equal(febWeeks.length, 4);
  assert.equal(febWeeks[0].startDate, '2021-02-01');
  assert.equal(febWeeks[0].endDate, '2021-02-07');
  assert.equal(febWeeks[3].startDate, '2021-02-22');
  assert.equal(febWeeks[3].endDate, '2021-02-28');
});

test('all week days strictly stay inside the target month boundary', () => {
  const months = ['2026-01', '2026-02', '2026-05', '2026-08', '2026-09', '2026-12'];
  for (const m of months) {
    const weeks = MR.getMonthCalendarWeeks(m);
    for (const w of weeks) {
      for (const d of w.days) {
        assert.ok(d.startsWith(m), `Day ${d} must strictly belong to month ${m}`);
      }
      assert.ok(w.startDate.startsWith(m));
      assert.ok(w.endDate.startsWith(m));
    }
  }
});

test('mrShiftMonth and year boundaries navigate correctly across Dec/Jan', () => {
  assert.equal(MR.mrShiftMonth('2026-12', 1), '2027-01');
  assert.equal(MR.mrShiftMonth('2027-01', -1), '2026-12');
  assert.equal(MR.mrShiftMonth('2026-09', 12), '2027-09');
  assert.equal(MR.mrShiftMonth('2026-09', -12), '2025-09');
});

test('formatMonthWeekLabel handles intra-month and cross-month spans', () => {
  assert.equal(MR.formatMonthWeekLabel('2026-09-01', '2026-09-06'), 'Sep 1 – 6');
  assert.equal(MR.formatMonthWeekLabel('2026-08-31', '2026-08-31'), 'Aug 31 – 31');
});
