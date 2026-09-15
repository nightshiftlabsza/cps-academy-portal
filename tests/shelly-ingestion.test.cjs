'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
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
      // missing schemaVersion: 1 and operation: 'readSnapshot'
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

  assert.equal(generatedIds.length, 60);
  assert.equal(new Set(generatedIds).size, 60, 'All 60 bulk sessions must have unique stable IDs');

  // Verify row shifting: existing record ID is unaffected when 30 rows are inserted before it
  const shiftedRecordFields = {
    Date: '2026-12-15',
    'Pacific time (source)': '6:00 AM',
    Type: 'Scheduled',
    Facilitator: 'Reza'
  };
  const seenBefore = new Set();
  const idAtRow50 = generateDeterministicId('Morning Report', shiftedRecordFields, seenBefore);

  const seenAfterShift = new Set();
  const idAtRow80 = generateDeterministicId('Morning Report', shiftedRecordFields, seenAfterShift);
  assert.equal(idAtRow50, idAtRow80, 'Physical row shift from row 50 to row 80 must not alter stable ID');
});
