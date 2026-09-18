const test = require('node:test');
const assert = require('node:assert/strict');
const { createSyncHandler } = require('../api/_lib/sync-contract.cjs');
const { createSessionToken, getSessionUser } = require('../api/_lib/auth-session.cjs');

test('Milestone 3: Sync endpoint requires authentication and enforces role-based scrubbing', async (t) => {
  const sampleWorkbook = {
    Members: {
      records: [
        { id: 'mem-1', fields: { Name: 'Dr. Jane Doe', Birthday: '1985-04-12', Role: 'Member' } },
        { id: 'mem-2', fields: { Name: 'Admin User', Birthday: '1970-01-01', Role: 'Admin' } }
      ]
    }
  };

  const mockReader = async () => ({
    snapshotHash: 'hash-abc',
    snapshotDate: '2026-09-15',
    modified: true,
    workbook: sampleWorkbook
  });

  const memberToken = createSessionToken({ email: 'jane@cps.org', role: 'member', name: 'Dr. Jane Doe' });
  const adminToken = createSessionToken({ email: 'admin@cps.org', role: 'admin', name: 'Admin User' });

  function mockReqRes(options = {}) {
    const headers = {
      'content-type': 'application/json',
      ...(options.headers || {})
    };
    const validBody = {
      schemaVersion: 1,
      operation: 'readSnapshot',
      requestId: 'req-test-123',
      ...(options.body || {})
    };
    const bodyStr = JSON.stringify(validBody);
    
    // Simulate readable stream for parseBody
    const req = {
      method: 'POST',
      headers,
      url: '/api/sync',
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

  const handler = createSyncHandler({
    sheetsReader: mockReader,
    authValidator: (req) => {
      const user = getSessionUser(req);
      if (user && user.isAuthenticated) {
        return { authorized: true, user };
      }
      return { authorized: false, message: 'Auth required' };
    },
    config: { enabled: true, sheetId: 'test-sheet-id' }
  });

  await t.test('rejects unauthenticated sync request with 401', async () => {
    const { req, res, getResult } = mockReqRes();
    await handler(req, res);
    const result = getResult();
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'UNAUTHORIZED');
  });

  await t.test('preserves sensitive Member birthday for authenticated member session', async () => {
    const { req, res, getResult } = mockReqRes({
      headers: { authorization: `Bearer ${memberToken}` }
    });
    await handler(req, res);
    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.workbook.Members.records[0].fields.Birthday, '1985-04-12');
    assert.equal(result.body.workbook.Members.records[1].fields.Birthday, '1970-01-01');
  });

  await t.test('redacts sensitive Member birthday for unprivileged viewer session', async () => {
    const viewerToken = createSessionToken({ email: 'viewer@cps.org', role: 'viewer', name: 'Viewer User' });
    const { req, res, getResult } = mockReqRes({
      headers: { authorization: `Bearer ${viewerToken}` }
    });
    await handler(req, res);
    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.workbook.Members.records[0].fields.Birthday, 'Redacted');
    assert.equal(result.body.workbook.Members.records[1].fields.Birthday, 'Redacted');
  });

  await t.test('preserves sensitive Member birthday for admin session', async () => {
    const { req, res, getResult } = mockReqRes({
      headers: { authorization: `Bearer ${adminToken}` }
    });
    await handler(req, res);
    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.workbook.Members.records[0].fields.Birthday, '1985-04-12');
    assert.equal(result.body.workbook.Members.records[1].fields.Birthday, '1970-01-01');
  });
});
