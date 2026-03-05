/**
 * Session state reader — reads from SQLite exclusively.
 *
 * Used by progress strategies to get session state.
 * Requires the DB to be pre-initialized via setProgressDb().
 */

import { basename } from "node:path";
import type { Database } from "sql.js";
import type { SessionStateData } from "./types.js";

// Cached DB reference — set once during progress command startup
let cachedDb: Database | null = null;

/**
 * Sets the cached database connection for synchronous reads.
 * Call this once at progress command startup after async DB init.
 */
export function setProgressDb(db: Database | null): void {
  cachedDb = db;
}

/**
 * Returns the cached database connection.
 */
export function getProgressDb(): Database | null {
  return cachedDb;
}

/**
 * Reads session state from SQLite.
 * Fully synchronous — requires the DB to be pre-initialized via setProgressDb().
 *
 * @param sessionPath - Path to the session directory
 * @param ocrDir - Path to the .ocr directory (unused, kept for API compat)
 * @returns Session state data or null if no state is available
 */
export function readSessionState(
  sessionPath: string,
  ocrDir?: string,
): SessionStateData | null {
  if (!cachedDb) {
    return null;
  }

  try {
    return readFromSqlite(sessionPath, cachedDb);
  } catch {
    return null;
  }
}

/**
 * Reads session state from a pre-opened SQLite database (synchronous).
 */
function readFromSqlite(
  sessionPath: string,
  db: Database,
): SessionStateData | null {
  const sessionId = basename(sessionPath);

  // Try exact session ID match first
  let result = db.exec("SELECT * FROM sessions WHERE id = ?", [sessionId]);

  // If no match, try latest active session
  if (result.length === 0 || result[0]?.values.length === 0) {
    result = db.exec(
      "SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1",
    );
  }

  if (result.length === 0 || !result[0] || result[0].values.length === 0) {
    return null;
  }

  const columns = result[0].columns;
  const row = result[0].values[0];
  if (!row) {
    return null;
  }

  // Build a column→value map
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i] as string] = row[i];
  }

  return {
    session_id: obj["id"] as string,
    status: obj["status"] as "active" | "closed",
    workflow_type: obj["workflow_type"] as "review" | "map",
    current_phase: obj["current_phase"] as string,
    phase_number: obj["phase_number"] as number,
    started_at: obj["started_at"] as string,
    updated_at: obj["updated_at"] as string,
    current_round: obj["current_round"] as number,
    current_map_run: obj["current_map_run"] as number,
  };
}
