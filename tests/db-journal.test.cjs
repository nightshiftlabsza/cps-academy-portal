'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { recordOperation, getRecentOperations, getSyncState, setSyncState, resetMemoryState } = require('../api/_lib/db.cjs');

test('db-journal: migration file exists and contains required SQL tables', () => {
  const migrationPath = path.resolve(__dirname, '../migrations/001_init_schema.sql');
  assert.ok(fs.existsSync(migrationPath), '001_init_schema.sql must exist');

  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS users/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS operation_journal/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS sync_state/i);
});

test('db-journal: records and retrieves operations in durable journal', async () => {
  resetMemoryState();

  const op1 = await recordOperation({
    userId: 'zak@example.com',
    sessionId: 'mr-2026-10-06-scheduled-6-00-am',
    targetTab: 'Morning Report',
    targetField: 'Presenter',
    previousValue: '',
    newValue: 'Dr. Jane Smith',
    status: 'committed'
  });

  assert.ok(op1.operationId.startsWith('op_'));
  assert.equal(op1.userId, 'zak@example.com');
  assert.equal(op1.sessionId, 'mr-2026-10-06-scheduled-6-00-am');
  assert.equal(op1.targetTab, 'Morning Report');
  assert.equal(op1.targetField, 'Presenter');
  assert.equal(op1.newValue, 'Dr. Jane Smith');
  assert.equal(op1.status, 'committed');
  assert.ok(op1.createdAt);

  const recent = await getRecentOperations(10);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].operationId, op1.operationId);
});

test('db-journal: tracks sync_state cache generations and payloads', async () => {
  resetMemoryState();

  const state = await setSyncState('master_workbook', 'hash_abc123', { test: true });
  assert.equal(state.key, 'master_workbook');
  assert.equal(state.snapshotHash, 'hash_abc123');
  assert.deepEqual(state.payload, { test: true });
  assert.ok(state.lastSyncedAt);

  const retrieved = await getSyncState('master_workbook');
  assert.equal(retrieved.snapshotHash, 'hash_abc123');
  assert.deepEqual(retrieved.payload, { test: true });
});
