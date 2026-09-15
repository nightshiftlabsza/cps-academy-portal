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

const mockUser = {
  name: 'Test Member',
  email: 'test@example.com',
  isAuthenticated: true
};

test('tier-expansion: strictly rejects write attempts to non-mutable datasets (CRC, Special VMRs)', async () => {
  for (const nonMutable of ['CRC', 'Special VMRs', 'Conferences', 'CRC - retired']) {
    const { req, res, getResult } = mockReqRes({
      body: {
        dataset: nonMutable,
        stableId: 'some-stable-id',
        field: 'SomeField',
        value: 'Test',
        user: mockUser
      }
    });

    await mutateHandler(req, res);
    const result = getResult();
    assert.equal(result.status, 400, `Dataset ${nonMutable} should return 400`);
    assert.equal(result.body.error, 'INVALID_DATASET');
    assert.match(result.body.message, /not mutable/i);
  }
});

test('tier-expansion: rejects invalid field for Members dataset', async () => {
  const { req, res, getResult } = mockReqRes({
    body: {
      dataset: 'Members',
      stableId: 'mem-alex-carter',
      field: 'NonExistentField',
      value: 'Cardiology',
      user: mockUser
    }
  });

  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'INVALID_FIELD');
});

test('tier-expansion: rejects invalid field for Important links dataset', async () => {
  const { req, res, getResult } = mockReqRes({
    body: {
      dataset: 'Important links',
      stableId: 'link-resource-guidelines',
      field: 'UnallowedField',
      value: 'http://example.com',
      user: mockUser
    }
  });

  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'INVALID_FIELD');
});

test('tier-expansion: validates batchUpdate fields for Members dataset', async () => {
  const { req, res, getResult } = mockReqRes({
    body: {
      dataset: 'Members',
      stableId: 'mem-alex-carter',
      fields: {
        'InvalidField': 'Val'
      },
      user: mockUser
    }
  });

  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'NO_VALID_FIELDS');
});
