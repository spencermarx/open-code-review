/**
 * JSONL replay recovery for missed vendor session id bindings.
 *
 * When `getLatestAgentSessionWithVendorId(workflowId)` returns nothing
 * but the events JSONL on disk has captured `session_id` events, this
 * helper walks the journal and returns the first capture so the service
 * can backfill the relational state.
 *
 * Per the proposal: this makes the events file load-bearing for resume
 * recovery without committing to full event sourcing.
 *
 * **Load-bearing for `UnresumableReason` type completeness**: this
 * primitive runs unconditionally before `unresumable` is computed in
 * `SessionCaptureService.resolveResumeContext`. That ordering is what
 * lets the `UnresumableReason` union drop the
 * `session-id-captured-but-unlinked` variant — captured-but-unlinked
 * sessions are recovered transparently here, never reaching the
 * outcome computation. Making recovery conditional (feature flag,
 * slow-disk skip, error-tolerant short-circuit, etc.) re-opens the
 * spec hole that round-1 Blocker 1 closed. Round-3 SF6.
 *
 * Scope: read-only on disk + DB. The caller (`SessionCaptureService`)
 * is responsible for performing the backfill via `recordSessionId`.
 */
import type { Database } from 'sql.js'
import { readEventJournal } from '../event-journal.js'

export type RecoveredCapture = {
  executionId: number
  vendorSessionId: string
}

export type RecoveryResult = {
  /** First captured `session_id` we found, ready for backfill, else null. */
  found: RecoveredCapture | null
  /** Total `session_id` events observed across all journals walked. */
  sessionIdEventsObservedTotal: number
}

type ExecutionRow = {
  id: number
  vendor_session_id: string | null
}

/**
 * Returns the integer ids of every `command_executions` row linked to the
 * given workflow, plus their currently-bound vendor_session_id (if any).
 * Sorted newest-first so we replay the most recent execution before older
 * ones — a fresh resume should pick up the most recent valid session.
 */
function listExecutionsForWorkflow(
  db: Database,
  workflowId: string,
): ExecutionRow[] {
  const result = db.exec(
    `SELECT id, vendor_session_id FROM command_executions
     WHERE workflow_id = ?
     ORDER BY started_at DESC, id DESC`,
    [workflowId],
  )
  if (result.length === 0) return []
  const { columns, values } = result[0]!
  const idIdx = columns.indexOf('id')
  const vsidIdx = columns.indexOf('vendor_session_id')
  return values.map((row) => ({
    id: row[idIdx] as number,
    vendor_session_id: (row[vsidIdx] as string | null) ?? null,
  }))
}

/**
 * Walks the events JSONL for each execution linked to the workflow,
 * returning the first `session_id` event found AND a total count of
 * `session_id` events observed.
 *
 * The total powers the user-visible `sessionIdEventsObserved` diagnostic —
 * a 0 means the vendor never emitted a session id, a non-zero with no
 * recovery means every capture was already-bound (a different signal).
 *
 * Skips executions that already have a vendor_session_id bound when
 * choosing what to backfill, but still counts events from those journals
 * — the count is "what the journal saw," not "what's recoverable."
 */
export function recoverFromEventsJsonl(
  ocrDir: string,
  db: Database,
  workflowId: string,
): RecoveryResult {
  const executions = listExecutionsForWorkflow(db, workflowId)
  if (executions.length === 0) {
    return { found: null, sessionIdEventsObservedTotal: 0 }
  }

  let found: RecoveredCapture | null = null
  let sessionIdEventsObservedTotal = 0

  for (const execution of executions) {
    let events
    try {
      events = readEventJournal(ocrDir, execution.id)
    } catch (err) {
      console.warn(
        `[capture/recover] readEventJournal failed for execution ${execution.id}:`,
        err,
      )
      continue
    }
    for (const event of events) {
      if (event.type === 'session_id' && event.id) {
        sessionIdEventsObservedTotal += 1
        if (!found && !execution.vendor_session_id) {
          found = { executionId: execution.id, vendorSessionId: event.id }
        }
      }
    }
  }

  return { found, sessionIdEventsObservedTotal }
}
