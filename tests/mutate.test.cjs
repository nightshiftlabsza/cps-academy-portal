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

// Synthetic in-memory sheet state
const syntheticSheet = {
  'Morning Report': [
    [], [], [], [], [], [],
    // Row 7 (index 6):
    ['12/31/2026', '6:00 AM', '9:00 AM', 'Spontaneous', '', 'Rabih & TBD', '', '', '', '', '', '', '', '', '', '', '', '', '']
  ],
  'CPS Academy VMRs': [
    [], [], [],
    // Row 4 (index 3):
    ['Facilitator Name', 'Session 1', 'Cardiology', '2026-09-01', 'Zoom Link', '', '', '', '']
  ]
};

// Network blocker: intercept all fetch calls to ensure 0 outbound requests
const originalFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  const urlStr = String(url);

  // 1. Google OAuth2 token exchange
  if (urlStr.includes('oauth2.googleapis.com/token')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'synthetic-jwt-token', expires_in: 3600 })
    };
  }

  // 2. Google Sheets GET values (row scanning)
  if (urlStr.includes('/values/') && (!options.method || options.method === 'GET')) {
    if (urlStr.includes('Morning%20Report')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ values: syntheticSheet['Morning Report'] })
      };
    }
    if (urlStr.includes('CPS%20Academy%20VMRs')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ values: syntheticSheet['CPS Academy VMRs'] })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ values: [] })
    };
  }

  // 3. Google Sheets POST batchUpdate (mutations)
  if (urlStr.includes('values:batchUpdate') && options.method === 'POST') {
    if (options.body) {
      try {
        const bodyObj = JSON.parse(options.body);
        for (const item of (bodyObj.data || [])) {
          const m = item.range.match(/'([^']+)'!([A-Z]+)(\d+)/);
          if (m) {
            const tab = m[1];
            const colLetter = m[2];
            const rowNum = parseInt(m[3], 10);
            const colIdx = colLetter.charCodeAt(0) - 65;
            if (syntheticSheet[tab] && syntheticSheet[tab][rowNum - 1]) {
              syntheticSheet[tab][rowNum - 1][colIdx] = item.values[0][0];
            }
          }
        }
      } catch {}
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ totalUpdatedCells: 1, responses: [] })
    };
  }

  throw new Error(`Outbound network call BLOCKED in synthetic unit test: ${urlStr}`);
};

test.after(() => {
  global.fetch = originalFetch;
});

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
    end(chunk) {
      if (chunk) bodySent += chunk;
    }
  };

  return { req, res, getResult: () => ({ status: statusCode, headers: headersSent, body: bodySent ? JSON.parse(bodySent) : null }) };
}

test('mutate: rejects non-POST methods with 405', async () => {
  const { req, res, getResult } = mockReqRes({ method: 'GET' });
  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 405);
  assert.equal(result.body.error, 'METHOD_NOT_ALLOWED');
});

test('mutate: rejects unauthenticated requests with 401', async () => {
  const { req, res, getResult } = mockReqRes({
    body: {
      dataset: 'Morning Report',
      stableId: 'mr-2026-12-31-spontaneous-6-00-am',
      field: 'Presenter',
      value: 'Zak'
    }
  });
  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'UNAUTHORIZED');
});

test('mutate: rejects invalid dataset with 400', async () => {
  const { req, res, getResult } = mockReqRes({
    body: {
      user: { isAuthenticated: true, name: 'Zak' },
      dataset: 'InvalidDataset',
      stableId: 'some-id',
      field: 'Presenter',
      value: 'Zak'
    }
  });
  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'INVALID_DATASET');
});

test('mutate: rejects non-mutable or invalid field with 400', async () => {
  const { req, res, getResult } = mockReqRes({
    body: {
      user: { isAuthenticated: true, name: 'Zak' },
      dataset: 'Morning Report',
      stableId: 'mr-2026-12-31-spontaneous-6-00-am',
      field: 'SecretFormula',
      value: 'Zak'
    }
  });
  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'INVALID_FIELD');
});

test('mutate: detects concurrency conflict (409) when slot is already occupied', async () => {
  // Facilitator on row 7 is 'Rabih & TBD'. If we expect '', it should return 409!
  const { req, res, getResult } = mockReqRes({
    body: {
      user: { isAuthenticated: true, name: 'Zak' },
      dataset: 'Morning Report',
      stableId: 'mr-2026-12-31-spontaneous-6-00-am',
      field: 'Facilitator',
      value: 'Zak',
      expectedPreviousValue: '' // expecting empty, but it's occupied!
    }
  });
  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 409);
  assert.equal(result.body.error, 'SLOT_OCCUPIED');
  assert.match(result.body.currentValue, /Rabih/);
});

test('mutate: synthetic round-trip claiming empty Presenter slot and reverting', async () => {
  const testVal = 'Synthetic Presenter';

  // 1. Claim vacant Presenter slot
  const { req: writeReq, res: writeRes, getResult: getWriteResult } = mockReqRes({
    body: {
      user: { isAuthenticated: true, name: 'Zak' },
      dataset: 'Morning Report',
      stableId: 'mr-2026-12-31-spontaneous-6-00-am',
      field: 'Presenter',
      value: testVal,
      expectedPreviousValue: ''
    }
  });
  await mutateHandler(writeReq, writeRes);
  const writeResult = getWriteResult();
  assert.equal(writeResult.status, 200, `Write failed: ${JSON.stringify(writeResult.body)}`);
  assert.equal(writeResult.body.success, true);
  assert.equal(writeResult.body.value, testVal);
  assert.equal(writeResult.body.updatedRange, "'Morning Report'!G7");

  // 2. Revert back to empty string
  const { req: revertReq, res: revertRes, getResult: getRevertResult } = mockReqRes({
    body: {
      user: { isAuthenticated: true, name: 'Zak' },
      dataset: 'Morning Report',
      stableId: 'mr-2026-12-31-spontaneous-6-00-am',
      field: 'Presenter',
      value: '',
      expectedPreviousValue: testVal
    }
  });
  await mutateHandler(revertReq, revertRes);
  const revertResult = getRevertResult();
  assert.equal(revertResult.status, 200, `Revert failed: ${JSON.stringify(revertResult.body)}`);
  assert.equal(revertResult.body.success, true);
  assert.equal(revertResult.body.value, '');
});

test('mutate: rejects invalid field for CPS Academy VMRs with 400', async () => {
  const { req, res, getResult } = mockReqRes({
    body: {
      user: { isAuthenticated: true, name: 'Zak' },
      dataset: 'CPS Academy VMRs',
      stableId: 'CPS Academy VMRs:4',
      field: 'InvalidColumn',
      value: 'Test'
    }
  });
  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'INVALID_FIELD');
});

test('mutate: supports batchUpdate for multiple fields', async () => {
  const { req, res, getResult } = mockReqRes({
    body: {
      user: { isAuthenticated: true, name: 'Zak' },
      dataset: 'Morning Report',
      stableId: 'mr-2026-12-31-spontaneous-6-00-am',
      fields: {
        'Notes': 'Synthetic batch test note',
        'Chat support': 'Test bot'
      }
    }
  });
  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.operation, 'batchUpdate');
  assert.deepEqual(result.body.updatedFields, ['Notes', 'Chat support']);
});

test('mutate: synthetic round-trip for CPS Academy VMRs', async () => {
  const { req, res, getResult } = mockReqRes({
    body: {
      user: { isAuthenticated: true, name: 'Zak' },
      dataset: 'CPS Academy VMRs',
      stableId: 'vmr-2026-09-01-session-1',
      fields: {
        'Bonus learning': 'https://example.com/test-learning'
      }
    }
  });
  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.operation, 'batchUpdate');
});
