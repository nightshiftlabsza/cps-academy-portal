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

const { createSyncHandler } = require('./_lib/sync-contract.cjs');
const { sheetsReader } = require('./_lib/sheets-reader.cjs');

function authValidator(req) {
  const token = process.env.SYNC_AUTH_TOKEN;
  if (!token) {
    return { authorized: true };
  }
  const authHeader = req.headers['authorization'] || '';
  if (authHeader === `Bearer ${token}`) {
    return { authorized: true };
  }
  return { authorized: false, message: 'Missing or invalid authorization token' };
}

module.exports = async function handlerEntry(req, res) {
  const handler = createSyncHandler({
    config: {
      sheetId: process.env.SYNC_SHEET_ID || null,
      allowedTabs: (process.env.SYNC_ALLOWED_TABS || '').split(',').map((s) => s.trim()).filter(Boolean),
      authToken: process.env.SYNC_AUTH_TOKEN || null
    },
    authValidator,
    sheetsReader
  });
  return handler(req, res);
};
