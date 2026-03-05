/**
 * Typed query functions for sessions and orchestration events.
 */

import type { Database } from "sql.js";
import type {
  EventRow,
  InsertEventParams,
  InsertSessionParams,
  SessionRow,
  UpdateSessionParams,
} from "./types.js";

// ── Helpers ──

function rowToSession(columns: string[], values: (string | number | null)[]): SessionRow {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i] as string] = values[i];
  }
  return obj as unknown as SessionRow;
}

function rowToEvent(columns: string[], values: (string | number | null)[]): EventRow {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i] as string] = values[i];
  }
  return obj as unknown as EventRow;
}

// ── Sessions ──

export function insertSession(db: Database, params: InsertSessionParams): void {
  const {
    id,
    branch,
    workflow_type,
    current_phase = "context",
    phase_number = 1,
    current_round = 1,
    current_map_run = 1,
    session_dir,
  } = params;

  db.run(
    `INSERT INTO sessions (id, branch, workflow_type, current_phase, phase_number, current_round, current_map_run, session_dir)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, branch, workflow_type, current_phase, phase_number, current_round, current_map_run, session_dir],
  );
}

export function updateSession(
  db: Database,
  id: string,
  params: UpdateSessionParams,
): void {
  const setClauses: string[] = [];
  const values: (string | number)[] = [];

  if (params.status !== undefined) {
    setClauses.push("status = ?");
    values.push(params.status);
  }
  if (params.current_phase !== undefined) {
    setClauses.push("current_phase = ?");
    values.push(params.current_phase);
  }
  if (params.phase_number !== undefined) {
    setClauses.push("phase_number = ?");
    values.push(params.phase_number);
  }
  if (params.current_round !== undefined) {
    setClauses.push("current_round = ?");
    values.push(params.current_round);
  }
  if (params.current_map_run !== undefined) {
    setClauses.push("current_map_run = ?");
    values.push(params.current_map_run);
  }

  // Always update updated_at
  setClauses.push("updated_at = datetime('now')");

  if (setClauses.length === 0) {
    return;
  }

  values.push(id);
  db.run(
    `UPDATE sessions SET ${setClauses.join(", ")} WHERE id = ?`,
    values,
  );
}

export function getSession(db: Database, id: string): SessionRow | undefined {
  const result = db.exec("SELECT * FROM sessions WHERE id = ?", [id]);
  if (result.length === 0 || result[0]?.values.length === 0) {
    return undefined;
  }
  const columns = result[0]?.columns;
  const row = result[0]?.values[0];
  if (!columns || !row) {
    return undefined;
  }
  return rowToSession(columns, row as (string | number | null)[]);
}

export function getLatestActiveSession(db: Database): SessionRow | undefined {
  const result = db.exec(
    "SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1",
  );
  if (result.length === 0 || result[0]?.values.length === 0) {
    return undefined;
  }
  const columns = result[0]?.columns;
  const row = result[0]?.values[0];
  if (!columns || !row) {
    return undefined;
  }
  return rowToSession(columns, row as (string | number | null)[]);
}

export function getAllSessions(db: Database): SessionRow[] {
  const result = db.exec("SELECT * FROM sessions ORDER BY started_at DESC");
  if (result.length === 0 || !result[0]) {
    return [];
  }
  const columns = result[0].columns;
  return result[0].values.map((row) =>
    rowToSession(columns, row as (string | number | null)[]),
  );
}

// ── Events ──

export function insertEvent(db: Database, params: InsertEventParams): void {
  const {
    session_id,
    event_type,
    phase,
    phase_number,
    round,
    metadata,
  } = params;

  db.run(
    `INSERT INTO orchestration_events (session_id, event_type, phase, phase_number, round, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      session_id,
      event_type,
      phase ?? null,
      phase_number ?? null,
      round ?? null,
      metadata ?? null,
    ],
  );
}

export function getEventsForSession(
  db: Database,
  sessionId: string,
): EventRow[] {
  const result = db.exec(
    "SELECT * FROM orchestration_events WHERE session_id = ? ORDER BY id ASC",
    [sessionId],
  );
  if (result.length === 0 || !result[0]) {
    return [];
  }
  const columns = result[0].columns;
  return result[0].values.map((row) =>
    rowToEvent(columns, row as (string | number | null)[]),
  );
}

export function getLatestEventId(db: Database): number {
  const result = db.exec(
    "SELECT MAX(id) FROM orchestration_events",
  );
  if (result.length === 0 || result[0]?.values.length === 0) {
    return 0;
  }
  const val = result[0]?.values[0]?.[0];
  return typeof val === "number" ? val : 0;
}
