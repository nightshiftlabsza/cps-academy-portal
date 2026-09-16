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
const { getOperationById, resetMemoryState } = require('../api/_lib/db.cjs');
const mutateHandler = require('../api/mutate.js');

// Mock fetch for Google Sheets API (zero network calls)
const originalFetch = global.fetch;
let sheetsBatchCalls = 0;

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
    const mrRows = [
      ['Date', 'Pacific', 'Eastern', 'Type', 'Case', 'Facilitator', 'Presenter'],
      [], [], [], [], [],
      ['2026-10-01', '6:00 AM', '9:00 AM', 'Morning Report', '', 'Rabih', 'Dr. Alice']
    ];
    return {
      ok: true,
      status: 200,
      json: async () => ({ values: mrRows })
    };
  }

  if (urlStr.includes('values:batchUpdate')) {
    sheetsBatchCalls++;
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

test('Milestone 5: Durable operations, concurrency serialization, and idempotency', async (t) => {
  resetMemoryState();
  sheetsBatchCalls = 0;

  const stableId = 'mr-2026-10-01-morning-report-6-00-am';

  await t.test('rejects conflicting write when expectedPreviousValue does not match current occupant', async () => {
    // Current presenter in row 7 is 'Dr. Alice'
    const { req, res, getResult } = mockReqRes({
      dataset: 'Morning Report',
      stableId,
      field: 'Presenter',
      value: 'Dr. Bob',
      expectedPreviousValue: '' // Expected empty, but actually occupied by Alice!
    });

    await mutateHandler(req, res);
    const result = getResult();
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'SLOT_OCCUPIED');
    assert.equal(result.body.currentValue, 'Dr. Alice');
  });

  await t.test('executes write and logs committed operation in journal when expectedPreviousValue matches', async () => {
    const opId = 'op-test-unique-123';
    const { req, res, getResult } = mockReqRes({
      operationId: opId,
      dataset: 'Morning Report',
      stableId,
      field: 'Presenter',
      value: 'Dr. Bob',
      expectedPreviousValue: 'Dr. Alice'
    });

    await mutateHandler(req, res);
    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.operationId, opId);

    const logged = await getOperationById(opId);
    assert.ok(logged, 'Operation must be logged in durable journal');
    assert.equal(logged.status, 'committed');
    assert.equal(logged.sessionId, stableId);
  });

  await t.test('replays committed operation idempotently without re-executing batchUpdate to Google Sheets', async () => {
    const initialCalls = sheetsBatchCalls;
    const opId = 'op-test-unique-123'; // Same operationId as previous test

    const { req, res, getResult } = mockReqRes({
      operationId: opId,
      dataset: 'Morning Report',
      stableId,
      field: 'Presenter',
      value: 'Dr. Bob'
    });

    await mutateHandler(req, res);
    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.replayed, true);
    assert.equal(sheetsBatchCalls, initialCalls, 'No additional Google Sheets API call should be made on replay');
  });
});
