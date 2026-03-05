// Database connection using Drizzle + SQLite

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@garage-engine/shared/schema';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../../../database.sqlite');

// Create SQLite connection
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Export schema for convenience
export { schema };

// Initialize database tables
export function initializeDatabase() {
  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      definition TEXT NOT NULL,
      settings TEXT,
      domain_id TEXT,
      active INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      trigger_type TEXT NOT NULL,
      trigger_data TEXT,
      error TEXT,
      started_at INTEGER,
      finished_at INTEGER,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS execution_nodes (
      id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
      node_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input_data TEXT,
      output_data TEXT,
      error TEXT,
      started_at INTEGER,
      finished_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      node_id TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      method TEXT DEFAULT 'POST',
      active INTEGER DEFAULT 1,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS hitl_requests (
      id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
      node_id TEXT NOT NULL,
      type TEXT NOT NULL,
      request_data TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      response_data TEXT,
      responded_at INTEGER,
      expires_at INTEGER,
      created_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_executions_workflow_id ON executions(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
    CREATE INDEX IF NOT EXISTS idx_execution_nodes_execution_id ON execution_nodes(execution_id);
    CREATE INDEX IF NOT EXISTS idx_webhooks_path ON webhooks(path);
    CREATE INDEX IF NOT EXISTS idx_hitl_requests_execution_id ON hitl_requests(execution_id);
    CREATE INDEX IF NOT EXISTS idx_hitl_requests_status ON hitl_requests(status);

    CREATE TABLE IF NOT EXISTS custom_nodes (
      id TEXT PRIMARY KEY,
      manifest TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );

    -- Expert Agent Tables
    CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      icon TEXT,
      agent_id TEXT,
      builder_agent_id TEXT,
      system_prompt TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      tool_name TEXT NOT NULL,
      name TEXT NOT NULL,
      short_description TEXT NOT NULL,
      when_to_apply TEXT NOT NULL,
      inputs_schema TEXT,
      outputs_schema TEXT,
      risk_class TEXT DEFAULT 'read_only',
      estimated_duration TEXT DEFAULT 'fast',
      enabled INTEGER DEFAULT 1,
      created_at INTEGER,
      updated_at INTEGER,
      UNIQUE(domain_id, tool_name)
    );

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      title TEXT,
      status TEXT DEFAULT 'open',
      openclaw_session_id TEXT,
      summary TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS case_steps (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      step_index INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      execution_id TEXT REFERENCES executions(id),
      scenario_id TEXT REFERENCES scenarios(id),
      created_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_scenarios_domain_id ON scenarios(domain_id);
    CREATE INDEX IF NOT EXISTS idx_scenarios_workflow_id ON scenarios(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_cases_domain_id ON cases(domain_id);
    CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
    CREATE INDEX IF NOT EXISTS idx_case_steps_case_id ON case_steps(case_id);
    CREATE INDEX IF NOT EXISTS idx_case_steps_execution_id ON case_steps(execution_id);

    CREATE TABLE IF NOT EXISTS case_artifacts (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      source_type TEXT NOT NULL,
      source_step_id TEXT REFERENCES case_steps(id),
      metadata TEXT,
      created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_case_artifacts_case_id ON case_artifacts(case_id);
  `);

  // Migration guards for new columns (idempotent — SQLite throws if column already exists)
  try { sqlite.exec('ALTER TABLE domains ADD COLUMN builder_agent_id TEXT'); } catch {}
  try { sqlite.exec('ALTER TABLE workflows ADD COLUMN domain_id TEXT'); } catch {}

  // Backfill workflows.domain_id from scenarios (no-op after first run)
  sqlite.exec(`
    UPDATE workflows SET domain_id = (
      SELECT domain_id FROM scenarios WHERE scenarios.workflow_id = workflows.id LIMIT 1
    ) WHERE domain_id IS NULL
  `);

  console.log('Database initialized');
}
