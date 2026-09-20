'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  validateDisposableTarget,
  verifyDisposableFixture,
  createLiveTestAuth,
  resolveAndVerifyFixtureTarget,
  writeDurableRecovery,
  clearDurableRecovery,
  readDurableRecovery,
  restoreAndVerifyLiveCell
} = require('./live-disposable-sheet-helper.cjs');

const mutateHandler = require('../api/mutate.js');
const { getSessionUser } = require('../api/_lib/auth-session.cjs');

const TEST_RECOVERY_FILE = path.resolve(__dirname, '../data/.test-safety-recovery.json');

test.beforeEach(() => {
  if (fs.existsSync(TEST_RECOVERY_FILE)) {
    try { fs.unlinkSync(TEST_RECOVERY_FILE); } catch {}
  }
});

test.afterEach(() => {
  if (fs.existsSync(TEST_RECOVERY_FILE)) {
    try { fs.unlinkSync(TEST_RECOVERY_FILE); } catch {}
  }
});

// -------------------------------------------------------------
// 1. Target Refusal & Safety Opt-In Tests
// -------------------------------------------------------------

test('safety: live suite disabled when RUN_LIVE_SHEETS_TESTS is not "1"', () => {
  const checkUnset = validateDisposableTarget({ runLiveOptIn: undefined });
  assert.equal(checkUnset.allowed, false);
  assert.match(checkUnset.reason, /disabled by default/);

  const checkZero = validateDisposableTarget({ runLiveOptIn: '0' });
  assert.equal(checkZero.allowed, false);

  const checkTrue = validateDisposableTarget({ runLiveOptIn: 'true' });
  assert.equal(checkTrue.allowed, false);
});

test('safety: throws target refusal when DISPOSABLE_TEST_SHEET_ID is missing or whitespace', () => {
  assert.throws(() => {
    validateDisposableTarget({ runLiveOptIn: '1', disposableSheetId: '' });
  }, /DISPOSABLE_TEST_SHEET_ID must be provided/);

  assert.throws(() => {
    validateDisposableTarget({ runLiveOptIn: '1', disposableSheetId: '   ' });
  }, /DISPOSABLE_TEST_SHEET_ID must be provided/);

  assert.throws(() => {
    validateDisposableTarget({ runLiveOptIn: '1', disposableSheetId: null });
  }, /DISPOSABLE_TEST_SHEET_ID must be provided/);
});

test('safety: strictly refuses to run if DISPOSABLE_TEST_SHEET_ID matches production SYNC_SHEET_ID', () => {
  const prodId = '1QBgiknR05XihR1JkND8dBCY6NFfSum0142pGMIOquh8';
  assert.throws(() => {
    validateDisposableTarget({
      runLiveOptIn: '1',
      disposableSheetId: prodId,
      productionSheetId: prodId
    });
  }, /matches production SYNC_SHEET_ID/);

  // Also verify whitespace-trimmed matching
  assert.throws(() => {
    validateDisposableTarget({
      runLiveOptIn: '1',
      disposableSheetId: `  ${prodId}  `,
      productionSheetId: prodId
    });
  }, /matches production SYNC_SHEET_ID/);
});

test('safety: accepts distinct disposable target when properly configured', () => {
  const result = validateDisposableTarget({
    runLiveOptIn: '1',
    disposableSheetId: 'disposable-sheet-abc-123',
    productionSheetId: 'production-sheet-xyz-999'
  });
  assert.equal(result.allowed, true);
  assert.equal(result.targetSheetId, 'disposable-sheet-abc-123');
});

// -------------------------------------------------------------
// 2. Fixture Verification Checks
// -------------------------------------------------------------

test('safety: verifyDisposableFixture rejects spreadsheet title lacking disposable/test keyword', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      properties: { title: 'CPS Academy - Master Production Workbook' }
    })
  });

  await assert.rejects(async () => {
    await verifyDisposableFixture('some-sheet-id', 'fake-token', mockFetch);
  }, /does not identify as a disposable fixture/);
});

test('safety: verifyDisposableFixture accepts spreadsheet title with fixture keyword', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      properties: { title: 'CPS Academy [Disposable Test Fixture]' }
    })
  });

  const res = await verifyDisposableFixture('disposable-123', 'fake-token', mockFetch);
  assert.equal(res.verified, true);
});

// -------------------------------------------------------------
// 3. Real Signed Session Authentication Tests
// -------------------------------------------------------------

test('auth: createLiveTestAuth generates signed session token verifiable by getSessionUser', () => {
  const auth = createLiveTestAuth('admin');
  assert.ok(auth.token);
  assert.ok(auth.headers.authorization.startsWith('Bearer '));

  const mockReq = { headers: auth.headers };
  const user = getSessionUser(mockReq);
  assert.ok(user);
  assert.equal(user.isAuthenticated, true);
  assert.equal(user.role, 'admin');
  assert.equal(user.email, 'synthetic-audit-runner@cpsolvers.com');
});

test('auth: mutateHandler rejects unauthenticated requests and requests with only body identity', async () => {
  function mockReqRes(options = {}) {
    const { body = {}, headers = {} } = options;
    let statusCode = 200;
    let bodySent = '';
    return {
      req: { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body },
      res: {
        setHeader() {},
        get statusCode() { return statusCode; },
        set statusCode(v) { statusCode = v; },
        end(chunk) { if (chunk) bodySent += chunk; }
      },
      getResult: () => ({ status: statusCode, body: bodySent ? JSON.parse(bodySent) : null })
    };
  }

  // Request with body user only (the old faulty pattern)
  const { req, res, getResult } = mockReqRes({
    body: {
      user: { isAuthenticated: true, email: 'fake@example.com' },
      dataset: 'Morning Report',
      stableId: 'mr-2026-12-31-spontaneous-6-00-am',
      field: 'Presenter',
      value: 'Zak'
    }
  });

  await mutateHandler(req, res);
  const result = getResult();
  assert.equal(result.status, 401, 'Request with body.user only must return 401 UNAUTHORIZED');
  assert.equal(result.body.error, 'UNAUTHORIZED');
});

// -------------------------------------------------------------
// 4. Dynamic Fixture Target Proof Tests
// -------------------------------------------------------------

test('target-proof: dynamically resolves row, column, and range from synthetic fixture', async () => {
  const mockFindRow = async (sheetId, dataset, stableId) => {
    if (stableId === 'mr-2026-12-31-spontaneous-6-00-am') {
      const values = Array(15).fill('');
      values[6] = 'Original Presenter Val'; // Column G is index 6
      return {
        rowNumber: 7,
        stableId,
        values
      };
    }
    return null;
  };

  const fixture = await resolveAndVerifyFixtureTarget({
    sheetId: 'sheet-123',
    dataset: 'Morning Report',
    stableId: 'mr-2026-12-31-spontaneous-6-00-am',
    field: 'Presenter',
    datasetConfig: mutateHandler.DATASET_CONFIG,
    findRowFn: mockFindRow
  });

  assert.equal(fixture.rowNumber, 7);
  assert.equal(fixture.colLetter, 'G');
  assert.equal(fixture.targetRange, "'Morning Report'!G7");
  assert.equal(fixture.originalValue, 'Original Presenter Val');
});

test('target-proof: throws when fixture record is missing in sheet', async () => {
  const mockFindRow = async () => null;

  await assert.rejects(async () => {
    await resolveAndVerifyFixtureTarget({
      sheetId: 'sheet-123',
      dataset: 'Morning Report',
      stableId: 'nonexistent-stable-id',
      field: 'Presenter',
      datasetConfig: mutateHandler.DATASET_CONFIG,
      findRowFn: mockFindRow
    });
  }, /was not found in sheet/);
});

// -------------------------------------------------------------
// 5. Pre-Write Durable Recovery Tests
// -------------------------------------------------------------

test('durable-recovery: preserves target and original value on disk before write', () => {
  const recoveryData = {
    sheetId: 'disposable-sheet-123',
    dataset: 'Morning Report',
    stableId: 'mr-2026-12-31-spontaneous-6-00-am',
    field: 'Presenter',
    targetRange: "'Morning Report'!G7",
    originalValue: 'Original Unmutated Name',
    operationId: 'op_test_123'
  };

  writeDurableRecovery(recoveryData, TEST_RECOVERY_FILE);
  assert.ok(fs.existsSync(TEST_RECOVERY_FILE), 'Recovery file must exist on disk');

  const readBack = readDurableRecovery(TEST_RECOVERY_FILE);
  assert.equal(readBack.sheetId, 'disposable-sheet-123');
  assert.equal(readBack.targetRange, "'Morning Report'!G7");
  assert.equal(readBack.originalValue, 'Original Unmutated Name');
  assert.ok(readBack.timestamp);
  // Ensure no credentials, tokens, or passwords leaked into recovery file
  assert.equal(readBack.token, undefined);
  assert.equal(readBack.credentials, undefined);

  clearDurableRecovery(TEST_RECOVERY_FILE);
  assert.equal(fs.existsSync(TEST_RECOVERY_FILE), false, 'Recovery file should be removed on clean cleanup');
});

// -------------------------------------------------------------
// 6. Restoration Error Handling & Verification Tests
// -------------------------------------------------------------

test('restoration: throws descriptive error if Sheets API PUT fails', async () => {
  const mockFailingFetch = async (url, options) => {
    if (options?.method === 'PUT') {
      return {
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable'
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  await assert.rejects(async () => {
    await restoreAndVerifyLiveCell({
      sheetId: 'sheet-123',
      targetRange: "'Morning Report'!G7",
      originalValue: 'Original',
      token: 'fake-token',
      fetchFn: mockFailingFetch
    });
  }, /Restoration request failed \(503\): Service Unavailable/);
});

test('restoration: throws mismatch error if read-back does not match restored value', async () => {
  const mockMismatchFetch = async (url, options) => {
    if (options?.method === 'PUT') {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    // Read-back returns corrupted/different value
    return {
      ok: true,
      json: async () => ({ values: [['Wrong Value']] })
    };
  };

  await assert.rejects(async () => {
    await restoreAndVerifyLiveCell({
      sheetId: 'sheet-123',
      targetRange: "'Morning Report'!G7",
      originalValue: 'Original Value',
      token: 'fake-token',
      fetchFn: mockMismatchFetch
    });
  }, /Restoration mismatch/);
});

test('restoration: succeeds when PUT succeeds and read-back matches originalValue', async () => {
  let putCalled = false;
  const mockSuccessFetch = async (url, options) => {
    if (options?.method === 'PUT') {
      putCalled = true;
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return {
      ok: true,
      json: async () => ({ values: [['Original Value']] })
    };
  };

  const res = await restoreAndVerifyLiveCell({
    sheetId: 'sheet-123',
    targetRange: "'Morning Report'!G7",
    originalValue: 'Original Value',
    token: 'fake-token',
    fetchFn: mockSuccessFetch
  });

  assert.equal(putCalled, true);
  assert.equal(res.success, true);
  assert.equal(res.restoredValue, 'Original Value');
});
