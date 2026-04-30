/**
 * Shared SQLite database access module for OCR.
 *
 * Uses sql.js (WASM) for zero native dependency SQLite access.
 * The database lives at `.ocr/data/ocr.db` within a project.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import initSqlJs, { type Database } from "sql.js";
import { runMigrations } from "./migrations.js";

// Re-export public types and functions
export type {
  AgentSession,
  AgentSessionRow,
  AgentSessionStatus,
  AgentVendor,
  EventRow,
  InsertAgentSessionParams,
  InsertEventParams,
  InsertSessionParams,
  Migration,
  SchemaVersionRow,
  SessionRow,
  SweepResult,
  UpdateAgentSessionParams,
  UpdateSessionParams,
} from "./types.js";

export {
  insertSession,
  updateSession,
  getSession,
  getLatestActiveSession,
  getAllSessions,
  insertEvent,
  getEventsForSession,
  getLatestEventId,
} from "./queries.js";

export {
  insertAgentSession,
  getAgentSession,
  listAgentSessionsForWorkflow,
  getLatestAgentSessionWithVendorId,
  bumpAgentSessionHeartbeat,
  setAgentSessionVendorId,
  bindVendorSessionIdOpportunistically,
  setAgentSessionStatus,
  updateAgentSession,
  sweepStaleAgentSessions,
} from "./agent-sessions.js";

export type { WorkflowType, SessionStatus } from "../state/types.js";

export { runMigrations, MIGRATIONS } from "./migrations.js";

export { resultToRows, resultToRow } from "./result-mapper.js";

export {
  cacheDir,
  generateCommandUid,
  commandLogPath,
  appendCommandLog,
  readCommandLog,
  replayCommandLog,
} from "./command-log.js";

export type {
  CommandLogEntry,
  CommandLogEvent,
  CommandLogWriter,
} from "./command-log.js";

// ── Connection cache ──

const connections = new Map<string, Database>();

/**
 * Resolves the path to the sql.js WASM binary.
 */
export function locateWasm(): string {
  const require = createRequire(import.meta.url);
  const sqlJsPath = require.resolve("sql.js");
  // require.resolve returns .../sql.js/dist/sql-wasm.js, so dirname is already /dist/
  return join(dirname(sqlJsPath), "sql-wasm.wasm");
}

/**
 * Applies required pragmas to every connection.
 *
 * Note: sql.js runs SQLite entirely in-memory (WASM). WAL mode and
 * busy_timeout have no file-level effect here, but they establish the
 * correct configuration if the database is ever opened by a native
 * SQLite client (e.g. `sqlite3 .ocr/data/ocr.db`) or if we migrate
 * to better-sqlite3 in the future. Concurrency between the CLI and
 * dashboard is handled via the merge-before-write pattern in
 * `packages/dashboard/src/server/db.ts`, not WAL locking.
 */
export function applyPragmas(db: Database): void {
  db.run("PRAGMA foreign_keys = ON;");
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA busy_timeout = 5000;");
}

/**
 * Opens or creates a SQLite database at the given path.
 * Connections are cached by path for reuse.
 */
export async function openDatabase(dbPath: string): Promise<Database> {
  const cached = connections.get(dbPath);
  if (cached) {
    return cached;
  }

  const wasmBuffer = readFileSync(locateWasm());
  const wasmBinary = wasmBuffer.buffer.slice(
    wasmBuffer.byteOffset,
    wasmBuffer.byteOffset + wasmBuffer.byteLength,
  );

  const SQL = await initSqlJs({
    wasmBinary,
  });

  let db: Database;
  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  applyPragmas(db);
  connections.set(dbPath, db);

  return db;
}

/**
 * Saves the in-memory database state to disk using atomic write
 * (temp file + rename) to prevent partial reads by concurrent processes.
 */
export function saveDatabase(db: Database, dbPath: string): void {
  const data = db.export();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${dbPath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, Buffer.from(data));
  renameSync(tmpPath, dbPath);
}

/**
 * Convenience function: opens the OCR database at `.ocr/data/ocr.db`
 * within the given OCR directory.
 */
export async function getDb(ocrDir: string): Promise<Database> {
  const dbPath = join(ocrDir, "data", "ocr.db");
  return openDatabase(dbPath);
}

/**
 * Creates the data directory if needed, opens the database, runs migrations,
 * and persists the result. Callable from both CLI and dashboard server.
 */
export async function ensureDatabase(ocrDir: string): Promise<Database> {
  const dataDir = join(ocrDir, "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = join(dataDir, "ocr.db");
  const db = await openDatabase(dbPath);
  runMigrations(db);
  saveDatabase(db, dbPath);

  return db;
}

/**
 * Best-effort WAL checkpoint against the on-disk database file.
 *
 * sql.js runs SQLite in-memory, so a `PRAGMA wal_checkpoint(TRUNCATE)`
 * issued through it has no effect on any external `.db-wal` file. To
 * actually reclaim a stale WAL left behind by a native client (e.g. the
 * `sqlite3` CLI, a database GUI, or a future better-sqlite3 process), we
 * attempt to invoke the `sqlite3` binary if it is available on PATH.
 *
 * Returns one of:
 *  - "checkpointed" — native sqlite3 was invoked and exited successfully
 *  - "skipped"      — no `sqlite3` binary on PATH, nothing to do
 *  - "failed"       — native sqlite3 was invoked but exited non-zero
 *
 * Never throws — startup callers should treat this as best-effort hygiene
 * and continue regardless of the outcome.
 */
export type WalCheckpointResult = "checkpointed" | "skipped" | "failed";

export function walCheckpointTruncate(dbPath: string): WalCheckpointResult {
  if (!existsSync(dbPath)) {
    return "skipped";
  }

  // No-op probe: spawn `sqlite3 -version` to detect availability without
  // committing to the checkpoint call. Avoids noisy failure modes when the
  // binary is missing entirely.
  try {
    const probe = spawnSync("sqlite3", ["-version"], {
      stdio: "ignore",
      timeout: 2000,
    });
    if (probe.status !== 0) {
      return "skipped";
    }
  } catch {
    return "skipped";
  }

  try {
    const result = spawnSync(
      "sqlite3",
      [dbPath, "PRAGMA wal_checkpoint(TRUNCATE);"],
      {
        stdio: "ignore",
        timeout: 5000,
      },
    );
    return result.status === 0 ? "checkpointed" : "failed";
  } catch {
    return "failed";
  }
}

/**
 * Closes a database connection and removes it from the cache.
 */
export function closeDatabase(dbPath: string): void {
  const db = connections.get(dbPath);
  if (db) {
    db.close();
    connections.delete(dbPath);
  }
}

/**
 * Closes all cached database connections. Useful for cleanup in tests.
 */
export function closeAllDatabases(): void {
  for (const [path, db] of connections) {
    db.close();
    connections.delete(path);
  }
}
