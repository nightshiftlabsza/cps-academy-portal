'use strict';

/**
 * Dedicated Live Google Sheets Integration Test Suite
 * ONLY runs when explicitly invoked with RUN_LIVE_SHEETS_TESTS=1 and DISPOSABLE_TEST_SHEET_ID.
 *
 * SAFETY SAFEGUARDS:
 * 1. Strict Target Refusal: Will NOT run against production SYNC_SHEET_ID or without DISPOSABLE_TEST_SHEET_ID.
 * 2. Fixture Verification: Refuses to write unless target spreadsheet verifies as an intended test fixture.
 * 3. Real Signed Session: Authenticates through valid signed HMAC Bearer token.
 * 4. Dynamic Fixture Proof: Proves stableId, field, and cell coordinates resolve to the exact same cell.
 * 5. Pre-Write Durable Recovery: State is saved to disk before mutation. A finally block alone cannot
 *    guarantee restoration after an unhandled process crash, SIGKILL, or network drop.
 * 6. Verified Restoration: Confirms HTTP 200 on Sheets PUT and re-reads the cell to assert restored value.
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
  test('live-disposable-sheet: skipped by default (requires RUN_LIVE_SHEETS_TESTS=1 and DISPOSABLE_TEST_SHEET_ID)', (t) => {
    t.skip('Skipped by default to keep npm test purely offline and synthetic.');
  });
} else {
  const {
    validateDisposableTarget,
    verifyDisposableFixture,
    createLiveTestAuth,
    resolveAndVerifyFixtureTarget,
    writeDurableRecovery,
    clearDurableRecovery,
    restoreAndVerifyLiveCell
  } = require('./live-disposable-sheet-helper.cjs');
  const mutateHandler = require('../api/mutate.js');
  const sheetsReader = require('../api/_lib/sheets-reader.cjs');

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

  async function readLiveCell(sheetId, range, token) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Read cell failed: ${res.statusText}`);
    const data = await res.json();
    return data.values?.[0]?.[0] || '';
  }

  test('live-disposable-sheet: verified target proof, signed session, and durable recovery', async () => {
    // 1. Validate target and refuse production sheet
    const targetValidation = validateDisposableTarget({
      runLiveOptIn: process.env.RUN_LIVE_SHEETS_TESTS,
      disposableSheetId: process.env.DISPOSABLE_TEST_SHEET_ID,
      productionSheetId: process.env.SYNC_SHEET_ID
    });
    const disposableSheetId = targetValidation.targetSheetId;

    // 2. Fetch API token and verify fixture marker
    const creds = sheetsReader.getCredentials();
    const token = await sheetsReader.getAccessToken(creds);
    await verifyDisposableFixture(disposableSheetId, token);

    // 3. Make target unambiguous: set SYNC_SHEET_ID to the verified disposable sheet ID
    const previousSyncSheetId = process.env.SYNC_SHEET_ID;
    process.env.SYNC_SHEET_ID = disposableSheetId;

    // 4. Authenticate via real signed session token
    const auth = createLiveTestAuth('admin');

    // 5. Dynamically resolve and prove fixture target range
    const dataset = 'Morning Report';
    const stableId = 'mr-2026-12-31-spontaneous-6-00-am';
    const field = 'Presenter';
    const testVal = 'Synthetic Live Audit Presenter';

    const fixtureTarget = await resolveAndVerifyFixtureTarget({
      sheetId: disposableSheetId,
      dataset,
      stableId,
      field,
      datasetConfig: mutateHandler.DATASET_CONFIG,
      findRowFn: sheetsReader.findRowByStableId
    });

    const { targetRange, originalValue } = fixtureTarget;

    // 6. Pre-write durable recovery logging (guarantees recovery if process terminates or crashes)
    writeDurableRecovery({
      sheetId: disposableSheetId,
      dataset,
      stableId,
      field,
      targetRange,
      originalValue
    });

    try {
      // 7. Dispatch mutation with real signed session auth
      const { req: writeReq, res: writeRes, getResult: getWriteResult } = mockReqRes({
        headers: auth.headers,
        body: {
          dataset,
          stableId,
          field,
          value: testVal,
          expectedPreviousValue: originalValue
        }
      });

      await mutateHandler(writeReq, writeRes);
      const writeResult = getWriteResult();

      assert.equal(writeResult.status, 200, `Mutation failed: ${JSON.stringify(writeResult.body)}`);
      assert.equal(writeResult.body.value, testVal);
      // Prove mutation targeted the dynamically resolved fixture cell
      assert.equal(writeResult.body.updatedRange, targetRange, 'Updated range must match dynamically proven target');

      // 8. Verify live cell reflect change
      const liveAfterWrite = await readLiveCell(disposableSheetId, targetRange, token);
      assert.equal(liveAfterWrite, testVal, 'Live cell must reflect mutation');
    } finally {
      // 9. Verified restoration and cleanup
      try {
        const restoreRes = await restoreAndVerifyLiveCell({
          sheetId: disposableSheetId,
          targetRange,
          originalValue,
          token
        });
        assert.equal(restoreRes.success, true);
        clearDurableRecovery();
      } catch (restoreErr) {
        console.error('FATAL: Cell restoration failed. Durable recovery file preserved at data/.live-test-recovery.json:', restoreErr);
        throw restoreErr;
      } finally {
        process.env.SYNC_SHEET_ID = previousSyncSheetId;
      }
    }
  });
}
