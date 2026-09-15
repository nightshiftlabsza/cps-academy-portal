'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Auto-load .env.local if present in local dev
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(envPath); } catch {}
}

const { clearCache } = require('./_lib/sheets-reader.cjs');

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

module.exports = async function syncWebhookHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  function sendJson(status, obj) {
    res.statusCode = status;
    res.end(JSON.stringify(obj));
  }

  // 1. Method guard
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(405, { error: 'METHOD_NOT_ALLOWED', message: 'Only POST supported' });
  }

  // 2. Parse body
  let body;
  try {
    body = await parseBody(req);
  } catch {
    return sendJson(400, { error: 'INVALID_JSON', message: 'Malformed JSON payload' });
  }

  // 3. Validate shared webhook secret
  const expectedSecret = process.env.SYNC_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return sendJson(503, { error: 'WEBHOOK_NOT_CONFIGURED', message: 'SYNC_WEBHOOK_SECRET is not configured on this server' });
  }

  const receivedSecret = (body && typeof body.secret === 'string') ? body.secret.trim() : '';
  if (!receivedSecret || receivedSecret !== expectedSecret) {
    return sendJson(401, { error: 'UNAUTHORIZED', message: 'Invalid or missing webhook secret' });
  }

  // 4. Invalidate the read cache so next poll fetches fresh data from Google Sheets
  clearCache();

  const sheet = (body && typeof body.sheet === 'string') ? body.sheet : 'unknown';
  const editedRange = (body && typeof body.editedRange === 'string') ? body.editedRange : 'unknown';

  return sendJson(200, {
    success: true,
    message: 'Cache cleared. Next poll will fetch fresh data.',
    sheet,
    editedRange
  });
};
