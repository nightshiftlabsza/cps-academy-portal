'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../session-core.js');
const makeRecord = (pt, et, date = '2026-09-15', extra = {}) => ({
  id: 'qa-tz:1',
  source: 'Morning Report',
  row: 1,
  fields: {
    Date: date,
    'Pacific time (source)': pt,
    'Eastern time (source)': et,
    Type: 'Spontaneous',
    Facilitator: 'Test Facilitator',
    ...extra
  },
  links: {},
  flags: []
});

test('canonical startUtc is strictly preserved across all projections', () => {
  const rec = makeRecord('08:00:00', '11:00:00', '2026-09-15');
  const parsed = core.parseSessionTime(rec);
  assert.equal(parsed.status, 'resolved');
  assert.equal(parsed.startUtc, '2026-09-15T15:00:00.000Z');

  const tzList = ['Africa/Johannesburg', 'America/New_York', 'America/Los_Angeles', 'Europe/London'];
  for (const tz of tzList) {
    const res = core.formatSessionTimeBreakdown(rec, tz);
    assert.equal(res.status, 'resolved');
    assert.equal(res.startUtc, parsed.startUtc);
    assert.equal(res.eastern.zoneId, 'America/New_York');
    assert.equal(res.pacific.zoneId, 'America/Los_Angeles');
    assert.equal(res.local.zoneId, tz);
  }
});

test('Africa/Johannesburg stays UTC+2 while US zones shift between daylight and standard time', () => {
  // Summer (US Daylight time: EDT UTC-4, PDT UTC-7)
  const summerRec = makeRecord('08:00:00', '11:00:00', '2026-09-15');
  const summer = core.formatSessionTimeBreakdown(summerRec, 'Africa/Johannesburg');
  assert.equal(summer.eastern.text, '11:00 AM EDT');
  assert.equal(summer.pacific.text, '8:00 AM PDT');
  assert.match(summer.local.text, /5:00\s*PM\s+(?:SASU|GMT\+2)/i);

  // Winter (US Standard time: EST UTC-5, PST UTC-8)
  const winterRec = makeRecord('08:00:00', '11:00:00', '2026-01-15');
  const winter = core.formatSessionTimeBreakdown(winterRec, 'Africa/Johannesburg');
  assert.equal(winter.eastern.text, '11:00 AM EST');
  assert.equal(winter.pacific.text, '8:00 AM PST');
  assert.match(winter.local.text, /6:00\s*PM\s*(?:SAST|GMT\+2)/i);
});

test('null, empty, or invalid user timezone explicitly falls back to institutional Eastern', () => {
  const rec = makeRecord('08:00:00', '11:00:00', '2026-09-15');

  // Null zone
  const resNull = core.formatSessionTimeBreakdown(rec, null);
  assert.equal(resNull.isLocal, false);
  assert.equal(resNull.fallbackMode, 'institutional-eastern');
  assert.equal(resNull.userZoneName, null);
  assert.equal(resNull.primaryText, '11:00 AM EDT');
  assert.equal(resNull.hasDisclosure, true);
  assert.equal(resNull.local, null);
  assert.equal(resNull.eastern.text, '11:00 AM EDT');
  assert.equal(resNull.pacific.text, '8:00 AM PDT');

  // Invalid zone string
  const resInvalid = core.formatSessionTimeBreakdown(rec, 'Invalid/NonExistent_Zone');
  assert.equal(resInvalid.isLocal, false);
  assert.equal(resInvalid.fallbackMode, 'institutional-eastern');
  assert.equal(resInvalid.userZoneName, null);
  assert.equal(resInvalid.primaryText, '11:00 AM EDT');
});

test('conflicting workbook clocks fail safely to unresolved Time TBD', () => {
  const contradictoryRec = makeRecord('08:00:00', '12:00:00', '2026-09-15');
  const res = core.formatSessionTimeBreakdown(contradictoryRec, 'America/New_York');
  assert.equal(res.status, 'unresolved');
  assert.equal(res.startUtc, null);
  assert.equal(res.primaryText, 'Time TBD');
  assert.equal(res.hasDisclosure, false);
  assert.equal(res.reason, 'Pacific and Eastern source clocks disagree.');
});

test('spring-forward nonexistent wall-clock times fail safely as unresolved', () => {
  // 2:30 AM PT on US Spring Forward date does not exist on clock
  const springFwdRec = makeRecord('2:30 AM PT', '', '2026-03-08');
  const res = core.formatSessionTimeBreakdown(springFwdRec, 'America/Los_Angeles');
  assert.equal(res.status, 'unresolved');
  assert.equal(res.startUtc, null);
  assert.equal(res.primaryText, 'Time TBD');
  assert.equal(res.hasDisclosure, false);
});

test('fall-back ambiguous repeated wall-clock time fails safely without cross-zone confirmation', () => {
  // 1:30 AM PT occurs twice during fall-back transition
  const fallBackRec = makeRecord('1:30 AM PT', '', '2026-11-01');
  const res = core.formatSessionTimeBreakdown(fallBackRec, 'America/Los_Angeles');
  assert.equal(res.status, 'unresolved');
  assert.equal(res.startUtc, null);
  assert.equal(res.primaryText, 'Time TBD');
  assert.equal(res.hasDisclosure, false);
});
