'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const ROOT = path.resolve(__dirname, '..');
const workbook = require('../workbook.json');
const SessionCore = require('../session-core.js');
const SearchCore = require('../search-core.js');
const WindowedList = require('../windowed-list.js');
const { defaultHandler } = require('../api/_lib/sync-contract.cjs');
const { createServer } = require('../scripts/serve.cjs');

function createMockReq({ method = 'POST', headers = { 'content-type': 'application/json' }, body = '' } = {}) {
  const stream = new Readable({
    read() {
      if (body) this.push(Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
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
    setHeader(k, v) { this.headers[k] = v; },
    end(payload) { if (payload) this.body = payload; }
  };
}

test('Sprint Integration Gate: 1. Split sessions and staffing gap operations', () => {
  const row12 = workbook['Morning Report'].records.find(r => r.row === 12);
  assert.ok(row12, 'Morning Report row 12 must exist');

  const children = SessionCore.splitMorningReport(row12);
  assert.equal(children.length, 2, 'Row 12 must split into 2 independent child sessions');
  assert.equal(children[0].id, 'Morning Report:12::session:1');
  assert.equal(children[1].id, 'Morning Report:12::session:2');

  assert.equal(children[1].fields.Facilitator, 'Alec & Austin');
  assert.equal(children[0].fields['Pacific time (source)'], 'TBD');
  assert.equal(children[1].fields['Pacific time (source)'], '11 AM');

  // Both child sessions preserve link to parent
  assert.equal(children[0].session.parentId, row12.id);
  assert.equal(children[1].session.parentId, row12.id);
});

test('Sprint Integration Gate: 2. SearchCore extracts safe highlighted snippets', () => {
  const sampleRecord = {
    id: 'test:mr:1',
    source: 'Morning Report',
    fields: {
      Topic: 'Clinical Reasoning with Dr. Smith',
      Notes: 'Discussing atypical pneumonia presentation in immunocompromised host',
      Facilitator: 'Dr. Smith'
    }
  };

  const match = SearchCore.searchRecord(sampleRecord, 'Morning Report', ['atypical', 'pneumonia']);
  assert.ok(match, 'Record should match search terms');
  assert.ok(match.snippets.length > 0, 'Should extract matching snippets');
  assert.equal(match.snippets[0].fieldName, 'Notes');
  assert.equal(match.snippets[0].match.toLowerCase(), 'atypical');

  // Test DOM rendering behavior with mocked document
  const mockTextNodes = [];
  const globalDoc = global.document;
  global.document = {
    createElement(tag) {
      return { tag, children: [], textContent: '', className: '', appendChild(c) { this.children.push(c); } };
    },
    createTextNode(text) {
      const tn = { nodeType: 3, text };
      mockTextNodes.push(tn);
      return tn;
    }
  };

  try {
    const el = SearchCore.createSnippetElement(match.snippets[0]);
    assert.equal(el.tag, 'div');
    assert.ok(el.children.some(c => c.tag === 'mark' && c.textContent.toLowerCase() === 'atypical'));
  } finally {
    global.document = globalDoc;
  }
});

test('Sprint Integration Gate: 3. Offline Service Worker cache rules and fallback headers', () => {
  const swContent = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.match(swContent, /cps-portal-shell-v[\d.]+/, 'Must declare versioned cache name');
  assert.match(swContent, /\/workbook\.json/, 'Must precache workbook snapshot');
  assert.match(swContent, /\/api\//, 'Must bypass API requests');

  const offlineContent = fs.readFileSync(path.join(ROOT, 'offline.js'), 'utf8');
  assert.match(offlineContent, /OfflineManager/, 'Must export OfflineManager');
  assert.match(offlineContent, /caches\.delete/, 'Must provide cache clearing mechanism');
});

test('Sprint Integration Gate: 4. Disabled-by-default Sync Endpoint Contract', async () => {
  // Method not allowed
  const res1 = createMockRes();
  await defaultHandler(createMockReq({ method: 'GET' }), res1);
  assert.equal(res1.statusCode, 405);

  // Content type validation
  const res2 = createMockRes();
  await defaultHandler(createMockReq({ method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }), res2);
  assert.equal(res2.statusCode, 415);

  // Unconfigured service
  const res3 = createMockRes();
  await defaultHandler(createMockReq({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 1, operation: 'readSnapshot', requestId: 'req-gate-1' })
  }), res3);
  assert.equal(res3.statusCode, 503);
  const body3 = JSON.parse(res3.body);
  assert.equal(body3.error, 'SYNC_NOT_CONFIGURED');
  assert.equal(res3.headers['Cache-Control'], 'no-store');
});

test('Sprint Integration Gate: 5. Render memoization and cache bounds', () => {
  SessionCore.clearCaches();
  const row12 = workbook['Morning Report'].records.find(r => r.row === 12);

  // First call parses and memoizes
  const firstSplit = SessionCore.splitMorningReport(row12);
  const stats1 = SessionCore.getCacheStats();
  assert.equal(stats1.splitCalls, 1);
  assert.equal(stats1.splitHits, 0);

  // Second call retrieves from cache
  const secondSplit = SessionCore.splitMorningReport(row12);
  const stats2 = SessionCore.getCacheStats();
  assert.equal(stats2.splitCalls, 2);
  assert.equal(stats2.splitHits, 1);
  assert.deepEqual(secondSplit[0].fields, firstSplit[0].fields);
});

test('Sprint Integration Gate: 6. Windowed list calculations and spacer rows', () => {
  const win = WindowedList.computeWindow({
    totalItems: 2800,
    itemHeight: 48,
    containerHeight: 600,
    scrollTop: 4800,
    overscan: 8
  });

  assert.ok(win.startIndex > 80);
  assert.ok(win.endIndex < 140);
  assert.ok(win.topSpacerHeight > 0);
  assert.ok(win.bottomSpacerHeight > 0);
  assert.equal(win.topSpacerHeight + win.bottomSpacerHeight + ((win.endIndex - win.startIndex) * 48), 2800 * 48);

  const spacer = WindowedList.defaultSpacer(win.topSpacerHeight, 'top', 7);
  assert.match(spacer, /matrix-spacer-row spacer-top/);
});

test('Sprint Integration Gate: 7. Static Asset Allowlist and security boundaries', async () => {
  const ALLOWED_ASSETS = [
    'index.html',
    'styles.css',
    'members.css',
    'morning-report.css',
    'session-core.js',
    'search-core.js',
    'identity.js',
    'offline.js',
    'logbook.js',
    'windowed-list.js',
    'members.js',
    'morning-report.js',
    'app.js',
    'workbook.json',
    'sw.js'
  ];

  // Build verification
  const buildContent = fs.readFileSync(path.join(ROOT, 'scripts', 'build.cjs'), 'utf8');
  for (const asset of ALLOWED_ASSETS) {
    assert.ok(buildContent.includes(`'${asset}'`), `Build must include allowlisted asset: ${asset}`);
  }

  // Server verification
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    for (const asset of ALLOWED_ASSETS) {
      const res = await fetch(`${baseUrl}/${asset}`);
      assert.equal(res.status, 200, `Asset /${asset} must be served with 200 OK`);
    }

    // Sensitive files must 404
    const forbiddenPaths = [
      '/historical-contributions.json',
      '/data/logbook-identities.json',
      '/data/member-aliases.json',
      '/.env',
      '/.git/config',
      '/package.json',
      '/README.md',
      '/docs/operational-completion.md'
    ];

    for (const forbidden of forbiddenPaths) {
      const res = await fetch(`${baseUrl}${forbidden}`);
      assert.equal(res.status, 404, `Forbidden path ${forbidden} must return 404 Not Found`);
    }
  } finally {
    server.close();
  }
});
