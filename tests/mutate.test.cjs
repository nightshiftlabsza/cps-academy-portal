'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mutateHandler = require('../api/mutate.js');

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

test('mutate: live round-trip claiming empty Presenter slot and reverting', async () => {
  const testVal = 'Zak Test Presenter';

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
        'Notes': 'Automated batch test note',
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

  // Clean up reverting notes and chat support
  const { req: revReq, res: revRes, getResult: getRevResult } = mockReqRes({
    body: {
      user: { isAuthenticated: true, name: 'Zak' },
      dataset: 'Morning Report',
      stableId: 'mr-2026-12-31-spontaneous-6-00-am',
      fields: {
        'Notes': '',
        'Chat support': ''
      }
    }
  });
  await mutateHandler(revReq, revRes);
  const revResult = getRevResult();
  assert.equal(revResult.status, 200);
  assert.equal(revResult.body.success, true);
});

test('mutate: live round-trip for CPS Academy VMRs', async () => {
  const { req, res, getResult } = mockReqRes({
    body: {
      user: { isAuthenticated: true, name: 'Zak' },
      dataset: 'CPS Academy VMRs',
      stableId: 'CPS Academy VMRs:4',
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

  // Revert back
  const { req: revReq, res: revRes, getResult: getRevResult } = mockReqRes({
    body: {
      user: { isAuthenticated: true, name: 'Zak' },
      dataset: 'CPS Academy VMRs',
      stableId: 'CPS Academy VMRs:4',
      fields: {
        'Bonus learning': ''
      }
    }
  });
  await mutateHandler(revReq, revRes);
  assert.equal(getRevResult().status, 200);
});


