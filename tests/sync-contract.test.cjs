'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createSyncHandler, validateSchema, MAX_BODY_BYTES } = require('../api/_lib/sync-contract.cjs');

function createMockReq(options = {}) {
  const {
    method = 'POST',
    headers = { 'content-type': 'application/json' },
    body = JSON.stringify({ schemaVersion: 1, operation: 'readSnapshot', requestId: 'req-1' })
  } = options;

  const stream = new Readable({
    read() {
      if (body) this.push(Buffer.from(body));
      this.push(null);
    }
  });

  stream.method = method;
  stream.headers = headers;
  return stream;
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(chunk) {
      if (chunk) this.body += chunk.toString();
    }
  };
}

test('Invalid methods are rejected with 405 Method Not Allowed', async () => {
  const handler = createSyncHandler();
  for (const m of ['GET', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const req = createMockReq({ method: m });
    const res = createMockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers['allow'], 'POST');
    assert.equal(res.headers['cache-control'], 'no-store');
    const json = JSON.parse(res.body);
    assert.equal(json.error, 'METHOD_NOT_ALLOWED');
  }
});

test('Invalid content types are rejected with 415 Unsupported Media Type', async () => {
  const handler = createSyncHandler();
  for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', '']) {
    const req = createMockReq({ headers: { 'content-type': ct } });
    const res = createMockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 415);
    const json = JSON.parse(res.body);
    assert.equal(json.error, 'UNSUPPORTED_MEDIA_TYPE');
  }
});

test('Oversized bodies exceeding 64 KiB are rejected with 413 Payload Too Large', async () => {
  const handler = createSyncHandler();
  const hugePayload = JSON.stringify({
    schemaVersion: 1,
    operation: 'readSnapshot',
    requestId: 'req-oversized',
    padding: 'x'.repeat(MAX_BODY_BYTES + 100)
  });
  const req = createMockReq({ body: hugePayload });
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 413);
  const json = JSON.parse(res.body);
  assert.equal(json.error, 'PAYLOAD_TOO_LARGE');
});

test('Malformed schemas and invalid JSON are rejected with 400 Bad Request', async () => {
  const handler = createSyncHandler();

  // Malformed JSON
  const reqBadJson = createMockReq({ body: '{ malformed ' });
  const resBadJson = createMockRes();
  await handler(reqBadJson, resBadJson);
  assert.equal(resBadJson.statusCode, 400);

  // Wrong schemaVersion (e.g. 2)
  const reqV2 = createMockReq({
    body: JSON.stringify({ schemaVersion: 2, operation: 'readSnapshot', requestId: 'req-1' })
  });
  const resV2 = createMockRes();
  await handler(reqV2, resV2);
  assert.equal(resV2.statusCode, 400);

  // Invalid operation (e.g. writeSnapshot)
  const reqOp = createMockReq({
    body: JSON.stringify({ schemaVersion: 1, operation: 'writeSnapshot', requestId: 'req-1' })
  });
  const resOp = createMockRes();
  await handler(reqOp, resOp);
  assert.equal(resOp.statusCode, 400);

  // Missing requestId
  const reqReqId = createMockReq({
    body: JSON.stringify({ schemaVersion: 1, operation: 'readSnapshot' })
  });
  const resReqId = createMockRes();
  await handler(reqReqId, resReqId);
  assert.equal(resReqId.statusCode, 400);
});

test('Browser-supplied credentials and arbitrary source locations are rejected with 400 Bad Request', async () => {
  const handler = createSyncHandler();

  // Attempting to supply credentials
  const reqCreds = createMockReq({
    body: JSON.stringify({
      schemaVersion: 1,
      operation: 'readSnapshot',
      requestId: 'req-creds',
      credentials: { serviceAccountKey: 'secret-key-attempt' }
    })
  });
  const resCreds = createMockRes();
  await handler(reqCreds, resCreds);
  assert.equal(resCreds.statusCode, 400);
  assert.ok(resCreds.body.includes('Unknown or disallowed property: credentials'));
  // Ensure error does not echo back the supplied secret
  assert.equal(resCreds.body.includes('secret-key-attempt'), false);

  // Attempting to supply arbitrary sheetUrl / range
  const reqUrl = createMockReq({
    body: JSON.stringify({
      schemaVersion: 1,
      operation: 'readSnapshot',
      requestId: 'req-url',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/malicious-id'
    })
  });
  const resUrl = createMockRes();
  await handler(reqUrl, resUrl);
  assert.equal(resUrl.statusCode, 400);
  assert.ok(resUrl.body.includes('Unknown or disallowed property: sheetUrl'));
});

test('An unconfigured request returns 503 with code SYNC_NOT_CONFIGURED', async () => {
  // Empty config (no sheetId)
  const handler = createSyncHandler({ config: { sheetId: null } });
  const req = createMockReq();
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 503);
  const json = JSON.parse(res.body);
  assert.equal(json.error, 'SYNC_NOT_CONFIGURED');
});

test('Failed authentication returns 401 and never invokes the sheets reader', async () => {
  let readerCalled = false;
  const handler = createSyncHandler({
    config: { sheetId: 'sheet-123', authToken: 'valid-secret' },
    authValidator: async () => ({ authorized: false, message: 'Bad token' }),
    sheetsReader: async () => {
      readerCalled = true;
      return {};
    }
  });

  const req = createMockReq();
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(readerCalled, false, 'Sheets reader must NOT be invoked when auth fails');
  const json = JSON.parse(res.body);
  assert.equal(json.error, 'UNAUTHORIZED');
});

test('Injected authorized test readers return the documented response shape', async () => {
  const mockWorkbook = { 'Morning Report': { records: [{ id: 'mr-1' }] } };
  let passedKnownHash = null;

  const handler = createSyncHandler({
    config: { sheetId: 'sheet-123' },
    authValidator: async () => ({ authorized: true }),
    sheetsReader: async (cfg, opts) => {
      passedKnownHash = opts.knownSnapshotHash;
      return {
        snapshotHash: 'hash-abc-123',
        snapshotDate: '2026-09-08T00:00:00Z',
        modified: true,
        workbook: mockWorkbook
      };
    }
  });

  const req = createMockReq({
    body: JSON.stringify({
      schemaVersion: 1,
      operation: 'readSnapshot',
      requestId: 'req-success-1',
      knownSnapshotHash: 'old-hash-789'
    })
  });
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(passedKnownHash, 'old-hash-789');

  const json = JSON.parse(res.body);
  assert.equal(json.schemaVersion, 1);
  assert.equal(json.operation, 'readSnapshot');
  assert.equal(json.requestId, 'req-success-1');
  assert.equal(json.snapshotHash, 'hash-abc-123');
  assert.equal(json.snapshotDate, '2026-09-08T00:00:00Z');
  assert.equal(json.modified, true);
  assert.deepEqual(json.workbook, mockWorkbook);
});

test('Error responses contain no credentials or workbook content', async () => {
  const handler = createSyncHandler({
    config: { sheetId: 'secret-sheet-id-private', authToken: 'very-secret-token' },
    authValidator: async () => ({ authorized: false, message: 'Invalid credentials' }),
    sheetsReader: async () => ({ secretData: 'should never be seen' })
  });

  const req = createMockReq();
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.includes('secret-sheet-id-private'), false);
  assert.equal(res.body.includes('very-secret-token'), false);
  assert.equal(res.body.includes('should never be seen'), false);
});
