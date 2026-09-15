'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Auto-load .env.local if present in local dev
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch {}
}

const {
  getCredentials,
  getAccessToken,
  clearCache,
  findRowByStableId
} = require('./_lib/sheets-reader.cjs');

const MORNING_REPORT_COLUMNS = {
  'Facilitator': { col: 'F', index: 5 },
  'Presenter': { col: 'G', index: 6 },
  'Active participant 1': { col: 'H', index: 7 },
  'Active participant 2': { col: 'I', index: 8 },
  'Active participant 3': { col: 'J', index: 9 },
  'Active participant 4': { col: 'K', index: 10 },
  'Chat support': { col: 'L', index: 11 },
  'Notes': { col: 'M', index: 12 },
  'Scribe / teaching points sign-ups': { col: 'N', index: 13 }
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString('utf8'); });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = async function mutateHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  function sendJson(status, obj) {
    res.statusCode = status;
    res.end(JSON.stringify(obj));
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(405, { error: 'METHOD_NOT_ALLOWED', message: 'Only POST supported' });
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(400, { error: 'INVALID_JSON', message: 'Malformed JSON payload' });
  }

  const { dataset, stableId, field, value, expectedPreviousValue, user } = body || {};

  // 1. Authentication guard
  if (!user || !user.isAuthenticated) {
    return sendJson(401, { error: 'UNAUTHORIZED', message: 'Authentication required to mutate spreadsheet' });
  }

  // 2. Input validation
  if (!dataset || dataset !== 'Morning Report') {
    return sendJson(400, { error: 'INVALID_DATASET', message: 'Currently only Morning Report mutations are supported' });
  }

  if (!stableId || typeof stableId !== 'string') {
    return sendJson(400, { error: 'MISSING_STABLE_ID', message: 'A valid record stableId is required' });
  }

  const colDef = MORNING_REPORT_COLUMNS[field];
  if (!colDef) {
    return sendJson(400, {
      error: 'INVALID_FIELD',
      message: `Field "${field}" is not mutable. Allowed: ${Object.keys(MORNING_REPORT_COLUMNS).join(', ')}`
    });
  }

  const sheetId = process.env.SYNC_SHEET_ID;
  if (!sheetId) {
    return sendJson(503, { error: 'SHEET_NOT_CONFIGURED', message: 'SYNC_SHEET_ID is not configured' });
  }

  try {
    // 3. Resolve actual row number using deterministic stable ID
    const match = await findRowByStableId(sheetId, dataset, stableId);
    if (!match) {
      return sendJson(404, { error: 'RECORD_NOT_FOUND', message: `Could not locate record "${stableId}" in spreadsheet` });
    }

    const { rowNumber, values } = match;
    const currentValue = String(values[colDef.index] ?? '').trim();

    // 4. Concurrency / vacancy check
    if (expectedPreviousValue !== undefined) {
      const expectedClean = String(expectedPreviousValue).trim();
      if (currentValue !== expectedClean) {
        return sendJson(409, {
          error: 'SLOT_OCCUPIED',
          message: `Slot is already occupied by: "${currentValue || 'another user'}"`,
          currentValue
        });
      }
    }

    // 5. Execute cell update in Google Sheets
    const creds = getCredentials();
    const token = await getAccessToken(creds);

    const cellRange = `'${dataset}'!${colDef.col}${rowNumber}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`;

    const updateRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: cellRange,
        majorDimension: 'ROWS',
        values: [[String(value ?? '').trim()]]
      })
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return sendJson(500, { error: 'SHEETS_API_ERROR', message: `Failed to update sheet: ${errText}` });
    }

    // 6. Invalidate read cache so next snapshot fetch gets fresh data
    clearCache();

    return sendJson(200, {
      success: true,
      operation: 'updateCell',
      dataset,
      stableId,
      rowNumber,
      field,
      value: String(value ?? '').trim(),
      updatedRange: cellRange
    });
  } catch (err) {
    return sendJson(500, { error: 'MUTATION_ERROR', message: err.message });
  }
};
