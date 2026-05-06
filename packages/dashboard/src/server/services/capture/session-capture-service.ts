/**
 * Session capture service — single owner for vendor_session_id capture and
 * workflow_id linkage.
 *
 * Per the `add-self-diagnosing-resume-handoff` proposal, every code path
 * that reads or writes vendor_session_id, or that links an
 * agent_invocation to a workflow, delegates to this service. Direct SQL
 * UPDATEs against those columns from outside this implementation surface
 * are forbidden.
 *
 * Vendor specifics (binary names, resume-command syntax, host-binary
 * detection) live on the adapter strategy (`AiCliAdapter`) — this
 * service contains zero `if vendor === ...` branches. Adding a vendor
 * is one new `Adapter implements AiCliAdapter` class; the service
 * requires no edits.
 *
 * Today the service is a thin façade over CLI db helpers. Future phases
 * (event sourcing, domain table split, storage upgrade — see
 * `docs/architecture/agent-lifecycle-and-resume.md`) swap the internals
 * without touching call sites.
 */
import type { Database } from 'sql.js'
import {
  getLatestAgentSessionWithVendorId,
  getSession,
  linkDashboardInvocationToWorkflow,
  recordVendorSessionIdForExecution,
} from '@open-code-review/cli/db'
import { saveDb } from '../../db.js'
import type { AiCliService } from '../ai-cli/index.js'
import { microcopyFor } from './unresumable-microcopy.js'
import { recoverFromEventsJsonl } from './recover-from-events.js'

// ── Public types ──

// `projectDir` is identical on both arms — it's operational context
// (what cwd the resume command targets), not part of the outcome
// discriminator. Round-3 Suggestion 4 hoisted it to the envelope; the
// route returns `{ workflow_id, projectDir, outcome }` and the panel
// reads `payload.projectDir` instead of `outcome.projectDir`.
export type ResumeOutcome =
  | {
      kind: 'resumable'
      vendor: string
      vendorSessionId: string
      hostBinaryAvailable: boolean
      vendorCommand: string
    }
  | {
      kind: 'unresumable'
      reason: UnresumableReason
      diagnostics: CaptureDiagnostics
    }

/**
 * Why a workflow can't be resumed.
 *
 * The `host-binary-missing` arm covers both unknown-vendor (no
 * registered adapter) and known-vendor-not-on-PATH — they share the
 * same user remediation ("install the CLI").
 *
 * `session-id-captured-but-unlinked` was originally in this union but
 * dropped — the JSONL recovery primitive subsumes the case (any
 * captured-but-unlinked session is recovered transparently before the
 * outcome is computed). Round-1 Blocker 1 fix; spec amended to match.
 *
 * Type is derived from `ALL_UNRESUMABLE_REASONS` so adding a variant
 * in one place propagates here, the microcopy `Record`, and the
 * runtime lint test simultaneously. Round-1 Blocker 2 fix.
 */
export type { UnresumableReason } from './unresumable-microcopy.js'
import type { UnresumableReason } from './unresumable-microcopy.js'

export type CaptureDiagnostics = {
  vendor: string | null
  vendorBinaryAvailable: boolean
  invocationsForWorkflow: number
  sessionIdEventsObserved: number
  /** Server-rendered remediation (mirrors microcopy `remediation`). */
  remediation: string
  /** Full structured microcopy (headline, cause, remediation) so the
   *  panel can render uniformly without hardcoding strings. */
  microcopy: {
    headline: string
    cause: string
    remediation: string
  }
}

// ── Service ──

export type SessionCaptureDeps = {
  db: Database
  ocrDir: string
  /**
   * AiCliService instance is required so vendor-specific concerns
   * (binary name, resume command syntax, host-binary probing) flow
   * through the adapter strategy. The service contains zero
   * `if vendor === ...` switches.
   */
  aiCliService: AiCliService
}

/**
 * Construct a `SessionCaptureService`. The dashboard wires one instance at
 * server startup and shares it across command-runner, the handoff route,
 * and any future consumer.
 *
 * The service is a class-light surface — three methods, all idempotent,
 * all delegating to single-owner CLI db helpers. We avoid an actual class
 * to keep mocking trivial in tests.
 */
export function createSessionCaptureService(deps: SessionCaptureDeps) {
  const { db, ocrDir, aiCliService } = deps

  /**
   * Per-process record of which executions we've already logged a
   * vendor-session-id drift event for. Drift is COALESCE-dropped (the
   * original capture is the resume target, by design) but we want a
   * single observability signal when it happens, not a torrent on every
   * subsequent stream message — vendors can emit dozens of session_id
   * lines per turn, and the drift handling fires for each. Round-1
   * Should Fix #4 plus the user's "remove the spam" request resolved:
   * one log per execution, ever.
   */
  const driftLoggedFor = new Set<number>()

  /**
   * Returns the currently bound vendor_session_id for an execution row,
   * or null when no value is stored. Cheap pre-check used to gate
   * write-amplification on `recordSessionId` — vendors emit `session_id`
   * events on every stream message, but the on-disk write needs to fire
   * only on the first capture. (Round-2 SF2.)
   */
  function readBoundSessionId(executionId: number): string | null {
    const result = db.exec(
      'SELECT vendor_session_id FROM command_executions WHERE id = ?',
      [executionId],
    )
    const value = result[0]?.values[0]?.[0]
    return typeof value === 'string' ? value : null
  }

  /**
   * Records a vendor session id on the dashboard's parent
   * command_executions row. Called from command-runner on every
   * `session_id` event from a vendor adapter.
   *
   * Idempotent — vendors emit `session_id` repeatedly; we record only
   * the first via COALESCE in the underlying primitive AND avoid the
   * `db.export()`+rename roundtrip on subsequent identical calls.
   *
   * Drift handling: vendors can emit a new session id mid-stream
   * (e.g. Claude Code starts a new session id when a turn rolls over
   * its internal limits, OpenCode supports sub-sessions). We keep the
   * ORIGINAL captured id — it's the resume target the user wants.
   * Silently dropping drift here is the right behavior for resume.
   */
  function recordSessionId(executionId: number, vendorSessionId: string): void {
    try {
      const existing = readBoundSessionId(executionId)
      if (existing === vendorSessionId) return // already recorded; no save needed
      if (existing) {
        // Drift — keep the original (COALESCE wins). Log once per
        // execution so a real vendor regression is detectable in
        // production logs without spamming on every stream message.
        //
        // Note: drift events do NOT refresh `last_heartbeat_at`.
        // Drift is an anomaly signal; refreshing on it would conflate
        // with normal liveness and mask the failure mode that the
        // heartbeat is meant to detect. The spec scenario at
        // `session-management/spec.md:35` documents this constraint.
        if (!driftLoggedFor.has(executionId)) {
          driftLoggedFor.add(executionId)
          console.warn(
            `[session-capture] vendor session id drift on execution ${executionId}: ` +
              `keeping original "${existing}" (proposed "${vendorSessionId}")`,
          )
        }
        return
      }
      recordVendorSessionIdForExecution(db, executionId, vendorSessionId)
      saveDb(db, ocrDir)
    } catch (err) {
      console.error(
        `[session-capture] recordSessionId failed for execution ${executionId} → ${vendorSessionId}:`,
        err,
      )
    }
  }

  /**
   * Late-links the dashboard's parent command_executions row to a
   * workflow created by the AI's `ocr state init`. Identified by the
   * dashboard-supplied uid via the `OCR_DASHBOARD_EXECUTION_UID` env var
   * or the `--dashboard-uid` flag.
   *
   * Note: today's CLI runs `ocr state init` in its own process and
   * delegates to `linkDashboardInvocationToWorkflow` directly. This
   * server-side method exists for completeness — it lets in-process
   * callers (future supervisor work) link without shelling out.
   */
  function linkInvocationToWorkflow(uid: string, workflowId: string): void {
    try {
      linkDashboardInvocationToWorkflow(db, uid, workflowId)
      saveDb(db, ocrDir)
    } catch (err) {
      console.error('[session-capture] linkInvocationToWorkflow failed:', err)
    }
  }

  /**
   * Targeted auto-link for a specific dashboard execution row.
   *
   * Called from command-runner's post-spawn polling loop. Looks at the
   * `sessions` table for the most recently active session that started
   * or was updated AFTER this execution's `started_at` (so we don't
   * retroactively link to an unrelated old session) and binds them.
   *
   * This is the reliable path. The earlier
   * `autoLinkPendingDashboardExecution` hook on `DbSyncWatcher.syncSessions`
   * fires only on INSERT — it misses the UPDATE path that activates when
   * the AI reuses an existing session id (same `<date>-<branch>` workflow
   * id from a prior review). Polling from command-runner catches both.
   *
   * Returns `true` once a `workflow_id` is bound (either by this call or
   * already present), so the caller can stop polling.
   */
  function linkExecutionToActiveSession(executionUid: string): boolean {
    try {
      const row = db.exec(
        'SELECT workflow_id, started_at FROM command_executions WHERE uid = ?',
        [executionUid],
      )[0]?.values[0]
      if (!row) return false
      const existingWorkflow = row[0] as string | null
      if (existingWorkflow) return true // already linked
      const startedAt = row[1] as string | null
      if (!startedAt) return false

      // Look for an ACTIVE session whose lifecycle window overlaps this
      // execution's spawn:
      //   - started_at OR updated_at >= spawn time (the session is at
      //     or after we started)
      //   - started_at <= spawn + 30 minutes (rejects unrelated sessions
      //     created long after this spawn — defends against concurrent
      //     reviews in other projects/branches binding here)
      //   - status = 'active' (closed/archived sessions cannot match
      //     even if their updated_at was touched by a sweep)
      //
      // Round-1 Should Fix #3: the previous unbounded `OR` query
      // could pick up an unrelated concurrent review in another project
      // and silently mis-bind it to this execution's row.
      const result = db.exec(
        `SELECT id FROM sessions
         WHERE status = 'active'
           AND (updated_at >= ? OR started_at >= ?)
           AND started_at <= datetime(?, '+30 minutes')
         ORDER BY updated_at DESC, started_at DESC
         LIMIT 1`,
        [startedAt, startedAt, startedAt],
      )
      const sessionId = result[0]?.values[0]?.[0]
      if (typeof sessionId !== 'string') return false

      linkInvocationToWorkflow(executionUid, sessionId)
      console.log(
        `[session-capture] poll-linked dashboard execution uid=${executionUid} → workflow_id=${sessionId}`,
      )
      return true
    } catch (err) {
      console.error(
        '[session-capture] linkExecutionToActiveSession failed:',
        err,
      )
      return false
    }
  }

  /**
   * Server-side auto-link: when a new `sessions` row is observed (via
   * the CLI's `ocr state init`), find the most recent dashboard-spawned
   * `command_executions` row that is still missing a `workflow_id` and
   * bind it to the new workflow.
   *
   * Why this exists: the env-var (`OCR_DASHBOARD_EXECUTION_UID`) and
   * flag (`--dashboard-uid`) paths both depend on the AI orchestrator
   * either preserving the env var across its sandboxed shell OR
   * following a prompt instruction to pass the flag. Both can silently
   * fail. This server-side path makes the linkage robust regardless of
   * vendor adapter behavior.
   *
   * Disambiguation:
   *  - Match only rows whose `command` looks like a dashboard-spawned
   *    workflow (starts with `ocr review` / `ocr map` / etc. — the
   *    AI-driven commands). Agent-session rows from `ocr session
   *    start-instance` are excluded by the prefix filter.
   *  - Match only rows still missing `workflow_id`. Already-linked
   *    rows are untouched.
   *  - Pick the most recent — concurrent reviews from the same project
   *    are pathological; if multiple unlinked rows exist, the freshest
   *    one is the right pick by timestamp.
   *  - Time-window: 30 minutes of `started_at`. Old, abandoned rows
   *    don't get retroactively linked to a fresh workflow.
   *
   * Idempotent. No-op when no candidate row exists.
   */
  function autoLinkPendingDashboardExecution(workflowId: string): void {
    try {
      const result = db.exec(
        `SELECT uid FROM command_executions
         WHERE workflow_id IS NULL
           AND uid IS NOT NULL
           AND last_heartbeat_at IS NOT NULL
           AND (command LIKE 'ocr review%' OR command LIKE 'ocr map%')
           AND started_at > datetime('now', '-30 minutes')
         ORDER BY started_at DESC, id DESC
         LIMIT 1`,
      )
      const uid = result[0]?.values[0]?.[0]
      if (typeof uid !== 'string') return
      linkInvocationToWorkflow(uid, workflowId)
      console.log(
        `[session-capture] auto-linked dashboard execution uid=${uid} → workflow_id=${workflowId}`,
      )
    } catch (err) {
      console.error(
        '[session-capture] autoLinkPendingDashboardExecution failed:',
        err,
      )
    }
  }

  /**
   * Counts every `command_executions` row tied to a workflow. Powers the
   * user-visible `invocationsForWorkflow` diagnostic. A zero with a
   * non-zero `sessionIdEventsObserved` is a contradiction worth
   * surfacing to the user.
   */
  function countInvocationsForWorkflow(workflowId: string): number {
    const result = db.exec(
      'SELECT COUNT(*) AS c FROM command_executions WHERE workflow_id = ?',
      [workflowId],
    )
    return (result[0]?.values[0]?.[0] as number | undefined) ?? 0
  }

  /**
   * The single entry point for the handoff route. Returns a structured
   * outcome — either a resumable command pair or a typed failure with
   * diagnostics.
   *
   * Recovery: when the relational state lacks a vendor_session_id but
   * the events JSONL on disk has one, the service backfills via
   * `recordSessionId` and returns `resumable`. The events file is
   * load-bearing for resume recovery.
   *
   * Hot-path discipline (round-2 SF7): the JSONL replay only runs when
   * we actually need it (relational state missing). On the resumable
   * happy path we short-circuit — the spec requires "SHALL NOT consult
   * the JSONL replay path for that row" once already-bound, and the
   * resumable outcome doesn't carry the diagnostic count anyway.
   */
  function resolveResumeContext(workflowId: string): ResumeOutcome {
    const session = getSession(db, workflowId)
    if (!session) {
      return {
        kind: 'unresumable',
        reason: 'workflow-not-found',
        diagnostics: buildDiagnostics({
          reason: 'workflow-not-found',
          vendor: null,
          vendorBinaryAvailable: false,
          invocationsForWorkflow: 0,
          sessionIdEventsObserved: 0,
        }),
      }
    }

    let latest = getLatestAgentSessionWithVendorId(db, workflowId)

    // Recovery (only when needed): walk JSONL for a captured session_id
    // when the relational state has none. On the resumable happy path
    // we skip this entirely — that's both a spec requirement and a
    // perf win (long crashed sessions can have multi-MB journals).
    let sessionIdEventsObserved = 0
    if (!latest || !latest.vendor_session_id) {
      const recovery = recoverFromEventsJsonl(ocrDir, db, workflowId)
      sessionIdEventsObserved = recovery.sessionIdEventsObservedTotal
      if (recovery.found) {
        recordSessionId(recovery.found.executionId, recovery.found.vendorSessionId)
        latest = getLatestAgentSessionWithVendorId(db, workflowId)
      }
    }

    if (!latest || !latest.vendor_session_id) {
      const reason: UnresumableReason = 'no-session-id-captured'
      return {
        kind: 'unresumable',
        reason,
        diagnostics: buildDiagnostics({
          reason,
          vendor: latest?.vendor ?? null,
          vendorBinaryAvailable: false,
          invocationsForWorkflow: countInvocationsForWorkflow(workflowId),
          sessionIdEventsObserved,
        }),
      }
    }

    // Vendor-specific concerns — binary name, resume command syntax,
    // host-binary detection — live on the adapter strategy. The service
    // treats `vendor` as opaque and reads availability from the cached
    // startup detection (round-2 SF5 — was per-request spawnSync).
    const adapter = aiCliService.getAdapterByBinary(latest.vendor)
    const hostBinaryAvailable = aiCliService.isAdapterAvailable(latest.vendor)

    if (!adapter || !hostBinaryAvailable) {
      const reason: UnresumableReason = 'host-binary-missing'
      return {
        kind: 'unresumable',
        reason,
        diagnostics: buildDiagnostics({
          reason,
          vendor: latest.vendor,
          vendorBinaryAvailable: false,
          invocationsForWorkflow: countInvocationsForWorkflow(workflowId),
          sessionIdEventsObserved,
        }),
      }
    }

    // The resumable arm carries only the vendor-native command. An
    // OCR-mediated alternative (`ocr review --resume <workflow-id>`)
    // was previously sketched as a placeholder field gated on whether
    // the published CLI ships the `review --resume` subcommand. Round-2
    // SF5 retired the placeholder — the discriminated union has slack
    // to add it back when (a) the published CLI ships the subcommand
    // and (b) a real config gate is wired. Removing the dead field
    // also retires ~30 lines of toggle UI in the panel that exercised
    // a code path that could not fire.
    const vendorCommand = adapter.buildResumeCommand(latest.vendor_session_id)

    return {
      kind: 'resumable',
      vendor: latest.vendor,
      vendorSessionId: latest.vendor_session_id,
      hostBinaryAvailable,
      vendorCommand,
    }
  }

  return {
    recordSessionId,
    linkInvocationToWorkflow,
    autoLinkPendingDashboardExecution,
    linkExecutionToActiveSession,
    resolveResumeContext,
  }
}

export type SessionCaptureService = ReturnType<typeof createSessionCaptureService>

// ── Diagnostics builders ──

type DiagnosticsInput = {
  reason: UnresumableReason
  vendor: string | null
  vendorBinaryAvailable: boolean
  invocationsForWorkflow: number
  sessionIdEventsObserved: number
}

function buildDiagnostics(input: DiagnosticsInput): CaptureDiagnostics {
  const microcopy = microcopyFor(input.reason)
  return {
    vendor: input.vendor,
    vendorBinaryAvailable: input.vendorBinaryAvailable,
    invocationsForWorkflow: input.invocationsForWorkflow,
    sessionIdEventsObserved: input.sessionIdEventsObserved,
    remediation: microcopy.remediation,
    microcopy,
  }
}
