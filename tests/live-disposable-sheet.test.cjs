'use strict';

/**
 * Dedicated Live Google Sheets Integration Test Suite
 * ONLY runs when explicitly invoked with RUN_LIVE_SHEETS_TESTS=1
 * Guarantees original-value restoration on any mutated cell in finally block.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(envPath); } catch {}
}

const isEnabled = process.env.RUN_LIVE_SHEETS_TESTS === '1';

if (!isEnabled) {
  test('live-disposable-sheet: skipped by default (set RUN_LIVE_SHEETS_TESTS=1 to run against disposable sheet)', (t) => {
    t.skip('Skipped by default to keep npm test synthetic and offline');
  });
} else {
  const mutateHandler = require('../api/mutate.js');
  const { getCredentials, getAccessToken } = require('../api/_lib/sheets-reader.cjs');

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

  async function readLiveCell(range) {
    const sheetId = process.env.SYNC_SHEET_ID;
    const creds = getCredentials();
    const token = await getAccessToken(creds);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Read cell failed: ${res.statusText}`);
    const data = await res.json();
    return data.values?.[0]?.[0] || '';
  }

  async function restoreLiveCell(range, value) {
    const sheetId = process.env.SYNC_SHEET_ID;
    const creds = getCredentials();
    const token = await getAccessToken(creds);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [[value]] })
    });
  }

  test('live-disposable-sheet: round-trip write and guaranteed restoration for Morning Report', async () => {
    const targetRange = "'Morning Report'!G7";
    const originalValue = await readLiveCell(targetRange);
    const testVal = 'Live Audit Test Presenter';

    try {
      // 1. Mutate
      const { req: writeReq, res: writeRes, getResult: getWriteResult } = mockReqRes({
        body: {
          user: { isAuthenticated: true, name: 'LiveAuditRunner', email: 'audit@example.com' },
          dataset: 'Morning Report',
          stableId: 'mr-2026-12-31-spontaneous-6-00-am',
          field: 'Presenter',
          value: testVal,
          expectedPreviousValue: originalValue
        }
      });
      await mutateHandler(writeReq, writeRes);
      const writeResult = getWriteResult();
      assert.equal(writeResult.status, 200);
      assert.equal(writeResult.body.value, testVal);

      // Verify write landed
      const liveAfterWrite = await readLiveCell(targetRange);
      assert.equal(liveAfterWrite, testVal);
    } finally {
      // 2. Guaranteed restoration in finally block
      await restoreLiveCell(targetRange, originalValue);
      const restored = await readLiveCell(targetRange);
      assert.equal(restored, originalValue, 'Target cell must be restored to original value');
    }
  });
}
