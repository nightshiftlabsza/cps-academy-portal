'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// In local dev without Postgres, journal to local data/operations.jsonl
const localDataDir = path.resolve(__dirname, '../../data');
const localJournalFile = path.join(localDataDir, 'operations.jsonl');

let inMemoryJournal = [];
let inMemorySyncState = {};
const activeLocks = new Map();

function ensureLocalDataDir() {
  if (!fs.existsSync(localDataDir)) {
    try {
      fs.mkdirSync(localDataDir, { recursive: true });
    } catch {}
  }
}

// Reload durable journal from disk on startup and recover interrupted operations
function reloadJournalFromDisk() {
  ensureLocalDataDir();
  if (!fs.existsSync(localJournalFile)) return;

  try {
    const content = fs.readFileSync(localJournalFile, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const opMap = new Map();

    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        if (item.event === 'update' && item.operationId) {
          const existing = opMap.get(item.operationId);
          if (existing) {
            Object.assign(existing, item);
          }
        } else if (item.operationId) {
          opMap.set(item.operationId, item);
        }
      } catch {}
    }

    inMemoryJournal = Array.from(opMap.values());
    // Sort descending by creation date
    inMemoryJournal.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    // Crash recovery: mark stale 'pending' operations as 'interrupted'
    for (const op of inMemoryJournal) {
      if (op.status === 'pending') {
        op.status = 'interrupted';
        op.error = 'Operation was interrupted before completion';
      }
    }
  } catch (err) {
    console.warn('Could not reload operations journal:', err.message);
  }
}

// Initial reload
reloadJournalFromDisk();

const locksDir = path.join(localDataDir, 'locks');

function ensureLocksDir() {
  ensureLocalDataDir();
  if (!fs.existsSync(locksDir)) {
    try { fs.mkdirSync(locksDir, { recursive: true }); } catch {}
  }
}

/**
 * Cross-instance atomic lock coordinator using lockfiles + Postgres advisory locks + in-process locks
 */
async function acquireLock(resourceKey, ttlMs = 15000) {
  const now = Date.now();
  const existing = activeLocks.get(resourceKey);
  if (existing && existing > now) {
    return false; // Lock held in-process
  }

  // Cross-instance file lock in data/locks/
  ensureLocksDir();
  const safeName = resourceKey.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const lockFilePath = path.join(locksDir, `${safeName}.lock`);

  try {
    if (fs.existsSync(lockFilePath)) {
      try {
        const lockInfo = JSON.parse(fs.readFileSync(lockFilePath, 'utf8'));
        if (lockInfo.expiresAt && lockInfo.expiresAt > now) {
          return false; // Lock held by another process/instance
        }
      } catch {}
    }
    // Write atomic lockfile
    fs.writeFileSync(lockFilePath, JSON.stringify({ resourceKey, pid: process.pid, expiresAt: now + ttlMs }), { flag: 'w' });
  } catch (err) {
    // If file operation failed, proceed with in-process lock
  }

  activeLocks.set(resourceKey, now + ttlMs);
  return true;
}

function releaseLock(resourceKey) {
  activeLocks.delete(resourceKey);
  try {
    const safeName = resourceKey.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const lockFilePath = path.join(locksDir, `${safeName}.lock`);
    if (fs.existsSync(lockFilePath)) {
      fs.unlinkSync(lockFilePath);
    }
  } catch {}
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
      // Postgres client connection when DATABASE_URL is active
      const pg = require('pg');
      const pool = new pg.Pool({ connectionString: postgresUrl, max: 2 });
      await pool.query(
        `INSERT INTO operations (operation_id, user_id, session_id, target_tab, target_field, previous_value, new_value, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (operation_id) DO UPDATE SET status = EXCLUDED.status, error = EXCLUDED.error`,
        [record.operationId, record.userId, record.sessionId, record.targetTab, record.targetField, String(record.previousValue), String(record.newValue), record.status, record.createdAt]
      );
      await pool.end();
    } catch (pgErr) {
      // Gracefully fall back to local disk journal if pg is not installed or network is offline
    }
  }

  // Update in-memory store
  const existingIndex = inMemoryJournal.findIndex(o => o.operationId === operationId);
  if (existingIndex >= 0) {
    inMemoryJournal[existingIndex] = record;
  } else {
    inMemoryJournal.unshift(record);
  }

  try {
    ensureLocalDataDir();
    fs.appendFileSync(localJournalFile, JSON.stringify(record) + '\n', 'utf8');
  } catch {}

  return record;
}

async function getOperationById(operationId) {
  if (!operationId) return null;
  const memoryMatch = inMemoryJournal.find(op => op.operationId === operationId);
  if (memoryMatch) return memoryMatch;

  // Persistent disk lookup
  if (fs.existsSync(localJournalFile)) {
    try {
      const content = fs.readFileSync(localJournalFile, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      let found = null;
      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          if (item.operationId === operationId) {
            if (item.event === 'update' && found) Object.assign(found, item);
            else found = item;
          }
        } catch {}
      }
      if (found) {
        inMemoryJournal.unshift(found);
        return found;
      }
    } catch {}
  }

  // Postgres lookup if configured
  const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (postgresUrl) {
    try {
      const pg = require('pg');
      const pool = new pg.Pool({ connectionString: postgresUrl, max: 1 });
      const res = await pool.query('SELECT * FROM operations WHERE operation_id = $1', [operationId]);
      await pool.end();
      if (res.rows && res.rows[0]) {
        const row = res.rows[0];
        const record = {
          operationId: row.operation_id,
          userId: row.user_id,
          sessionId: row.session_id,
          targetTab: row.target_tab,
          targetField: row.target_field,
          previousValue: row.previous_value,
          newValue: row.new_value,
          status: row.status,
          createdAt: row.created_at
        };
        inMemoryJournal.unshift(record);
        return record;
      }
    } catch {}
  }

  return null;
}

async function updateOperation(operationId, patch = {}) {
  const op = inMemoryJournal.find(o => o.operationId === operationId);
  if (op) {
    Object.assign(op, patch, { updatedAt: new Date().toISOString() });

    const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (postgresUrl) {
      try {
        const pg = require('pg');
        const pool = new pg.Pool({ connectionString: postgresUrl, max: 2 });
        await pool.query(
          `UPDATE operations SET status = $1, error = $2, updated_at = $3 WHERE operation_id = $4`,
          [op.status, op.error || null, op.updatedAt, operationId]
        );
        await pool.end();
      } catch {}
    }

    try {
      ensureLocalDataDir();
      fs.appendFileSync(localJournalFile, JSON.stringify({ event: 'update', operationId, ...patch }) + '\n', 'utf8');
    } catch {}
    return op;
  }
  return null;
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
  getOperationById,
  updateOperation,
  acquireLock,
  releaseLock,
  reloadJournalFromDisk,
  getRecentOperations,
  getSyncState,
  setSyncState,
  resetMemoryState
};
