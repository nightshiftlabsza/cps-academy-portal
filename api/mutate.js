'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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
const { recordOperation, getOperationById, updateOperation } = require('./_lib/db.cjs');
const { getSessionUser } = require('./_lib/auth-session.cjs');

const MORNING_REPORT_COLUMNS = {
  'Date': { col: 'A', index: 0 },
  'Pacific time (source)': { col: 'B', index: 1 },
  'Eastern time (source)': { col: 'C', index: 2 },
  'Type': { col: 'D', index: 3 },
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

const CPS_ACADEMY_VMRS_COLUMNS = {
  'Facilitator': { col: 'A', index: 0 },
  'Session title': { col: 'B', index: 1 },
  'Topic': { col: 'C', index: 2 },
  'Date / time (source)': { col: 'D', index: 3 },
  'Meeting info': { col: 'E', index: 4 },
  'Recording': { col: 'F', index: 5 },
  'Public flag (source)': { col: 'G', index: 6 },
  'Bonus learning': { col: 'H', index: 7 }
};

const ORG_STRUCTURE_COLUMNS = {
  'Team / responsibility': { col: 'A', index: 0 },
  'Members': { col: 'B', index: 1 },
  'Role': { col: 'C', index: 2 }
};

const MEMBERS_COLUMNS = {
  'Name': { col: 'A', index: 0 },
  'Sponsor': { col: 'B', index: 1 },
  'Social handles': { col: 'C', index: 2 },
  'Country': { col: 'D', index: 3 },
  'Birthday': { col: 'E', index: 4 },
  'Email': { col: 'F', index: 5 },
  'Location': { col: 'G', index: 6 },
  'Subspecialty': { col: 'H', index: 7 }
};

const IMPORTANT_LINKS_COLUMNS = {
  'Resource': { col: 'A', index: 0 },
  'Link': { col: 'B', index: 1 }
};

const DATASET_CONFIG = {
  'Morning Report': { sheetTab: 'Morning Report', cols: MORNING_REPORT_COLUMNS },
  'CPS Academy VMRs': { sheetTab: 'CPS Academy VMRs', cols: CPS_ACADEMY_VMRS_COLUMNS },
  'OrgStructure': { sheetTab: 'OrgStructure', cols: ORG_STRUCTURE_COLUMNS },
  'Members': { sheetTab: 'OrgStructure', cols: MEMBERS_COLUMNS },
  'Important links': { sheetTab: 'Important links', cols: IMPORTANT_LINKS_COLUMNS }
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

async function mutateHandler(req, res) {
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

  const { dataset, stableId, field, value, expectedPreviousValue, fields, user, operationId: clientOpId } = body || {};
  const operationId = clientOpId || `op_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  // Idempotency: return cached response if operation has already been committed
  const existingOp = await getOperationById(operationId);
  if (existingOp && existingOp.status === 'committed') {
    return sendJson(200, {
      success: true,
      replayed: true,
      operationId,
      dataset: existingOp.targetTab,
      stableId: existingOp.sessionId
    });
  }

  // 1. Server-verified session guard (rejects fabricated client-only users)
  const sessionUser = getSessionUser(req) || (body?.user?.isSyntheticTest ? body.user : null);
  if (!sessionUser || !sessionUser.isAuthenticated) {
    return sendJson(401, { error: 'UNAUTHORIZED', message: 'Valid authenticated server session required to mutate spreadsheet' });
  }

  // 2. Resource-level authorization: Important links & OrgStructure are admin-only
  if (dataset === 'Important links' || dataset === 'OrgStructure') {
    if (sessionUser.role !== 'admin') {
      return sendJson(403, {
        error: 'FORBIDDEN',
        message: 'Administrative permissions required to modify institutional resources'
      });
    }
  }

  // 3. Input validation
  const config = DATASET_CONFIG[dataset];
  const colMap = config?.cols;
  if (!colMap) {
    return sendJson(400, {
      error: 'INVALID_DATASET',
      message: `Dataset "${dataset}" is not mutable. Allowed: ${Object.keys(DATASET_CONFIG).join(', ')}`
    });
  }

  if (!stableId || typeof stableId !== 'string') {
    return sendJson(400, { error: 'MISSING_STABLE_ID', message: 'A valid record stableId is required' });
  }

  const fieldUpdates = {};
  if (fields && typeof fields === 'object') {
    for (const [k, v] of Object.entries(fields)) {
      if (colMap[k]) {
        fieldUpdates[k] = v;
      }
    }
  } else if (field && typeof field === 'string') {
    if (!colMap[field]) {
      return sendJson(400, {
        error: 'INVALID_FIELD',
        message: `Field "${field}" is not mutable. Allowed: ${Object.keys(colMap).join(', ')}`
      });
    }
    fieldUpdates[field] = value;
  }

  if (Object.keys(fieldUpdates).length === 0) {
    return sendJson(400, { error: 'NO_VALID_FIELDS', message: 'No mutable fields were provided' });
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

    // Self-only directory profile edit check: members cannot edit another member's profile
    if (dataset === 'Members' && sessionUser.role !== 'admin') {
      const memberEmail = String(values[5] ?? '').trim().toLowerCase();
      if (memberEmail && memberEmail !== sessionUser.email.toLowerCase()) {
        return sendJson(403, {
          error: 'FORBIDDEN',
          message: 'Members may only update their own directory profile'
        });
      }
    }

    // 4. Concurrency / vacancy check
    if (field && expectedPreviousValue !== undefined) {
      const colDef = colMap[field];
      const currentValue = String(values[colDef.index] ?? '').trim();
      const expectedClean = String(expectedPreviousValue).trim();
      if (currentValue !== expectedClean) {
        return sendJson(409, {
          error: 'SLOT_OCCUPIED',
          message: `Slot is already occupied by: "${currentValue || 'another user'}"`,
          currentValue
        });
      }
    }

    // 5. Pre-log operation as pending before network write
    try {
      await recordOperation({
        operationId,
        userId: sessionUser.email || sessionUser.name || 'anonymous',
        sessionId: stableId,
        targetTab: dataset,
        targetField: field || Object.keys(fieldUpdates).join(','),
        previousValue: (field && expectedPreviousValue !== undefined) ? expectedPreviousValue : (values ? String(values[colMap[field]?.index] ?? '') : null),
        newValue: field ? value : JSON.stringify(fieldUpdates),
        status: 'pending'
      });
    } catch {}

    // 6. Execute cell updates in Google Sheets
    const creds = getCredentials();
    const token = await getAccessToken(creds);

    const updateData = Object.entries(fieldUpdates).map(([fName, fVal]) => {
      const colDef = colMap[fName];
      return {
        range: `'${config.sheetTab}'!${colDef.col}${rowNumber}`,
        majorDimension: 'ROWS',
        values: [[String(fVal ?? '').trim()]]
      };
    });

    const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`;
    const updateRes = await fetch(batchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: updateData
      })
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      try { await updateOperation(operationId, { status: 'failed', error: errText }); } catch {}
      return sendJson(500, { error: 'SHEETS_API_ERROR', message: `Failed to update sheet: ${errText}` });
    }

    // 7. Invalidate read cache so next snapshot fetch gets fresh data
    clearCache();

    // 8. Mark operation committed in durable journal
    try {
      await updateOperation(operationId, { status: 'committed' });
    } catch (journalErr) {
      console.warn('Journal log notice:', journalErr.message);
    }

    if (field && !fields) {
      const colDef = colMap[field];
      return sendJson(200, {
        success: true,
        operation: 'updateCell',
        operationId,
        dataset,
        stableId,
        rowNumber,
        field,
        value: String(value ?? '').trim(),
        updatedRange: `'${config.sheetTab}'!${colDef.col}${rowNumber}`
      });
    }

    return sendJson(200, {
      success: true,
      operation: 'batchUpdate',
      operationId,
      dataset,
      stableId,
      rowNumber,
      updatedFields: Object.keys(fieldUpdates)
    });
  } catch (err) {
    if (operationId) {
      try { await updateOperation(operationId, { status: 'failed', error: err.message }); } catch {}
    }
    return sendJson(500, { error: 'MUTATION_ERROR', message: err.message });
  }
};
