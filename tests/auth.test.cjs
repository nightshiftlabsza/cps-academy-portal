'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const sheetsReaderModule = require('../api/_lib/sheets-reader.cjs');

// Offline fixture: intercept sheetsReader BEFORE requiring login handler to guarantee 0 network calls
sheetsReaderModule.sheetsReader = async () => ({
  workbook: {
    Members: {
      records: [
        {
          id: 'mem-1',
          stableId: 'mem-krishi-korrapati',
          fields: {
            Name: 'Krishi Korrapati',
            Email: 'krishi.korrapati@my.rfums.org'
          }
        }
      ]
    }
  }
});

// Guard: block any unexpected external network requests throughout test execution
const originalFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  const urlStr = String(url);
  if (urlStr.startsWith('http://127.0.0.1') || urlStr.startsWith('http://localhost') || urlStr.startsWith('/')) {
    if (typeof originalFetch === 'function') return originalFetch(url, options);
  }
  throw new Error(`Unexpected external network request blocked in test: ${urlStr}`);
};

const loginHandler = require('../api/login.js');
const Identity = require('../identity.js');

function mockRequest(body, method = 'POST') {
  const b = JSON.stringify(body);
  const stream = new Readable({
    read() {
      this.push(Buffer.from(b));
      this.push(null);
    }
  });
  stream.method = method;
  stream.headers = { 'content-type': 'application/json' };
  return stream;
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(c) { if (c) this.body += c.toString(); }
  };
}

test('POST /api/login rejects non-POST requests with 405', async () => {
  const req = mockRequest({}, 'GET');
  const res = mockResponse();
  await loginHandler(req, res);
  assert.equal(res.statusCode, 405);
});

test('POST /api/login rejects invalid password with 401', async () => {
  const req = mockRequest({ email: 'test@example.com', password: 'incorrect_pass' });
  const res = mockResponse();
  await loginHandler(req, res);
  assert.equal(res.statusCode, 401);
  const json = JSON.parse(res.body);
  assert.equal(json.error, 'INVALID_CREDENTIALS');
});

test('POST /api/login accepts universal password and assigns member role', async () => {
  const req = mockRequest({ email: 'krishi.korrapati@my.rfums.org', password: 'cpsvmr143' });
  const res = mockResponse();
  await loginHandler(req, res);
  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.success, true);
  assert.equal(json.user.email, 'krishi.korrapati@my.rfums.org');
  assert.equal(json.user.role, 'member');
  assert.equal(json.user.name, 'Krishi Korrapati');
  assert.ok(json.user.id.startsWith('mem-'));
});

test('POST /api/login grants admin role to admin email', async () => {
  const req = mockRequest({ email: 'zak@cpsolvers.com', password: 'cpsvmr143' });
  const res = mockResponse();
  await loginHandler(req, res);
  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.user.role, 'admin');
});

test('Identity module manages login, persistence, and logout', () => {
  // Test logout
  Identity.logout();
  assert.equal(Identity.getCurrentUser(), null);

  // Test setting mock user still works for backward test compatibility
  const mockUser = Identity.setMockUser({ id: 'test-1', name: 'Dr. Mock' });
  assert.equal(mockUser.name, 'Dr. Mock');
  assert.equal(Identity.getCurrentUser().name, 'Dr. Mock');

  Identity.clearMockUser();
  assert.equal(Identity.getCurrentUser(), null);
});
