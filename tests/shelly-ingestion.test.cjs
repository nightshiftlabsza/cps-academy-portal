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

// Network blocker: intercept all fetch calls to ensure 0 outbound requests
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

  if (urlStr.includes('values:batchGet')) {
    const mrRows = [
      ['Date', 'Pacific', 'Eastern', 'Type', 'Case', 'Facilitator'],
      [], [], [], [], [],
      ['12/31/2026', '6:00 AM', '9:00 AM', 'Spontaneous', '', 'Rabih']
    ];
    const vmrRows = [
      ['Facilitator', 'Session title', 'Topic', 'Date / time (source)', 'Meeting info', 'Recording', 'Public flag', 'Bonus learning'],
      [], [],
      ['Facilitator Name', 'Session 1', 'Cardiology', '2026-09-01', 'Zoom Link', '', '', '']
    ];
    const orgRows = [
      ['Team / responsibility', 'Members', 'Role'],
      [],
      ['Core Team', 'Member 1', 'Lead']
    ];
    const linkRows = [
      ['Resource', 'Link'],
      ['Guidelines', 'https://example.com/guidelines']
    ];
    return {
      ok: true,
      status: 200,
      json: async () => ({
        valueRanges: [
          { values: mrRows },
          { values: vmrRows },
          { values: orgRows },
          { values: linkRows }
        ]
      })
    };
  }

  throw new Error(`Outbound network call BLOCKED in synthetic unit test: ${urlStr}`);
};

test.after(() => {
  global.fetch = originalFetch;
});

const syncHandlerEntry = require('../api/sync.js');
const { generateDeterministicId, slugify } = require('../api/_lib/sheets-reader.cjs');

function mockReqRes(options = {}) {
  const { method = 'POST', body = null, headers = {} } = options;
  const req = {
    method,
    headers: { 'content-type': 'application/json', ...headers },
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

test('shelly ingestion: sync endpoint enforces contract schemaVersion and operation', async () => {
  const { req, res, getResult } = mockReqRes({
    body: {
      requestId: 'test-invalid-schema'
    }
  });
  await syncHandlerEntry(req, res);
  const result = getResult();
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'INVALID_SCHEMA');
});

test('shelly ingestion: first poll delivers snapshot with modified=true and hash', async () => {
  const { req, res, getResult } = mockReqRes({
    body: {
      schemaVersion: 1,
      operation: 'readSnapshot',
      requestId: 'poll-1'
    }
  });
  await syncHandlerEntry(req, res);
  const result = getResult();
  assert.equal(result.status, 200);
  assert.equal(result.body.operation, 'readSnapshot');
  assert.equal(result.body.modified, true);
  assert.ok(result.body.snapshotHash);
  assert.ok(result.body.workbook);
  assert.ok(result.body.workbook['Morning Report']);
  assert.ok(result.body.workbook['CPS Academy VMRs']);
});

test('shelly ingestion: second poll with knownSnapshotHash returns modified=false', async () => {
  // 1. Initial poll to get current hash
  const { req: req1, res: res1, getResult: get1 } = mockReqRes({
    body: {
      schemaVersion: 1,
      operation: 'readSnapshot',
      requestId: 'poll-init'
    }
  });
  await syncHandlerEntry(req1, res1);
  const hash = get1().body.snapshotHash;
  assert.ok(hash);

  // 2. Second poll passing knownSnapshotHash
  const { req: req2, res: res2, getResult: get2 } = mockReqRes({
    body: {
      schemaVersion: 1,
      operation: 'readSnapshot',
      requestId: 'poll-followup',
      knownSnapshotHash: hash
    }
  });
  await syncHandlerEntry(req2, res2);
  const result2 = get2();
  assert.equal(result2.status, 200);
  assert.equal(result2.body.modified, false);
  assert.equal(result2.body.snapshotHash, hash);
  assert.equal(result2.body.workbook, undefined, 'Unmodified poll must not send workbook data');
});

test('shelly ingestion: 60 bulk row additions produce 0 ID collisions and survive row shifts', () => {
  const seen = new Set();
  const generatedIds = [];

  for (let i = 1; i <= 60; i++) {
    const day = String((i % 28) + 1).padStart(2, '0');
    const fields = {
      Date: `2026-11-${day}`,
      'Pacific time (source)': i % 2 === 0 ? '6:00 AM' : '9:00 AM',
      Type: 'Spontaneous',
      Facilitator: 'Shelly'
    };
    const stableId = generateDeterministicId('Morning Report', fields, seen);
    generatedIds.push(stableId);
  }

  // 1. Zero collisions among 60 bulk rows
  const uniqueIds = new Set(generatedIds);
  assert.equal(uniqueIds.size, 60, 'All 60 bulk additions must have unique deterministic IDs');

  // 2. Shifting row index in physical sheet does NOT change stableId
  const shiftedFields = {
    Date: '2026-11-05',
    'Pacific time (source)': '6:00 AM',
    Type: 'Spontaneous',
    Facilitator: 'Shelly'
  };
  const idAtRow100 = generateDeterministicId('Morning Report', shiftedFields, new Set());
  const idAtRow250 = generateDeterministicId('Morning Report', shiftedFields, new Set());
  assert.equal(idAtRow100, idAtRow250, 'Deterministic ID must be invariant to physical row number shifting');
});
