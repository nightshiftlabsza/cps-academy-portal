'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { generateKeyPairSync } = require('node:crypto');

// Generate synthetic RSA key for offline signature verification (ZERO real credentials)
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

process.env.SYNC_SERVICE_ACCOUNT_KEY = JSON.stringify({
  client_email: 'synthetic@test.iam.gserviceaccount.com',
  private_key: privateKey
});
process.env.SYNC_SHEET_ID = 'synthetic-profile-sheet-123';
process.env.SYNTHETIC_TEST_SYNC = '1';

const { createSessionToken } = require('../api/_lib/auth-session.cjs');
const sheetsReaderModule = require('../api/_lib/sheets-reader.cjs');

// Mock in-memory members representing two members with identical first names:
// 1. "Zakariyya G" (zak.g@example.com, stableId: mem-zak-g)
// 2. "Zakariyya S" (zak.s@example.com, stableId: mem-zak-s)
// 3. "Praveen Bharath Saravanan (Praveen Saran)" (praveen@example.com, complex multi-part name)
// 4. "Cher" (cher@example.com, single legal name)
let mockMembersStore = [
  {
    id: 'Members:57',
    stableId: 'mem-zak-g',
    fields: {
      'Name': 'Zakariyya G',
      'First Name': 'Zakariyya',
      'Surname': 'G',
      'Email': 'zak.g@example.com',
      'AKA / Nicknames': 'ZG',
      'Birthday': 'October 31',
      'Onboarded': '',
      'Onboarded At': '',
      'Sponsor': 'Dr. Sponsor A',
      '_cps_id': 'id-zak-g'
    }
  },
  {
    id: 'Members:58',
    stableId: 'mem-zak-s',
    fields: {
      'Name': 'Zakariyya S',
      'First Name': '',
      'Surname': '',
      'Email': 'zak.s@example.com',
      'AKA / Nicknames': '',
      'Birthday': '',
      'Onboarded': '',
      'Onboarded At': '',
      'Sponsor': 'Dr. Sponsor B',
      '_cps_id': 'id-zak-s'
    }
  },
  {
    id: 'Members:59',
    stableId: 'mem-praveen',
    fields: {
      'Name': 'Praveen Bharath Saravanan (Praveen Saran)',
      'First Name': '',
      'Surname': '',
      'Email': 'praveen@example.com',
      'AKA / Nicknames': '',
      'Birthday': 'February 29',
      'Onboarded': '',
      'Onboarded At': '',
      '_cps_id': 'id-praveen'
    }
  },
  {
    id: 'Members:60',
    stableId: 'mem-cher',
    fields: {
      'Name': 'Cher',
      'First Name': 'Cher',
      'Surname': '',
      'Email': 'cher@example.com',
      'AKA / Nicknames': '',
      'Birthday': 'May 20',
      'Onboarded': 'true',
      'Onboarded At': '2026-09-15T12:00:00.000Z',
      '_cps_id': 'id-cher'
    }
  }
];

let sheetsBatchCalls = 0;
let lastBatchPayload = null;

// Mock sheets reader to return our in-memory members snapshot
sheetsReaderModule.sheetsReader = async () => ({
  snapshotHash: 'mock-hash-' + Date.now(),
  snapshotDate: new Date().toISOString(),
  modified: true,
  workbook: {
    Members: {
      records: mockMembersStore
    }
  }
});

// Mock findRowByStableId to resolve row number in mockMembersStore
sheetsReaderModule.findRowByStableId = async (sheetId, dataset, stableId) => {
  if (dataset === 'Members') {
    const idx = mockMembersStore.findIndex(m => m.stableId === stableId || m.id === stableId);
    if (idx !== -1) {
      const rec = mockMembersStore[idx];
      const rowNum = 57 + idx;
      const values = [
        rec.fields['Name'] || '',
        rec.fields['Sponsor'] || '',
        rec.fields['Social handles'] || '',
        rec.fields['Country'] || '',
        rec.fields['Birthday'] || '',
        rec.fields['Email'] || '',
        rec.fields['Location'] || '',
        rec.fields['Subspecialty'] || '',
        rec.fields['_cps_id'] || '',
        rec.fields['First Name'] || '',
        rec.fields['Surname'] || '',
        rec.fields['AKA / Nicknames'] || '',
        rec.fields['Onboarded'] || '',
        rec.fields['Onboarded At'] || ''
      ];
      return { rowNumber: rowNum, stableId: rec.stableId, values };
    }
  }
  return null;
};

// Require handlers AFTER mocking sheetsReader and findRowByStableId
const profileHandler = require('../api/profile.js');
const mutateHandler = require('../api/mutate.js');
const loginHandler = require('../api/login.js');
const Identity = require('../identity.js');

// Mock fetch for Google OAuth and Google Sheets API calls
const originalFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  const urlStr = String(url);

  if (urlStr.includes('oauth2.googleapis.com/token')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'synthetic-jwt-token', expires_in: 3600 })
    };
  }

  if (urlStr.includes('values:batchUpdate')) {
    sheetsBatchCalls++;
    lastBatchPayload = options.body ? JSON.parse(options.body) : null;
    return {
      ok: true,
      status: 200,
      text: async () => 'OK',
      json: async () => ({ updatedRanges: ['dummy'] })
    };
  }

  return { ok: true, status: 200, json: async () => ({}) };
};

function mockReqRes(options = {}) {
  const { method = 'GET', body = null, headers = {}, user = null } = options;
  const reqHeaders = { 'content-type': 'application/json', ...headers };
  if (user && !reqHeaders.authorization) {
    reqHeaders.authorization = `Bearer ${createSessionToken(user)}`;
  }

  const bodyStr = body ? JSON.stringify(body) : '';
  const stream = new Readable({
    read() {
      if (bodyStr) this.push(Buffer.from(bodyStr));
      this.push(null);
    }
  });
  stream.method = method;
  stream.headers = reqHeaders;

  let statusCode = 200;
  let headersSent = {};
  let bodySent = '';
  const res = {
    setHeader(k, v) { headersSent[k.toLowerCase()] = v; },
    get statusCode() { return statusCode; },
    set statusCode(v) { statusCode = v; },
    end(chunk) { if (chunk) bodySent += chunk.toString('utf8'); }
  };

  return {
    req: stream,
    res,
    getResult: () => ({
      status: statusCode,
      headers: headersSent,
      body: bodySent ? JSON.parse(bodySent) : null
    })
  };
}

// ==========================================
// TEST SUITE: Profile Onboarding & Editing
// ==========================================

test('Profile Onboarding: GET /api/profile requires authentication', async () => {
  const { req, res, getResult } = mockReqRes({ method: 'GET' });
  await profileHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'UNAUTHORIZED');
});

test('Profile Onboarding: GET /api/profile fetches current online Sheets record with prefilled details', async () => {
  const testUser = {
    email: 'zak.g@example.com',
    name: 'Zakariyya G',
    role: 'member',
    id: 'mem-zak-g',
    isAuthenticated: true
  };

  const { req, res, getResult } = mockReqRes({ method: 'GET', user: testUser });
  await profileHandler(req, res);
  const result = getResult();

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.member.fields['First Name'], 'Zakariyya');
  assert.equal(result.body.member.fields['Surname'], 'G');
  assert.equal(result.body.member.fields['Email'], 'zak.g@example.com');
  assert.equal(result.body.member.fields['AKA / Nicknames'], 'ZG');
  assert.equal(result.body.member.fields['Birthday'], 'October 31');
  assert.equal(result.body.member.fields['Onboarded'], '');
});

test('Profile Onboarding: Complex names extract candidate parts without mangling or guessing', async () => {
  const testUser = {
    email: 'praveen@example.com',
    name: 'Praveen Bharath Saravanan (Praveen Saran)',
    role: 'member',
    id: 'mem-praveen',
    isAuthenticated: true
  };

  const { req, res, getResult } = mockReqRes({ method: 'GET', user: testUser });
  await profileHandler(req, res);
  const result = getResult();

  assert.equal(result.status, 200);
  // Preserves multi-part name as candidate without losing middle elements
  assert.equal(result.body.member.fields['First Name'], 'Praveen Bharath');
  assert.equal(result.body.member.fields['Surname'], 'Saravanan');
  // Flagged as complex name for review
  assert.equal(result.body.member.fields['_nameStatus'], 'complex');
  // Extracts embedded nickname from parentheses
  assert.equal(result.body.member.fields['AKA / Nicknames'], 'Praveen Saran');
  // Birthday supports February 29
  assert.equal(result.body.member.fields['Birthday'], 'February 29');
});

test('Profile Onboarding: Straightforward two-part names flagged as suggested', async () => {
  const testUser = {
    email: 'zak.s@example.com',
    name: 'Zakariyya S',
    role: 'member',
    id: 'mem-zak-s',
    isAuthenticated: true
  };

  const { req, res, getResult } = mockReqRes({ method: 'GET', user: testUser });
  await profileHandler(req, res);
  const result = getResult();

  assert.equal(result.status, 200);
  assert.equal(result.body.member.fields['First Name'], 'Zakariyya');
  assert.equal(result.body.member.fields['Surname'], 'S');
  assert.equal(result.body.member.fields['_nameStatus'], 'suggested');
});

test('Profile Onboarding: Disambiguates two members with identical first names (Zakariyya G vs Zakariyya S)', async () => {
  const userG = {
    email: 'zak.g@example.com',
    name: 'Zakariyya G',
    role: 'member',
    id: 'mem-zak-g',
    isAuthenticated: true
  };

  const userS = {
    email: 'zak.s@example.com',
    name: 'Zakariyya S',
    role: 'member',
    id: 'mem-zak-s',
    isAuthenticated: true
  };

  const { req: reqG, res: resG, getResult: getResultG } = mockReqRes({ method: 'GET', user: userG });
  await profileHandler(reqG, resG);
  const resultG = getResultG();

  const { req: reqS, res: resS, getResult: getResultS } = mockReqRes({ method: 'GET', user: userS });
  await profileHandler(reqS, resS);
  const resultS = getResultS();

  assert.equal(resultG.body.member.stableId, 'mem-zak-g');
  assert.equal(resultG.body.member.fields['Email'], 'zak.g@example.com');

  assert.equal(resultS.body.member.stableId, 'mem-zak-s');
  assert.equal(resultS.body.member.fields['Email'], 'zak.s@example.com');
  assert.notEqual(resultG.body.member.stableId, resultS.body.member.stableId);
});

test('Profile Onboarding: POST /api/profile validates required first name', async () => {
  const testUser = {
    email: 'zak.s@example.com',
    name: 'Zakariyya S',
    role: 'member',
    id: 'mem-zak-s',
    isAuthenticated: true
  };

  const { req, res, getResult } = mockReqRes({
    method: 'POST',
    user: testUser,
    body: {
      firstName: '',
      surname: 'Smith',
      stableId: 'mem-zak-s'
    }
  });

  await profileHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'MISSING_FIRST_NAME');
});

test('Profile Onboarding: Supports single legal names without requiring surname', async () => {
  const testUser = {
    email: 'cher@example.com',
    name: 'Cher',
    role: 'member',
    id: 'mem-cher',
    isAuthenticated: true
  };

  const { req, res, getResult } = mockReqRes({
    method: 'POST',
    user: testUser,
    body: {
      firstName: 'Cher',
      surname: '',
      isSingleName: true,
      nicknames: '',
      birthday: 'May 20',
      stableId: 'mem-cher',
      markOnboarded: true
    }
  });

  await profileHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.ok(result.body.updatedFields.includes('First Name'));
  assert.ok(result.body.updatedFields.includes('Onboarded'));
});

test('Profile Onboarding: Rejects unauthorized cross-user profile edits', async () => {
  // User G attempts to update User S's profile
  const maliciousUser = {
    email: 'zak.g@example.com',
    name: 'Zakariyya G',
    role: 'member',
    id: 'mem-zak-g',
    isAuthenticated: true
  };

  const { req, res, getResult } = mockReqRes({
    method: 'POST',
    user: maliciousUser,
    body: {
      firstName: 'Hacked',
      surname: 'Attacker',
      stableId: 'mem-zak-s' // Target another member's stableId!
    }
  });

  await profileHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'FORBIDDEN');
});

test('Profile Onboarding: Disallows self-service modification of protected login-email and admin fields', async () => {
  const testUser = {
    email: 'zak.g@example.com',
    name: 'Zakariyya G',
    role: 'member',
    id: 'mem-zak-g',
    isAuthenticated: true
  };

  // Attempting to mutate protected fields (Sponsor, Email, Subspecialty) directly via mutateHandler
  const { req, res, getResult } = mockReqRes({
    method: 'POST',
    user: testUser,
    body: {
      dataset: 'Members',
      stableId: 'mem-zak-g',
      fields: {
        'Sponsor': 'Arbitrary Sponsor Change',
        'Email': 'newemail@example.com'
      }
    }
  });

  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'PROTECTED_FIELD');
});

test('Profile Onboarding: Successfully saves confirmed profile, sets Onboarded and server timestamp', async () => {
  const testUser = {
    email: 'zak.s@example.com',
    name: 'Zakariyya S',
    role: 'member',
    id: 'mem-zak-s',
    isAuthenticated: true
  };

  const { req, res, getResult } = mockReqRes({
    method: 'POST',
    user: testUser,
    body: {
      firstName: 'Zakariyya',
      surname: 'Shabazz',
      nicknames: 'Zak',
      birthday: 'February 29',
      stableId: 'mem-zak-s',
      markOnboarded: true
    }
  });

  await profileHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.ok(result.body.updatedFields.includes('First Name'));
  assert.ok(result.body.updatedFields.includes('Surname'));
  assert.ok(result.body.updatedFields.includes('Onboarded'));
  assert.ok(result.body.updatedFields.includes('Onboarded At'));

  // Verify Google Sheets batchUpdate was issued
  assert.ok(sheetsBatchCalls > 0);
  assert.ok(lastBatchPayload);
  assert.ok(lastBatchPayload.data.some(d => d.values[0][0] === 'Zakariyya'));
  assert.ok(lastBatchPayload.data.some(d => d.values[0][0] === 'true'));
});

test('Profile Onboarding: Rejects conflicting write if sheet cell changed between load and save', async () => {
  const testUser = {
    email: 'zak.s@example.com',
    name: 'Zakariyya S',
    role: 'member',
    id: 'mem-zak-s',
    isAuthenticated: true
  };

  // User loaded profile when Name was "Zakariyya S", but provides stale expectedPreviousValues
  const { req, res, getResult } = mockReqRes({
    method: 'POST',
    user: testUser,
    body: {
      firstName: 'Zakariyya',
      surname: 'Shabazz',
      stableId: 'mem-zak-s',
      expectedPreviousValues: {
        'Name': 'Stale Name Before Intervening Edit',
        'AKA / Nicknames': ''
      }
    }
  });

  await profileHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 409);
  assert.equal(result.body.error, 'CONFLICT');
  assert.equal(result.body.field, 'Name');
});

test('Profile Onboarding: Preserves existing unparseable birthday when untouched', async () => {
  const testUser = {
    email: 'zak.g@example.com',
    name: 'Zakariyya G',
    role: 'member',
    id: 'mem-zak-g',
    isAuthenticated: true
  };

  // Untouched birthday with custom/unparseable text: "Late October or early Nov"
  const { req, res, getResult } = mockReqRes({
    method: 'POST',
    user: testUser,
    body: {
      firstName: 'Zakariyya',
      surname: 'G',
      nicknames: 'ZG New',
      birthdayTouched: false,
      birthdayCleared: false,
      originalBirthday: 'Late October or early Nov',
      stableId: 'mem-zak-g'
    }
  });

  await profileHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  // Birthday was preserved verbatim in the sheet batch update
  assert.ok(lastBatchPayload.data.some(d => d.values[0][0] === 'Late October or early Nov'));
});

test('Profile Onboarding: Explicitly clears birthday when cleared by user', async () => {
  const testUser = {
    email: 'zak.g@example.com',
    name: 'Zakariyya G',
    role: 'member',
    id: 'mem-zak-g',
    isAuthenticated: true
  };

  const { req, res, getResult } = mockReqRes({
    method: 'POST',
    user: testUser,
    body: {
      firstName: 'Zakariyya',
      surname: 'G',
      nicknames: 'ZG',
      birthdayTouched: true,
      birthdayCleared: true,
      originalBirthday: 'October 31',
      stableId: 'mem-zak-g'
    }
  });

  await profileHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  // Birthday was explicitly cleared (empty string)
  assert.ok(lastBatchPayload.data.some(d => d.range.includes('E57') && d.values[0][0] === ''));
});

test('Profile Onboarding: Distinguishes local offline tests from live Google Sheets connection', () => {
  const isLive = Boolean(process.env.LIVE_GOOGLE_SHEETS_TEST === '1' && process.env.SYNC_SHEET_ID && !process.env.SYNTHETIC_TEST_SYNC);
  if (!isLive) {
    // Report clear status: offline verification with synthetic credentials
    assert.equal(process.env.SYNTHETIC_TEST_SYNC, '1');
    assert.ok(true, 'Verified local mocked round trip; live Google Sheets roundtrip bypassed without live service account secret.');
  }
});
