'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mutateHandler = require('../api/mutate.js');
const { createSessionToken } = require('../api/_lib/auth-session.cjs');

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

test('auth-permissions: strictly rejects fabricated client user without server session', async () => {
  const { req, res, getResult } = mockReqRes({
    body: {
      dataset: 'Morning Report',
      stableId: 'mr-2026-12-31-spontaneous-6-00-am',
      field: 'Presenter',
      value: 'Attacker',
      user: { isAuthenticated: true, role: 'admin', email: 'forged@example.com' } // Fabricated in body!
    }
  });

  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'UNAUTHORIZED');
});

test('auth-permissions: non-admin member is forbidden from editing Important links', async () => {
  const memberToken = createSessionToken({
    email: 'janedoe@example.com',
    name: 'Jane Doe',
    role: 'member'
  });

  const { req, res, getResult } = mockReqRes({
    headers: { authorization: `Bearer ${memberToken}` },
    body: {
      dataset: 'Important links',
      stableId: 'link-123',
      field: 'Resource',
      value: 'New Link'
    }
  });

  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'FORBIDDEN');
});

test('auth-permissions: admin can access Important links validation', async () => {
  const adminToken = createSessionToken({
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin'
  });

  const { req, res, getResult } = mockReqRes({
    headers: { authorization: `Bearer ${adminToken}` },
    body: {
      dataset: 'Important links',
      stableId: '', // intentionally empty to verify it passed the auth gate and reached validation
      field: 'Resource',
      value: 'New Link'
    }
  });

  await mutateHandler(req, res);
  const result = getResult();
  // Passes auth/permissions gate and fails at input validation (400 MISSING_STABLE_ID), not 401 or 403!
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'MISSING_STABLE_ID');
});

test('auth-permissions: authenticated member can sign up on session for colleagues (CPS full trust policy)', async () => {
  const memberToken = createSessionToken({
    email: 'drsmith@example.com',
    name: 'Dr. Smith',
    role: 'member'
  });

  const { req, res, getResult } = mockReqRes({
    headers: { authorization: `Bearer ${memberToken}` },
    body: {
      dataset: 'Morning Report',
      stableId: '', // verify it passes auth gate to input validation
      field: 'Presenter',
      value: 'Dr. Other Member' // editing on behalf of colleague
    }
  });

  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'MISSING_STABLE_ID');
});
