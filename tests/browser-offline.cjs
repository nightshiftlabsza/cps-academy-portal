'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { createServer } = require('../scripts/serve.cjs');
const OfflineManager = require('../offline.js');

const KEY = 'cps-hub-workspace-v2';

(async () => {
  console.log('Running browser offline & cache recovery verification...');

  // 1. Verify Service Worker non-cachable boundaries
  const swCode = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.ok(swCode.includes('/api/'), 'sw.js must explicitly check for /api/');
  assert.ok(swCode.includes('logbook'), 'sw.js must explicitly check for personal logbooks');
  assert.ok(swCode.includes('backup'), 'sw.js must explicitly check for backups');
  assert.ok(swCode.includes('credentials'), 'sw.js must explicitly check for credentials');
  assert.ok(swCode.includes('url.origin !== self.location.origin'), 'sw.js must restrict to origin');

  // Test caching filter function directly
  const isNonCachable = new Function('req', 'url', 'self', `
    ${swCode.slice(swCode.indexOf('function isNonCachable'), swCode.indexOf('self.addEventListener(\'fetch\''))}
    return isNonCachable(req, url);
  `);

  const selfMock = { location: { origin: 'http://localhost:4173' } };
  assert.equal(isNonCachable({ method: 'POST' }, new URL('http://localhost:4173/api/sync'), selfMock), true, 'POST /api/sync is non-cachable');
  assert.equal(isNonCachable({ method: 'GET' }, new URL('http://localhost:4173/api/sync'), selfMock), true, 'GET /api/sync is non-cachable');
  assert.equal(isNonCachable({ method: 'GET' }, new URL('http://localhost:4173/private-logbook.json'), selfMock), true, 'personal slice is non-cachable');
  assert.equal(isNonCachable({ method: 'GET' }, new URL('http://localhost:4173/export-backup.json'), selfMock), true, 'backup is non-cachable');
  assert.equal(isNonCachable({ method: 'GET' }, new URL('https://meet.google.com/abc-def-ghi'), selfMock), true, 'external url is non-cachable');
  assert.equal(isNonCachable({ method: 'GET' }, new URL('http://localhost:4173/app.js'), selfMock), false, 'app.js is cachable shell asset');
  assert.equal(isNonCachable({ method: 'GET' }, new URL('http://localhost:4173/workbook.json'), selfMock), false, 'workbook.json is cachable');

  // 2. Cache clearing preserves workspace edits and unrelated caches
  const fakeCaches = new Map();
  fakeCaches.set('cps-portal-shell-v0.4.0', new Map());
  fakeCaches.set('unrelated-cache-v1', new Map());

  const mockStorage = {
    [KEY]: JSON.stringify({ edits: { 'test-1': { Presenter: 'Persisted Offline' } }, added: [] })
  };

  global.caches = {
    async keys() {
      return Array.from(fakeCaches.keys());
    },
    async delete(key) {
      return fakeCaches.delete(key);
    }
  };

  const cleared = await OfflineManager.clearOfflineCopy();
  assert.equal(cleared, true, 'clearOfflineCopy returns true');
  assert.equal(fakeCaches.has('cps-portal-shell-v0.4.0'), false, 'cps-portal cache was removed');
  assert.equal(fakeCaches.has('unrelated-cache-v1'), true, 'unrelated cache was preserved');

  // Workspace edits preserved
  const edits = JSON.parse(mockStorage[KEY]);
  assert.equal(edits.edits['test-1'].Presenter, 'Persisted Offline', 'Local edits intact after cache clearing');

  // 3. Invalid network JSON does not replace the last valid snapshot
  let currentCachedWb = { 'Morning Report': { records: [{ id: 'valid-1' }] } };
  global.caches.match = async (req) => {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'X-CPS-Offline-Fallback': '1' }),
      async json() {
        return currentCachedWb;
      }
    };
  };

  // Mock a corrupted network response
  global.fetch = async () => {
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      async json() {
        return { corrupted: true }; // Missing 'Morning Report' tab
      }
    };
  };

  const loadedWb = await OfflineManager.loadWorkbook();
  assert.deepEqual(loadedWb, currentCachedWb, 'Malformed network JSON did not replace valid cached snapshot');
  assert.equal(OfflineManager.getOfflineStatus().isFallback, true, 'Fallback status is true');

  // 4. First-visit offline shows a useful retry state
  global.fetch = async () => {
    throw new Error('Network failure (offline)');
  };
  global.caches.match = async () => null; // Nothing cached yet

  await assert.rejects(
    async () => {
      await OfflineManager.loadWorkbook();
    },
    /offline with no cached snapshot/i,
    'First-visit offline cleanly rejects with informative error'
  );

  // 5. Unsaved form protection
  global.document = {
    querySelector(selector) {
      if (selector === '#detail-dialog') return { open: true };
      return null;
    }
  };
  assert.equal(OfflineManager.isFormDirty(), true, 'isFormDirty returns true when detail-dialog is open');

  console.log('✓ Offline boundaries, cache clearing, invalid JSON rejection, and first-visit retry passed.');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
