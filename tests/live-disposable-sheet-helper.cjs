'use strict';

/**
 * Helper module for Safe Live Disposable Sheet Integration Testing
 *
 * ARCHITECTURAL SAFETY PRINCIPLES:
 * 1. Target Refusal: Never run without explicit opt-in (RUN_LIVE_SHEETS_TESTS=1).
 *    Never run against the production SYNC_SHEET_ID.
 *    Require a separately specified DISPOSABLE_TEST_SHEET_ID and verify its fixture marker.
 * 2. Real Signed-Session Authentication: Pass HMAC-SHA256 Bearer tokens generated via
 *    the real auth-session module. Never rely on unauthenticated request body properties.
 * 3. Dynamic Fixture & Range Proof: Dynamically resolve stableId and field to sheet coordinates,
 *    proving that the mutation target range and restoration cell are identical.
 * 4. Durable Pre-Write Crash Recovery: A finally block alone CANNOT guarantee restoration if
 *    the process crashes, is killed (OOM/SIGKILL), or loses power/network mid-mutation.
 *    Target range and pre-mutation value are durably saved to disk BEFORE any write request.
 * 5. Verified Restoration: Every restoration request must verify HTTP 200 and re-read the
 *    cell to confirm exact value restoration before clearing the durable recovery record.
 * 6. Privacy: Never log or store credentials, secrets, or private member data.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createSessionToken } = require('../api/_lib/auth-session.cjs');

const DEFAULT_RECOVERY_FILE = path.resolve(__dirname, '../data/.live-test-recovery.json');

/**
 * Validates the live test target parameters and prevents accidental runs against production.
 */
function validateDisposableTarget(options = {}) {
  const {
    runLiveOptIn = process.env.RUN_LIVE_SHEETS_TESTS,
    disposableSheetId = process.env.DISPOSABLE_TEST_SHEET_ID,
    productionSheetId = process.env.SYNC_SHEET_ID,
    verifyFixtureFn = null
  } = options;

  if (runLiveOptIn !== '1') {
    return {
      allowed: false,
      reason: 'RUN_LIVE_SHEETS_TESTS is not set to 1. Live integration suite is disabled by default.'
    };
  }

  if (!disposableSheetId || typeof disposableSheetId !== 'string' || !disposableSheetId.trim()) {
    throw new Error(
      'Target refusal: DISPOSABLE_TEST_SHEET_ID must be provided as an explicit, separate environment variable for live testing.'
    );
  }

  const cleanDisposableId = disposableSheetId.trim();

  if (productionSheetId && cleanDisposableId === productionSheetId.trim()) {
    throw new Error(
      `Target refusal: DISPOSABLE_TEST_SHEET_ID matches production SYNC_SHEET_ID ("${cleanDisposableId}"). Writes to production sheet are strictly prohibited.`
    );
  }

  return {
    allowed: true,
    targetSheetId: cleanDisposableId
  };
}

/**
 * Verifies that a target spreadsheet contains explicit disposable/test fixture metadata.
 */
async function verifyDisposableFixture(sheetId, token, fetchFn = global.fetch) {
  if (!sheetId) throw new Error('Cannot verify fixture without a sheetId');
  if (!token) throw new Error('Cannot verify fixture without an auth token');

  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title,sheets.properties.title`;
  const res = await fetchFn(metaUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Target refusal: Unable to fetch spreadsheet metadata (${res.status}): ${errBody}`);
  }

  const meta = await res.json();
  const title = String(meta.properties?.title || '').toLowerCase();

  // Acceptance criteria: Title must contain 'disposable', 'test', 'fixture', or 'sandbox'
  const allowedKeywords = ['disposable', 'test', 'fixture', 'sandbox'];
  const hasKeyword = allowedKeywords.some(kw => title.includes(kw));

  if (!hasKeyword) {
    throw new Error(
      `Target refusal: Spreadsheet title "${meta.properties?.title}" does not identify as a disposable fixture (must contain "disposable", "test", "fixture", or "sandbox").`
    );
  }

  return {
    verified: true,
    title: meta.properties?.title
  };
}

/**
 * Creates synthetic authenticated request headers using the real signed-session HMAC mechanism.
 */
function createLiveTestAuth(role = 'admin') {
  const user = {
    email: 'synthetic-audit-runner@cpsolvers.com',
    name: 'Synthetic Live Audit Runner',
    role,
    id: 'mem-synthetic-live-audit',
    isAuthenticated: true
  };

  const token = createSessionToken(user);
  return {
    user,
    token,
    headers: {
      'authorization': `Bearer ${token}`,
      'content-type': 'application/json'
    }
  };
}

/**
 * Dynamically resolves and proves that the stableId, target field, and cell coordinates
 * identify the exact same fixture cell.
 */
async function resolveAndVerifyFixtureTarget(options = {}) {
  const {
    sheetId,
    dataset,
    stableId,
    field,
    datasetConfig,
    findRowFn
  } = options;

  if (!sheetId) throw new Error('sheetId is required to resolve fixture target');
  if (!dataset) throw new Error('dataset is required to resolve fixture target');
  if (!stableId) throw new Error('stableId is required to resolve fixture target');
  if (!field) throw new Error('field is required to resolve fixture target');
  if (!datasetConfig || !datasetConfig[dataset]) {
    throw new Error(`Invalid dataset "${dataset}". Config required.`);
  }

  const colDef = datasetConfig[dataset].cols[field];
  if (!colDef) {
    throw new Error(`Field "${field}" is not defined in dataset "${dataset}" column map.`);
  }

  const match = await findRowFn(sheetId, dataset, stableId);
  if (!match) {
    throw new Error(`Synthetic fixture record "${stableId}" was not found in sheet "${sheetId}".`);
  }

  const { rowNumber, values } = match;
  const sheetTab = datasetConfig[dataset].sheetTab;
  const targetRange = `'${sheetTab}'!${colDef.col}${rowNumber}`;
  const originalValue = String(values[colDef.index] ?? '');

  return {
    rowNumber,
    colLetter: colDef.col,
    colIndex: colDef.index,
    targetRange,
    originalValue,
    sheetTab,
    stableId,
    field
  };
}

/**
 * Durably saves recovery state to disk prior to executing a live mutation.
 * This guarantees recoverable state even if the process crashes, is terminated,
 * or loses connectivity mid-operation.
 */
function writeDurableRecovery(recoveryData, recoveryFilePath = DEFAULT_RECOVERY_FILE) {
  if (!recoveryData || !recoveryData.targetRange) {
    throw new Error('Valid recovery data with targetRange is required');
  }

  const payload = {
    sheetId: recoveryData.sheetId,
    dataset: recoveryData.dataset,
    stableId: recoveryData.stableId,
    field: recoveryData.field,
    targetRange: recoveryData.targetRange,
    originalValue: recoveryData.originalValue ?? '',
    timestamp: new Date().toISOString(),
    operationId: recoveryData.operationId || null
  };

  const dir = path.dirname(recoveryFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(recoveryFilePath, JSON.stringify(payload, null, 2), 'utf8');
  return recoveryFilePath;
}

/**
 * Removes the durable recovery file after verified successful restoration.
 */
function clearDurableRecovery(recoveryFilePath = DEFAULT_RECOVERY_FILE) {
  try {
    if (fs.existsSync(recoveryFilePath)) {
      fs.unlinkSync(recoveryFilePath);
    }
  } catch {}
}

/**
 * Reads the current durable recovery record, if present.
 */
function readDurableRecovery(recoveryFilePath = DEFAULT_RECOVERY_FILE) {
  try {
    if (fs.existsSync(recoveryFilePath)) {
      const raw = fs.readFileSync(recoveryFilePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

/**
 * Restores a cell value via Google Sheets API, validates the HTTP response,
 * and re-reads the cell to guarantee value restoration.
 */
async function restoreAndVerifyLiveCell(options = {}) {
  const {
    sheetId,
    targetRange,
    originalValue,
    token,
    fetchFn = global.fetch
  } = options;

  if (!sheetId) throw new Error('sheetId is required for restoration');
  if (!targetRange) throw new Error('targetRange is required for restoration');
  if (!token) throw new Error('token is required for restoration');

  const putUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(targetRange)}?valueInputOption=USER_ENTERED`;
  const putRes = await fetchFn(putUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: [[originalValue]] })
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`Restoration request failed (${putRes.status}): ${errText}`);
  }

  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(targetRange)}?valueRenderOption=FORMATTED_VALUE`;
  const getRes = await fetchFn(getUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!getRes.ok) {
    const getErrText = await getRes.text();
    throw new Error(`Restoration read-back verification failed (${getRes.status}): ${getErrText}`);
  }

  const getData = await getRes.json();
  const restoredValue = getData.values?.[0]?.[0] || '';

  if (restoredValue !== originalValue) {
    throw new Error(
      `Restoration mismatch: Target cell ${targetRange} has "${restoredValue}", expected original value "${originalValue}".`
    );
  }

  return {
    success: true,
    restoredValue
  };
}

module.exports = {
  DEFAULT_RECOVERY_FILE,
  validateDisposableTarget,
  verifyDisposableFixture,
  createLiveTestAuth,
  resolveAndVerifyFixtureTarget,
  writeDurableRecovery,
  clearDurableRecovery,
  readDurableRecovery,
  restoreAndVerifyLiveCell
};
