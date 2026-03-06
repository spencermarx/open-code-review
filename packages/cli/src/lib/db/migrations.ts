/**
 * Schema migration runner for the OCR SQLite database.
 */

import type { Database } from "sql.js";
import type { Migration } from "./types.js";

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "Initial schema — sessions, events, artifacts, user state",
    sql: `
      -- Layer 1: Workflow State

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        branch TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed')),
        workflow_type TEXT NOT NULL CHECK(workflow_type IN ('review', 'map')),
        current_phase TEXT NOT NULL DEFAULT 'context',
        phase_number INTEGER NOT NULL DEFAULT 1,
        current_round INTEGER NOT NULL DEFAULT 1,
        current_map_run INTEGER NOT NULL DEFAULT 1,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        session_dir TEXT NOT NULL
      );

      CREATE TABLE orchestration_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        phase TEXT,
        phase_number INTEGER,
        round INTEGER,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_events_session ON orchestration_events(session_id);
      CREATE INDEX idx_events_type ON orchestration_events(event_type);

      -- Layer 2: Artifacts

      CREATE TABLE review_rounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        round_number INTEGER NOT NULL,
        verdict TEXT,
        blocker_count INTEGER DEFAULT 0,
        suggestion_count INTEGER DEFAULT 0,
        should_fix_count INTEGER DEFAULT 0,
        final_md_path TEXT,
        parsed_at TEXT,
        UNIQUE(session_id, round_number)
      );

      CREATE TABLE reviewer_outputs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        round_id INTEGER NOT NULL REFERENCES review_rounds(id) ON DELETE CASCADE,
        reviewer_type TEXT NOT NULL,
        instance_number INTEGER NOT NULL DEFAULT 1,
        file_path TEXT NOT NULL,
        finding_count INTEGER DEFAULT 0,
        parsed_at TEXT,
        UNIQUE(round_id, reviewer_type, instance_number)
      );

      CREATE TABLE review_findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reviewer_output_id INTEGER NOT NULL REFERENCES reviewer_outputs(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        severity TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
        file_path TEXT,
        line_start INTEGER,
        line_end INTEGER,
        summary TEXT,
        is_blocker INTEGER NOT NULL DEFAULT 0,
        parsed_at TEXT
      );
      CREATE INDEX idx_findings_severity ON review_findings(severity);

      CREATE TABLE markdown_artifacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        artifact_type TEXT NOT NULL,
        round_number INTEGER,
        file_path TEXT NOT NULL,
        content TEXT NOT NULL,
        parsed_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(session_id, artifact_type, round_number, file_path)
      );

      CREATE TABLE map_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        run_number INTEGER NOT NULL,
        file_count INTEGER DEFAULT 0,
        map_md_path TEXT,
        parsed_at TEXT,
        UNIQUE(session_id, run_number)
      );

      CREATE TABLE map_sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        map_run_id INTEGER NOT NULL REFERENCES map_runs(id) ON DELETE CASCADE,
        section_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        file_count INTEGER DEFAULT 0,
        display_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE(map_run_id, section_number)
      );

      CREATE TABLE map_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id INTEGER NOT NULL REFERENCES map_sections(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        role TEXT,
        lines_added INTEGER DEFAULT 0,
        lines_deleted INTEGER DEFAULT 0,
        display_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE(section_id, file_path)
      );

      -- Layer 3: User Interaction

      CREATE TABLE user_file_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        map_file_id INTEGER NOT NULL REFERENCES map_files(id) ON DELETE CASCADE,
        is_reviewed INTEGER NOT NULL DEFAULT 0,
        reviewed_at TEXT,
        UNIQUE(map_file_id)
      );

      CREATE TABLE user_finding_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        finding_id INTEGER NOT NULL REFERENCES review_findings(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'read', 'acknowledged', 'fixed', 'wont_fix')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(finding_id)
      );

      CREATE TABLE user_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_type TEXT NOT NULL CHECK(target_type IN ('session', 'round', 'finding', 'run', 'section', 'file')),
        target_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE command_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command TEXT NOT NULL,
        args TEXT,
        exit_code INTEGER,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at TEXT,
        output TEXT
      );
    `,
  },
  {
    version: 2,
    description: "Add chat conversations, messages, and round progress tables",
    sql: `
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL CHECK(target_type IN ('map_run', 'review_round')),
        target_id INTEGER NOT NULL,
        claude_session_id TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS user_round_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        round_id INTEGER NOT NULL REFERENCES review_rounds(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'needs_review'
          CHECK(status IN ('needs_review', 'in_progress', 'changes_made', 'acknowledged', 'dismissed')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(round_id)
      );
    `,
  },
  {
    version: 3,
    description: "Add PID tracking to command_executions for orphan process cleanup",
    sql: `
      ALTER TABLE command_executions ADD COLUMN pid INTEGER;
    `,
  },
  {
    version: 4,
    description: "Add is_detached flag to command_executions for process group kill strategy",
    sql: `
      ALTER TABLE command_executions ADD COLUMN is_detached INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 5,
    description: "Change orchestration_events FK to RESTRICT to protect audit trail",
    sql: `
      CREATE TABLE orchestration_events_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
        event_type TEXT NOT NULL,
        phase TEXT,
        phase_number INTEGER,
        round INTEGER,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO orchestration_events_new SELECT * FROM orchestration_events;
      DROP TABLE orchestration_events;
      ALTER TABLE orchestration_events_new RENAME TO orchestration_events;
      CREATE INDEX idx_events_session ON orchestration_events(session_id);
      CREATE INDEX idx_events_type ON orchestration_events(event_type);
    `,
  },
];

/**
 * Creates the schema_version table if it does not exist.
 */
function ensureSchemaVersionTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      description TEXT NOT NULL
    );
  `);
}

/**
 * Returns the current schema version (0 if no migrations applied).
 */
function getCurrentVersion(db: Database): number {
  const result = db.exec(
    "SELECT MAX(version) as v FROM schema_version",
  );
  if (result.length === 0 || result[0]?.values.length === 0) {
    return 0;
  }
  const val = result[0]?.values[0]?.[0];
  return typeof val === "number" ? val : 0;
}

/**
 * Runs all pending migrations sequentially.
 */
export function runMigrations(db: Database): void {
  ensureSchemaVersionTable(db);
  const currentVersion = getCurrentVersion(db);

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    db.run("BEGIN TRANSACTION;");
    try {
      db.run(migration.sql);
      db.run(
        "INSERT INTO schema_version (version, description) VALUES (?, ?);",
        [migration.version, migration.description],
      );
      db.run("COMMIT;");
    } catch (error) {
      db.run("ROLLBACK;");
      throw error;
    }
  }
}

export { MIGRATIONS };
