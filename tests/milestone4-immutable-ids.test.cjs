'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
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
process.env.SYNC_SHEET_ID = 'synthetic-sheet-id-12345';
process.env.SYNC_ALLOWED_TABS = 'Morning Report,CPS Academy VMRs';
process.env.SYNTHETIC_TEST_SYNC = '1';

const { createSessionToken } = require('../api/_lib/auth-session.cjs');
const mutateHandler = require('../api/mutate.js');

// Mock fetch for Google Sheets API (zero network calls)
const originalFetch = global.fetch;
let sheetsBatchUpdates = [];

global.fetch = async (url, options = {}) => {
  const urlStr = String(url);

  if (urlStr.includes('oauth2.googleapis.com/token')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'synthetic-jwt-token', expires_in: 3600 })
    };
  }

  if (urlStr.includes('values/%27Morning%20Report%27') || urlStr.includes('Morning%20Report')) {
    // Return sample rows
    // Row 1-6 headers/padding, Row 7 child session 1, Row 8 child session 2
    const mrRows = [
      ['Date', 'Pacific', 'Eastern', 'Type', 'Case', 'Facilitator', 'Presenter'],
      [], [], [], [], [],
      ['2026-10-01', '6:00 AM', '9:00 AM', 'Morning Report', '', 'Rabih', 'Dr. Sibling 1'],
      ['2026-10-01', '6:00 AM', '9:00 AM', 'Morning Report', '', 'Reza', 'Dr. Sibling 2']
    ];
    return {
      ok: true,
      status: 200,
      json: async () => ({ values: mrRows })
    };
  }

  if (urlStr.includes('values:batchUpdate')) {
    const body = JSON.parse(options.body || '{}');
    sheetsBatchUpdates.push(body);
    return {
      ok: true,
      status: 200,
      text: async () => 'OK',
      json: async () => ({ updatedRanges: ['dummy'] })
    };
  }

  return {
    ok: true,
    status: 200,
    json: async () => ({})
  };
};

function mockReqRes(body = {}) {
  const token = createSessionToken({ email: 'drjane@cps.org', role: 'member', name: 'Dr. Jane' });
  const headers = {
    'content-type': 'application/json',
    'authorization': `Bearer ${token}`
  };
  const bodyStr = JSON.stringify(body);

  const req = {
    method: 'POST',
    headers,
    url: '/api/mutate',
    on: function(event, handler) {
      if (event === 'data') {
        handler(Buffer.from(bodyStr));
      } else if (event === 'end') {
        handler();
      }
      return req;
    }
  };

  let statusCode = 200;
  let resBody = '';
  const res = {
    setHeader: () => {},
    writeHead: (code) => { statusCode = code; },
    end: (data) => { resBody = data; }
  };
  Object.defineProperty(res, 'statusCode', {
    get: () => statusCode,
    set: (val) => { statusCode = val; }
  });

  return { req, res, getResult: () => ({ status: statusCode, body: JSON.parse(resBody || '{}') }) };
}

test('Milestone 4: Rejects physical-row mutation fallbacks', async (t) => {
  sheetsBatchUpdates = [];

  await t.test('rejects legacy row ID fallback (e.g. Morning Report:7) with 404', async () => {
    const { req, res, getResult } = mockReqRes({
      dataset: 'Morning Report',
      stableId: 'Morning Report:7',
      field: 'Presenter',
      value: 'Dr. Jane'
    });

    await mutateHandler(req, res);
    const result = getResult();
    assert.equal(result.status, 404);
    assert.equal(result.body.error, 'RECORD_NOT_FOUND');
    assert.equal(sheetsBatchUpdates.length, 0, 'No Google Sheets write should occur on row ID fallback');
  });

  await t.test('mutates correctly when valid immutable stableId is provided', async () => {
    // Stable ID for row 7: mr-2026-10-01-morning-report-6-00-am
    const stableId = 'mr-2026-10-01-morning-report-6-00-am';
    const { req, res, getResult } = mockReqRes({
      dataset: 'Morning Report',
      stableId,
      field: 'Presenter',
      value: 'Dr. Claimed'
    });

    await mutateHandler(req, res);
    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.rowNumber, 7);
    assert.equal(result.body.updatedRange, "'Morning Report'!G7");
  });

  await t.test('mutating child session 2 isolates write and preserves sibling', async () => {
    // Row 8 has same date/time/type, so its deterministic sequence is -seq2
    const child2StableId = 'mr-2026-10-01-morning-report-6-00-am-seq2';
    const { req, res, getResult } = mockReqRes({
      dataset: 'Morning Report',
      stableId: child2StableId,
      field: 'Presenter',
      value: 'Dr. New Presenter'
    });

    await mutateHandler(req, res);
    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.rowNumber, 8);
    assert.equal(result.body.updatedRange, "'Morning Report'!G8");
  });
});
