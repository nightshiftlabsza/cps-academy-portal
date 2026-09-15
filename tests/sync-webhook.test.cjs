'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const syncWebhookHandler = require('../api/sync-webhook.js');

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

test('sync-webhook: rejects non-POST with 405', async () => {
  const { req, res, getResult } = mockReqRes({ method: 'GET' });
  await syncWebhookHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 405);
  assert.equal(result.body.error, 'METHOD_NOT_ALLOWED');
});

test('sync-webhook: returns 503 when SYNC_WEBHOOK_SECRET is not configured', async () => {
  const savedSecret = process.env.SYNC_WEBHOOK_SECRET;
  delete process.env.SYNC_WEBHOOK_SECRET;

  const { req, res, getResult } = mockReqRes({ body: { secret: 'anything' } });
  await syncWebhookHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'WEBHOOK_NOT_CONFIGURED');

  if (savedSecret !== undefined) process.env.SYNC_WEBHOOK_SECRET = savedSecret;
});

test('sync-webhook: rejects missing secret with 401', async () => {
  process.env.SYNC_WEBHOOK_SECRET = 'test-secret-abc123';

  const { req, res, getResult } = mockReqRes({ body: { sheet: 'Morning Report' } });
  await syncWebhookHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'UNAUTHORIZED');
});

test('sync-webhook: rejects wrong secret with 401', async () => {
  process.env.SYNC_WEBHOOK_SECRET = 'test-secret-abc123';

  const { req, res, getResult } = mockReqRes({
    body: { secret: 'wrong-secret', sheet: 'Morning Report' }
  });
  await syncWebhookHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'UNAUTHORIZED');
});

test('sync-webhook: accepts correct secret and clears cache', async () => {
  process.env.SYNC_WEBHOOK_SECRET = 'test-secret-abc123';

  const { req, res, getResult } = mockReqRes({
    body: {
      secret: 'test-secret-abc123',
      sheet: 'Morning Report',
      editedRange: 'G42'
    }
  });
  await syncWebhookHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.sheet, 'Morning Report');
  assert.equal(result.body.editedRange, 'G42');
});
