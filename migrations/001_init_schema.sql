-- Phase 10: CPS Academy Portal Durable Store Schema
-- Compatible with Vercel Postgres / Neon / Standard PostgreSQL

-- 1. Users & Roles
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'member', -- 'viewer', 'member', 'editor', 'admin'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Operation Journal & Audit Log (Tamper-proof history)
CREATE TABLE IF NOT EXISTS operation_journal (
    operation_id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64),
    session_id VARCHAR(128) NOT NULL,
    target_tab VARCHAR(64) NOT NULL,
    target_field VARCHAR(64) NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    status VARCHAR(32) NOT NULL, -- 'pending', 'committed', 'rejected'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_journal_session ON operation_journal(session_id);
CREATE INDEX IF NOT EXISTS idx_journal_created ON operation_journal(created_at DESC);

-- 3. Cache & Sync Generations
CREATE TABLE IF NOT EXISTS sync_state (
    key VARCHAR(64) PRIMARY KEY,
    snapshot_hash VARCHAR(128) NOT NULL,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    payload JSONB NOT NULL
);
