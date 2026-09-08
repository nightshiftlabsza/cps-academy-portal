'use strict';

const MAX_BODY_BYTES = 64 * 1024; // 64 KiB

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      return resolve(req.body);
    }
    if (typeof req.body === 'string') {
      try {
        return resolve(JSON.parse(req.body));
      } catch (e) {
        return reject({ status: 400, code: 'INVALID_JSON', message: 'Malformed JSON payload' });
      }
    }

    let raw = '';
    let bytes = 0;

    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        reject({ status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 64 KiB limit' });
        return;
      }
      raw += chunk.toString('utf8');
    });

    req.on('end', () => {
      if (!raw.trim()) {
        return reject({ status: 400, code: 'EMPTY_BODY', message: 'Request body cannot be empty' });
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject({ status: 400, code: 'INVALID_JSON', message: 'Malformed JSON payload' });
      }
    });

    req.on('error', (err) => {
      reject({ status: 400, code: 'READ_ERROR', message: err.message });
    });
  });
}

function validateSchema(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, message: 'Request body must be a JSON object' };
  }

  const allowedKeys = new Set(['schemaVersion', 'operation', 'requestId', 'knownSnapshotHash']);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      return { valid: false, message: `Unknown or disallowed property: ${key}` };
    }
  }

  if (body.schemaVersion !== 1) {
    return { valid: false, message: 'schemaVersion must be 1' };
  }

  if (body.operation !== 'readSnapshot') {
    return { valid: false, message: 'operation must be "readSnapshot"' };
  }

  if (typeof body.requestId !== 'string' || !body.requestId.trim() || body.requestId.length > 128) {
    return { valid: false, message: 'requestId must be a non-empty string of up to 128 characters' };
  }

  if (body.knownSnapshotHash !== undefined) {
    if (typeof body.knownSnapshotHash !== 'string' || !body.knownSnapshotHash.trim() || body.knownSnapshotHash.length > 128) {
      return { valid: false, message: 'knownSnapshotHash must be a non-empty string of up to 128 characters' };
    }
  }

  return { valid: true };
}

function createSyncHandler(options = {}) {
  const {
    config = {
      sheetId: process.env.SYNC_SHEET_ID || null,
      allowedTabs: (process.env.SYNC_ALLOWED_TABS || '').split(',').map((s) => s.trim()).filter(Boolean),
      authToken: process.env.SYNC_AUTH_TOKEN || null
    },
    authValidator = null,
    sheetsReader = null
  } = options;

  return async function handleSyncRequest(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    function sendError(status, code, message) {
      res.statusCode = status;
      res.end(JSON.stringify({ error: code, message }));
    }

    // 1. Method validation
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendError(405, 'METHOD_NOT_ALLOWED', 'Only POST requests are supported');
    }

    // 2. Content-Type validation
    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (!ct.includes('application/json')) {
      return sendError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
    }

    // 3. Body parsing and size check
    let body;
    try {
      body = await parseBody(req);
    } catch (err) {
      return sendError(err.status || 400, err.code || 'BAD_REQUEST', err.message);
    }

    // 4. Schema validation
    const schemaValidation = validateSchema(body);
    if (!schemaValidation.valid) {
      return sendError(400, 'INVALID_SCHEMA', schemaValidation.message);
    }

    // 5. Server configuration validation
    const isConfigured = Boolean(config && config.sheetId);
    if (!isConfigured) {
      return sendError(503, 'SYNC_NOT_CONFIGURED', 'Snapshot sync is not configured on this server');
    }

    // 6. Authentication validation
    if (typeof authValidator === 'function') {
      const authResult = await authValidator(req);
      if (!authResult || !authResult.authorized) {
        return sendError(401, 'UNAUTHORIZED', authResult?.message || 'Authentication failed');
      }
    } else {
      // Default: require config.authToken
      const authHeader = req.headers['authorization'] || '';
      if (!config.authToken || authHeader !== `Bearer ${config.authToken}`) {
        return sendError(401, 'UNAUTHORIZED', 'Missing or invalid authorization token');
      }
    }

    // 7. Sheets reader execution
    if (typeof sheetsReader !== 'function') {
      return sendError(503, 'SYNC_NOT_CONFIGURED', 'Sheets reader implementation is unavailable');
    }

    try {
      const result = await sheetsReader(config, {
        knownSnapshotHash: body.knownSnapshotHash
      });

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          schemaVersion: 1,
          operation: 'readSnapshot',
          requestId: body.requestId,
          snapshotHash: result.snapshotHash,
          snapshotDate: result.snapshotDate,
          modified: result.modified !== false,
          ...(result.modified !== false ? { workbook: result.workbook } : {})
        })
      );
    } catch (readErr) {
      sendError(500, 'READER_ERROR', 'Failed to read spreadsheet snapshot');
    }
  };
}

const defaultHandler = createSyncHandler();

module.exports = {
  createSyncHandler,
  defaultHandler,
  validateSchema,
  MAX_BODY_BYTES
};
