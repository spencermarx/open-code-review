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
// Local generic row-mapping utilities to avoid circular imports with ./index.js
// which re-exports from this file.

type ExecResult = ReturnType<import("sql.js").Database["exec"]>;

function resultToRows<T>(result: ExecResult): T[] {
  if (result.length === 0 || !result[0]) {
    return [];
  }
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i] as string] = row[i];
    }
    return obj as T;
  });
}

function resultToRow<T>(result: ExecResult): T | undefined {
  const rows = resultToRows<T>(result);
  return rows[0];
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

  if (setClauses.length === 0) {
    return;
  }

  // Always update updated_at when there's something to update
  setClauses.push("updated_at = datetime('now')");

  values.push(id);
  db.run(
    `UPDATE sessions SET ${setClauses.join(", ")} WHERE id = ?`,
    values,
  );
}

export function getSession(db: Database, id: string): SessionRow | undefined {
  return resultToRow<SessionRow>(
    db.exec("SELECT * FROM sessions WHERE id = ?", [id]),
  );
}

export function getLatestActiveSession(db: Database): SessionRow | undefined {
  return resultToRow<SessionRow>(
    db.exec(
      "SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1",
    ),
  );
}

export function getAllSessions(db: Database): SessionRow[] {
  return resultToRows<SessionRow>(
    db.exec("SELECT * FROM sessions ORDER BY started_at DESC"),
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
  return resultToRows<EventRow>(
    db.exec(
      "SELECT * FROM orchestration_events WHERE session_id = ? ORDER BY id ASC",
      [sessionId],
    ),
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
