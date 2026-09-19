'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../session-core.js');
const sheetsReader = require('../api/_lib/sheets-reader.cjs');
const mutateHandler = require('../api/mutate.js');
const { createSessionToken } = require('../api/_lib/auth-session.cjs');

function mockReqRes(options = {}) {
  const { method = 'POST', body = null, headers = {} } = options;
  const reqHeaders = { 'content-type': 'application/json', ...headers };
  if (body && body.user && !reqHeaders.authorization) {
    reqHeaders.authorization = `Bearer ${createSessionToken(body.user)}`;
  }
  const req = {
    method,
    headers: reqHeaders,
    body
  };
  let statusCode = 200;
  let headersSent = {};
  let bodySent = '';
  const res = {
    setHeader(k, v) { headersSent[k.toLowerCase()] = v; },
    get statusCode() { return statusCode; },
    set statusCode(v) { statusCode = v; },
    end(chunk) { if (chunk) bodySent += chunk; }
  };
  return {
    req,
    res,
    getResult: () => ({
      status: statusCode,
      headers: headersSent,
      body: bodySent ? JSON.parse(bodySent) : null
    })
  };
}

// Test A: Same-date conversion during US summer (Daylight Saving Time)
test('Test A: computeSheetsTimes calculates correct PDT/EDT on same calendar date', () => {
  const res = core.computeSheetsTimes('2026-09-21', 9, 0, 'America/Los_Angeles');
  assert.equal(res.ptValue, '9:00 AM');
  assert.equal(res.ptZone, 'PDT');
  assert.equal(res.ptDate, '2026-09-21');
  assert.equal(res.etValue, '12:00 PM');
  assert.equal(res.etZone, 'EDT');
  assert.equal(res.etDate, '2026-09-21');
  assert.equal(res.instantUtc, '2026-09-21T16:00:00.000Z');
});

// Test B: Local date is 1 day ahead of ET (Johannesburg UTC+2 at 01:00 on Sep 24 is Sep 23 in NY and LA)
test('Test B: Cross-midnight conversion when viewer local date is 1 day ahead of ET', () => {
  // Johannesburg at 01:00 AM on 2026-09-24 is 2026-09-23 23:00:00 UTC
  const res = core.computeSheetsTimes('2026-09-24', 1, 0, 'Africa/Johannesburg');
  assert.equal(res.instantUtc, '2026-09-23T23:00:00.000Z');
  assert.equal(res.etValue, '7:00 PM');
  assert.equal(res.etZone, 'EDT');
  assert.equal(res.etDate, '2026-09-23');
  assert.equal(res.ptValue, '4:00 PM');
  assert.equal(res.ptZone, 'PDT');
  assert.equal(res.ptDate, '2026-09-23');
});

// Test C: Local date is 1 day ahead of PT (Sydney AEST UTC+10 at 07:00 on Sep 24 is Sep 23 in LA)
test('Test C: Cross-midnight conversion when viewer local date is 1 day ahead of PT', () => {
  // Sydney at 07:00 AM on 2026-09-24 is 2026-09-23 21:00:00 UTC
  const res = core.computeSheetsTimes('2026-09-24', 7, 0, 'Australia/Sydney');
  assert.equal(res.instantUtc, '2026-09-23T21:00:00.000Z');
  assert.equal(res.etValue, '5:00 PM');
  assert.equal(res.etZone, 'EDT');
  assert.equal(res.etDate, '2026-09-23');
  assert.equal(res.ptValue, '2:00 PM');
  assert.equal(res.ptZone, 'PDT');
  assert.equal(res.ptDate, '2026-09-23');
});

// Test D: Editing directly in Eastern Time with ET calendar date
test('Test D: Editing session time directly in Eastern Time', () => {
  const res = core.computeSheetsTimes('2026-09-23', 19, 0, 'America/New_York');
  assert.equal(res.instantUtc, '2026-09-23T23:00:00.000Z');
  assert.equal(res.etValue, '7:00 PM');
  assert.equal(res.etZone, 'EDT');
  assert.equal(res.etDate, '2026-09-23');
  assert.equal(res.ptValue, '4:00 PM');
  assert.equal(res.ptZone, 'PDT');
  assert.equal(res.ptDate, '2026-09-23');
});

// Test E: Editing directly in Pacific Time with PT calendar date
test('Test E: Editing session time directly in Pacific Time', () => {
  const res = core.computeSheetsTimes('2026-09-23', 16, 0, 'America/Los_Angeles');
  assert.equal(res.instantUtc, '2026-09-23T23:00:00.000Z');
  assert.equal(res.ptValue, '4:00 PM');
  assert.equal(res.ptZone, 'PDT');
  assert.equal(res.ptDate, '2026-09-23');
  assert.equal(res.etValue, '7:00 PM');
  assert.equal(res.etZone, 'EDT');
  assert.equal(res.etDate, '2026-09-23');
});

// Test F: Switching timezones without editing preserves exact same canonical instant
test('Test F: Switching between input zones without edits preserves exact canonical instant', () => {
  const canonicalInstant = '2026-09-23T23:00:00.000Z';
  const johannesburgParts = core.getZoneDateTimeParts(canonicalInstant, 'Africa/Johannesburg');
  assert.equal(johannesburgParts.dateIso, '2026-09-24');
  assert.equal(johannesburgParts.hour24, 1);
  assert.equal(johannesburgParts.minute, 0);

  const nyParts = core.getZoneDateTimeParts(canonicalInstant, 'America/New_York');
  assert.equal(nyParts.dateIso, '2026-09-23');
  assert.equal(nyParts.hour24, 19);
  assert.equal(nyParts.minute, 0);

  const laParts = core.getZoneDateTimeParts(canonicalInstant, 'America/Los_Angeles');
  assert.equal(laParts.dateIso, '2026-09-23');
  assert.equal(laParts.hour24, 16);
  assert.equal(laParts.minute, 0);

  // Round-trip resolve back from each zone to instant
  const resolvedFromJoburg = new Date(core.resolveInstantFromZone(johannesburgParts.dateIso, johannesburgParts.hour24, johannesburgParts.minute, 'Africa/Johannesburg')).toISOString();
  const resolvedFromNy = new Date(core.resolveInstantFromZone(nyParts.dateIso, nyParts.hour24, nyParts.minute, 'America/New_York')).toISOString();
  const resolvedFromLa = new Date(core.resolveInstantFromZone(laParts.dateIso, laParts.hour24, laParts.minute, 'America/Los_Angeles')).toISOString();

  assert.equal(resolvedFromJoburg, canonicalInstant);
  assert.equal(resolvedFromNy, canonicalInstant);
  assert.equal(resolvedFromLa, canonicalInstant);
});

// Test G: Summer vs Winter DST labels
test('Test G: Correct timezone labels during US Summer (PDT/EDT) vs Winter (PST/EST)', () => {
  const summer = core.computeSheetsTimes('2026-07-15', 9, 0, 'America/Los_Angeles');
  assert.equal(summer.ptZone, 'PDT');
  assert.equal(summer.etZone, 'EDT');

  const winter = core.computeSheetsTimes('2026-12-15', 9, 0, 'America/Los_Angeles');
  assert.equal(winter.ptZone, 'PST');
  assert.equal(winter.etZone, 'EST');
});

// Test H1: Safe row matching returns candidate on match, and fails safely on duplicate
test('Test H1: Safe row matching fails safely without guessing on ambiguous rows', () => {
  const mockRowsWithDuplicate = [
    ['Header', 'ColB', 'ColC'],
    ['Header2', 'ColB', 'ColC'],
    ['Header3', 'ColB', 'ColC'],
    ['Header4', 'ColB', 'ColC'],
    ['Header5', 'ColB', 'ColC'],
    ['Header6', 'ColB', 'ColC'],
    // Row 7 (index 6)
    ['Monday - September 21, 2026', '9:00 AM', '12:00 PM', 'General Medicine', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    // Row 8 (index 7) duplicate date and type
    ['Monday - September 21, 2026', '9:00 AM', '12:00 PM', 'General Medicine', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
  ];

  // Requesting a modified session time with mr-2026-09-21-general-medicine finds ambiguous match (2 candidates) -> returns null safely
  const result = sheetsReader.scanRowsForStableId(mockRowsWithDuplicate, 'Morning Report', 'mr-2026-09-21-general-medicine-10-00-am-pt');
  assert.equal(result, null, 'Ambiguous row matching must fail safely (return null) rather than guess');

  // Single unique candidate matches successfully
  const mockRowsSingle = [
    ['Header', 'ColB', 'ColC'],
    ['Header2', 'ColB', 'ColC'],
    ['Header3', 'ColB', 'ColC'],
    ['Header4', 'ColB', 'ColC'],
    ['Header5', 'ColB', 'ColC'],
    ['Header6', 'ColB', 'ColC'],
    // Row 7 (index 6)
    ['Monday - September 21, 2026', '9:00 AM', '12:00 PM', 'General Medicine', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
  ];
  const matchedSingle = sheetsReader.scanRowsForStableId(mockRowsSingle, 'Morning Report', 'mr-2026-09-21-general-medicine-10-00-am-pt');
  assert.ok(matchedSingle, 'Unique row candidate should match safely');
  assert.equal(matchedSingle.rowNumber, 7);
  assert.equal(matchedSingle.values[0], 'Monday - September 21, 2026');
});

// Test H2: Authentication enforcement: unauthenticated rejected with 401; authenticated member accepted
test('Test H2: Authentication enforcement on mutation endpoint', async () => {
  // 1. Unauthenticated request without Authorization header or cookie
  const unauth = mockReqRes({
    headers: {}, // No auth
    body: {
      dataset: 'Morning Report',
      stableId: 'mr-2026-09-21-general-medicine-9-00-am-pt',
      fields: { 'Pacific time (source)': '10:00 AM' }
    }
  });
  await mutateHandler(unauth.req, unauth.res);
  assert.equal(unauth.getResult().status, 401, 'Unauthenticated request must receive 401 UNAUTHORIZED');

  // 2. Authenticated CPS Member (role: 'member') is recognized and authorized
  const authMember = mockReqRes({
    body: {
      dataset: 'Morning Report',
      stableId: 'non-existent-id',
      fields: { 'Pacific time (source)': '10:00 AM' },
      user: {
        name: 'Regular CPS Member',
        email: 'member@cps.org',
        role: 'member',
        isAuthenticated: true
      }
    }
  });
  await mutateHandler(authMember.req, authMember.res);
  // It passed the 401 auth gate! (It might fail with 404 row not found or 503 sheets not configured, but NOT 401)
  assert.notEqual(authMember.getResult().status, 401, 'Authenticated CPS member must pass authentication check');
});
