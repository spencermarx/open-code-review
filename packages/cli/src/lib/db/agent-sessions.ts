/**
 * Agent-session journal helpers.
 *
 * Backed by the `command_executions` table — every spawned CLI subprocess
 * gets exactly one row, whether it was started by the dashboard's command
 * runner or by the AI calling `ocr session start-instance`. The "agent
 * session" concept is a logical view over `command_executions` rows whose
 * `last_heartbeat_at` is non-null (i.e., they participate in the journaled
 * lifecycle, as opposed to fire-and-forget utility commands).
 *
 * Status mapping (derived, no separate column):
 *   running    →  finished_at IS NULL AND last_heartbeat_at fresh
 *   stalled    →  finished_at IS NULL AND last_heartbeat_at stale
 *   orphaned   →  finished_at IS NOT NULL AND exit_code = -3 (sweep sentinel)
 *   done       →  exit_code = 0
 *   crashed    →  exit_code IS NOT NULL AND exit_code NOT IN (0, -2, -3)
 *   cancelled  →  exit_code = -2
 */

import type { Database } from "sql.js";
import type {
  AgentSessionRow,
  AgentSessionStatus,
  InsertAgentSessionParams,
  SweepResult,
  UpdateAgentSessionParams,
} from "./types.js";
import { resultToRows, resultToRow } from "./result-mapper.js";

const ORPHAN_EXIT_CODE = -3;
const CANCELLED_EXIT_CODE = -2;
const NOTE_ORPHAN_PREFIX = "orphaned by liveness sweep";

/**
 * Internal row shape from `command_executions` SELECTs, mapped to the
 * AgentSessionRow surface for backward compatibility with existing
 * consumers (dashboard server, /api/agent-sessions, terminal handoff).
 */
type CommandExecutionRow = {
  id: number;
  uid: string | null;
  command: string;
  args: string | null;
  workflow_id: string | null;
  parent_id: number | null;
  vendor: string | null;
  vendor_session_id: string | null;
  persona: string | null;
  instance_index: number | null;
  name: string | null;
  resolved_model: string | null;
  pid: number | null;
  started_at: string;
  last_heartbeat_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  notes: string | null;
};

function rowToAgentSession(row: CommandExecutionRow): AgentSessionRow {
  return {
    // The OCR-owned id is the `uid` column. Fall back to the integer
    // primary key for legacy command_executions rows without a uid.
    id: row.uid ?? String(row.id),
    workflow_id: row.workflow_id ?? "",
    vendor: row.vendor ?? "",
    vendor_session_id: row.vendor_session_id,
    persona: row.persona,
    instance_index: row.instance_index,
    name: row.name,
    resolved_model: row.resolved_model,
    phase: null,
    status: deriveStatus(row),
    pid: row.pid,
    started_at: row.started_at,
    last_heartbeat_at: row.last_heartbeat_at ?? row.started_at,
    ended_at: row.finished_at,
    exit_code: row.exit_code,
    notes: row.notes,
  };
}

function deriveStatus(row: CommandExecutionRow): AgentSessionStatus {
  if (row.finished_at === null) {
    // Running or stalled — callers (LivenessHeader, sweeps) reclassify
    // to 'stalled' via the heartbeat threshold check downstream.
    return "running";
  }
  if (row.exit_code === ORPHAN_EXIT_CODE) return "orphaned";
  if (row.exit_code === CANCELLED_EXIT_CODE) return "cancelled";
  if (row.exit_code === 0) return "done";
  return "crashed";
}

/**
 * Insert a new agent-session row by inserting into `command_executions`.
 *
 * The `id` returned in `params.id` is the OCR-owned UUID we expose to
 * callers; we store it in the `uid` column of `command_executions`. The
 * row's integer primary key is internal — callers that previously relied
 * on a string id continue to work via the `uid` mapping in lookups.
 */
export function insertAgentSession(
  db: Database,
  params: InsertAgentSessionParams,
): void {
  const {
    id,
    workflow_id,
    vendor,
    persona = null,
    instance_index = null,
    name = null,
    resolved_model = null,
    pid = null,
    notes = null,
  } = params;

  const command = persona && instance_index !== null
    ? `session-instance:${persona}-${instance_index}`
    : "session-instance";

  db.run(
    `INSERT INTO command_executions
       (uid, command, args, workflow_id, vendor, persona, instance_index, name,
        resolved_model, pid, notes, last_heartbeat_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      id,
      command,
      null,
      workflow_id,
      vendor,
      persona,
      instance_index,
      name,
      resolved_model,
      pid,
      notes,
    ],
  );
}

export function getAgentSession(
  db: Database,
  id: string,
): AgentSessionRow | undefined {
  const row = resultToRow<CommandExecutionRow>(
    db.exec(
      `SELECT * FROM command_executions WHERE uid = ? AND last_heartbeat_at IS NOT NULL`,
      [id],
    ),
  );
  return row ? rowToAgentSession(row) : undefined;
}

export function listAgentSessionsForWorkflow(
  db: Database,
  workflowId: string,
): AgentSessionRow[] {
  const rows = resultToRows<CommandExecutionRow>(
    db.exec(
      `SELECT * FROM command_executions
       WHERE workflow_id = ? AND last_heartbeat_at IS NOT NULL
       ORDER BY started_at ASC, id ASC`,
      [workflowId],
    ),
  );
  return rows.map(rowToAgentSession);
}

/**
 * Returns the most recent `command_executions` row for a workflow whose
 * `vendor_session_id` is set. Used by `ocr review --resume <workflow-id>`
 * and the terminal-handoff route.
 *
 * Resolution requires an explicit `workflow_id` link. The link is
 * established at write time by the CLI's `ocr state init` reading the
 * dashboard spawn marker file (`.ocr/data/dashboard-active-spawn.json`)
 * and binding the dashboard parent execution to the freshly-created
 * workflow id. That marker is the durable handshake — if it's present
 * the link IS made, deterministically.
 *
 * No timing derivation. No heuristic fallback. If the link is missing,
 * the workflow is genuinely unresumable (dashboard wasn't running, AI
 * ran outside the dashboard, or `state init` was never called).
 */
export function getLatestAgentSessionWithVendorId(
  db: Database,
  workflowId: string,
): AgentSessionRow | undefined {
  const row = resultToRow<CommandExecutionRow>(
    db.exec(
      `SELECT * FROM command_executions
       WHERE workflow_id = ? AND vendor_session_id IS NOT NULL
       ORDER BY started_at DESC, id DESC
       LIMIT 1`,
      [workflowId],
    ),
  );
  return row ? rowToAgentSession(row) : undefined;
}

export function bumpAgentSessionHeartbeat(db: Database, id: string): void {
  db.run(
    `UPDATE command_executions
       SET last_heartbeat_at = datetime('now')
       WHERE uid = ?`,
    [id],
  );
}

/**
 * Sets `vendor_session_id` once per row. Re-binding to a different value
 * is rejected — the AI is expected to call this exactly once per agent
 * session.
 */
export function setAgentSessionVendorId(
  db: Database,
  id: string,
  vendorSessionId: string,
): void {
  const existing = getAgentSession(db, id);
  if (!existing) {
    throw new Error(`Agent session not found: ${id}`);
  }
  if (
    existing.vendor_session_id &&
    existing.vendor_session_id !== vendorSessionId
  ) {
    throw new Error(
      `Agent session ${id} already bound to vendor session ${existing.vendor_session_id}; refusing to rebind to ${vendorSessionId}`,
    );
  }
  db.run(
    `UPDATE command_executions
       SET vendor_session_id = ?,
           last_heartbeat_at = datetime('now')
       WHERE uid = ?`,
    [vendorSessionId, id],
  );
}

/**
 * Opportunistically binds a vendor session id to an unbound running row,
 * called by the dashboard command-runner when it observes a `session_id`
 * event on stdout. Returns the agent-session id (uid) that was bound, or
 * `null` if no candidate exists.
 *
 * Scoped to rows in active workflows that participate in the journal
 * (`last_heartbeat_at IS NOT NULL`) and haven't terminated.
 */
export function bindVendorSessionIdOpportunistically(
  db: Database,
  vendorSessionId: string,
): string | null {
  // Already bound? Idempotent return.
  const alreadyBound = resultToRow<{ uid: string | null }>(
    db.exec(
      `SELECT c.uid FROM command_executions c
       INNER JOIN sessions s ON s.id = c.workflow_id
       WHERE c.vendor_session_id = ?
       LIMIT 1`,
      [vendorSessionId],
    ),
  );
  if (alreadyBound?.uid) return alreadyBound.uid;

  const candidate = resultToRow<{ uid: string | null; id: number }>(
    db.exec(
      `SELECT c.uid, c.id FROM command_executions c
       INNER JOIN sessions s ON s.id = c.workflow_id
       WHERE c.finished_at IS NULL
         AND c.vendor_session_id IS NULL
         AND c.last_heartbeat_at IS NOT NULL
         AND s.status = 'active'
       ORDER BY c.started_at DESC, c.id DESC
       LIMIT 1`,
    ),
  );
  if (!candidate) return null;

  // Bind by integer id since uid may be null on older command_executions rows
  db.run(
    `UPDATE command_executions
       SET vendor_session_id = ?,
           last_heartbeat_at = datetime('now')
       WHERE id = ?`,
    [vendorSessionId, candidate.id],
  );
  return candidate.uid ?? String(candidate.id);
}

/**
 * Records a vendor session id on the parent `command_executions` row
 * spawned by the dashboard. Idempotent (COALESCE) — vendors emit
 * `session_id` events on every stream message, we record only the first.
 *
 * Single-owner primitive for vendor session id capture (per the
 * add-self-diagnosing-resume-handoff proposal). Direct SQL UPDATEs to
 * `vendor_session_id` outside this helper are forbidden.
 */
export function recordVendorSessionIdForExecution(
  db: Database,
  executionId: number,
  vendorSessionId: string,
): void {
  db.run(
    `UPDATE command_executions
        SET vendor_session_id = COALESCE(vendor_session_id, ?),
            last_heartbeat_at = datetime('now')
      WHERE id = ?`,
    [vendorSessionId, executionId],
  );
}

/**
 * Late-links a dashboard-spawned `command_executions` row (identified by
 * its `uid`) to a workflow created later by the AI's `ocr state init`
 * call. Idempotent (COALESCE) — if a workflow_id is already set the
 * UPDATE is a no-op.
 *
 * Single-owner primitive for workflow linkage (per the
 * add-self-diagnosing-resume-handoff proposal). Direct SQL UPDATEs to
 * `workflow_id` outside this helper are forbidden.
 */
export function linkDashboardInvocationToWorkflow(
  db: Database,
  dashboardUid: string,
  workflowId: string,
): void {
  db.run(
    `UPDATE command_executions
        SET workflow_id = COALESCE(workflow_id, ?),
            last_heartbeat_at = COALESCE(last_heartbeat_at, datetime('now'))
      WHERE uid = ?`,
    [workflowId, dashboardUid],
  );
}

export function setAgentSessionStatus(
  db: Database,
  id: string,
  status: AgentSessionStatus,
  options: {
    exitCode?: number | null;
    note?: string;
    setEndedAt?: boolean;
  } = {},
): void {
  const { exitCode, note, setEndedAt } = options;
  const isTerminal =
    status === "done" ||
    status === "crashed" ||
    status === "cancelled" ||
    status === "orphaned";
  const stampEnded = setEndedAt ?? isTerminal;

  // Resolve exit code from status when callers don't pass one explicitly.
  // 0 (done), -2 (cancelled), -3 (orphaned), 1 (crashed default).
  let resolvedExit: number | null;
  if (exitCode !== undefined) {
    resolvedExit = exitCode;
  } else if (status === "done") {
    resolvedExit = 0;
  } else if (status === "cancelled") {
    resolvedExit = CANCELLED_EXIT_CODE;
  } else if (status === "orphaned") {
    resolvedExit = ORPHAN_EXIT_CODE;
  } else if (status === "crashed") {
    resolvedExit = 1;
  } else {
    resolvedExit = null;
  }

  const finishedClause = stampEnded ? ", finished_at = datetime('now')" : "";

  if (note !== undefined) {
    db.run(
      `UPDATE command_executions
         SET exit_code = ?,
             notes = COALESCE(notes || char(10), '') || ?
             ${finishedClause}
         WHERE uid = ?`,
      [resolvedExit, note, id],
    );
  } else {
    db.run(
      `UPDATE command_executions
         SET exit_code = ?
             ${finishedClause}
         WHERE uid = ?`,
      [resolvedExit, id],
    );
  }
}

export function updateAgentSession(
  db: Database,
  id: string,
  params: UpdateAgentSessionParams,
): void {
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (params.vendor_session_id !== undefined) {
    setClauses.push("vendor_session_id = ?");
    values.push(params.vendor_session_id);
  }
  // `phase` is no longer persisted on the unified table — tracked via
  // the existing orchestration_events stream instead. Silently drop.
  if (params.status !== undefined) {
    // Map status updates to exit_code transitions per deriveStatus.
    setAgentSessionStatus(db, id, params.status, {
      exitCode: params.exit_code ?? undefined,
      note: params.notes ?? undefined,
    });
    return;
  }
  if (params.pid !== undefined) {
    setClauses.push("pid = ?");
    values.push(params.pid);
  }
  if (params.ended_at !== undefined) {
    setClauses.push("finished_at = ?");
    values.push(params.ended_at);
  }
  if (params.exit_code !== undefined) {
    setClauses.push("exit_code = ?");
    values.push(params.exit_code);
  }
  if (params.notes !== undefined) {
    setClauses.push("notes = ?");
    values.push(params.notes);
  }

  if (setClauses.length === 0) return;

  values.push(id);
  db.run(
    `UPDATE command_executions SET ${setClauses.join(", ")} WHERE uid = ?`,
    values,
  );
}

/**
 * Reclassifies running rows whose heartbeat has gone stale past the given
 * threshold to `orphaned` (exit_code = -3). Stamps `finished_at` and
 * appends a structured note. Returns the uids of affected rows.
 *
 * Scoped to rows that participate in the journal (`last_heartbeat_at IS
 * NOT NULL`) — fire-and-forget commands without heartbeat tracking are
 * untouched.
 */
export function sweepStaleAgentSessions(
  db: Database,
  thresholdSeconds: number,
): SweepResult {
  const staleSql = `
    SELECT uid, id FROM command_executions
    WHERE finished_at IS NULL
      AND last_heartbeat_at IS NOT NULL
      AND (julianday('now') - julianday(last_heartbeat_at)) * 86400 > ?
  `;
  const stale = resultToRows<{ uid: string | null; id: number }>(
    db.exec(staleSql, [thresholdSeconds]),
  );

  if (stale.length === 0) {
    return { orphanedIds: [] };
  }

  const note = `${NOTE_ORPHAN_PREFIX} (threshold ${thresholdSeconds}s)`;

  db.run(
    `UPDATE command_executions
       SET finished_at = datetime('now'),
           exit_code = ?,
           notes = COALESCE(notes || char(10), '') || ?
     WHERE finished_at IS NULL
       AND last_heartbeat_at IS NOT NULL
       AND (julianday('now') - julianday(last_heartbeat_at)) * 86400 > ?`,
    [ORPHAN_EXIT_CODE, note, thresholdSeconds],
  );

  return {
    orphanedIds: stale.map((row) => row.uid ?? String(row.id)),
  };
}
