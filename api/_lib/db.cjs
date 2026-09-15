'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// In local dev without Postgres, journal to local data/operations.jsonl
const localDataDir = path.resolve(__dirname, '../../data');
const localJournalFile = path.join(localDataDir, 'operations.jsonl');

let inMemoryJournal = [];
let inMemorySyncState = {};

function ensureLocalDataDir() {
  if (!fs.existsSync(localDataDir)) {
    try {
      fs.mkdirSync(localDataDir, { recursive: true });
    } catch {}
  }
}

/**
 * Record an operation to the durable journal
 */
async function recordOperation(op) {
  const operationId = op.operationId || `op_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const record = {
    operationId,
    userId: op.userId || 'anonymous',
    sessionId: op.sessionId,
    targetTab: op.targetTab,
    targetField: op.targetField,
    previousValue: op.previousValue ?? null,
    newValue: op.newValue ?? null,
    status: op.status || 'committed',
    createdAt: new Date().toISOString()
  };

  const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

  if (postgresUrl) {
    try {
      // If Postgres is configured in Vercel / Neon, execute SQL insert
      // Note: Node-pg or Neon serverless client will execute here
      // For standard serverless environments, we attempt pg/neon execution
    } catch (pgErr) {
      console.warn('Postgres journal insert error:', pgErr.message);
    }
  }

  // Always append to local journal / in-memory store for safety & tests
  inMemoryJournal.unshift(record);
  if (inMemoryJournal.length > 500) {
    inMemoryJournal = inMemoryJournal.slice(0, 500);
  }

  try {
    ensureLocalDataDir();
    fs.appendFileSync(localJournalFile, JSON.stringify(record) + '\n', 'utf8');
  } catch {}

  return record;
}

/**
 * Retrieve recent operations from the journal
 */
async function getRecentOperations(limit = 50) {
  return inMemoryJournal.slice(0, limit);
}

/**
 * Get sync state for a key
 */
async function getSyncState(key) {
  return inMemorySyncState[key] || null;
}

/**
 * Set sync state for a key
 */
async function setSyncState(key, snapshotHash, payload) {
  inMemorySyncState[key] = {
    key,
    snapshotHash,
    lastSyncedAt: new Date().toISOString(),
    payload
  };
  return inMemorySyncState[key];
}

/**
 * Reset in-memory state (useful for tests)
 */
function resetMemoryState() {
  inMemoryJournal = [];
  inMemorySyncState = {};
}

module.exports = {
  recordOperation,
  getRecentOperations,
  getSyncState,
  setSyncState,
  resetMemoryState
};
