# Design: Self-diagnosing resume handoff with consolidated capture service

This document captures the architectural reasoning behind the change. The
spec deltas describe the contracted behavior; this document explains why we
chose this shape over alternatives.

## Context

OCR is a local-first, single-user, multi-agent code review tool. The dashboard
is a viewer + command-copier; the AI CLI is the orchestrator. The capture/
handoff flow is the seam between them — it journals what the AI did so the
user can pick up the conversation later.

Today's seam works most of the time but breaks in ways users can't diagnose
because:

1. The capture logic is split across three layers (adapter, command-runner,
   `ocr state init`) with no single owner.
2. The handoff route returns a single boolean fallback signal, erasing
   information about *why* resume isn't possible.
3. The events JSONL we already write isn't consulted as a recovery primitive
   when relational state is incomplete.

This change addresses all three under a single Branch-by-Abstraction refactor
with one user-visible improvement (structured failure rendering).

## Goals

1. **Single owner for capture.** Every read/write of `vendor_session_id` and
   every link of `agent_invocations` to `workflows` goes through one service
   with one tested interface.
2. **Failure modes are inspectable.** The handoff response carries a typed
   reason and structured diagnostics; the panel renders both as user-facing
   guidance.
3. **Recovery from binding gaps is automatic.** When relational state is
   incomplete but events JSONL has the captured data, the service backfills
   transparently.

Non-goals (deliberately deferred):

- Polyglot agent UI for mixed-vendor reviewer teams.
- Resume-as-URL (shareable resume pages with audit history).
- Live capture telemetry surfaced during a running review.
- Storage upgrade (sql.js → better-sqlite3 + WAL).
- Full event sourcing (events as system of record + projection rebuilds).
- Domain table split (`workflows` / `agent_invocations` / `process_lifecycle`).
- `InvocationSupervisor` with structured shutdown semantics.

These are tracked in `docs/architecture/agent-lifecycle-and-resume.md` as
queued phases. They are not user pain today; this change addresses the active
pain only.

## Architecture

### Service shape

The shipped service surface is five methods, not the three originally
sketched. Three are user-contract methods (the surface external callers
depend on); two are linkage-discovery strategies that defend against
ways the dashboard's parent execution can fail to be linked to its
workflow. The added pair is *defensive* — it does not erode the
single-owner SQL-write guarantee, which still lives in
`@open-code-review/cli/db` and is the load-bearing claim of
Branch-by-Abstraction here.

```ts
class SessionCaptureService {
  // ── Contract methods (stable across future refactors) ──

  // Idempotent. Called from command-runner on every session_id event.
  recordSessionId(executionId: number, vendorSessionId: string): void

  // Called from `ocr state init` (env var, --dashboard-uid flag, or
  // marker file path).
  linkInvocationToWorkflow(uid: string, workflowId: string): void

  // The single entry point for resume queries from the route.
  resolveResumeContext(workflowId: string): ResumeOutcome

  // ── Linkage-discovery strategies (round-1 / round-2 hardening) ──

  // Called by the DbSyncWatcher's onSessionInserted hook. Fires only
  // on session INSERT, not UPDATE. Useful for fresh sessions; misses
  // the same-id reuse path (see `linkExecutionToActiveSession`).
  autoLinkPendingDashboardExecution(workflowId: string): void

  // Called from command-runner's post-spawn polling loop. Catches the
  // session-UPDATE path (resumed/re-entered sessions) that the
  // watcher hook misses. Bounded by status='active' + 30-minute upper
  // window to avoid mis-binding under concurrent reviews.
  linkExecutionToActiveSession(executionUid: string): boolean
}
```

The cross-process linkage contract — how the dashboard transmits its
execution uid to the AI's `state init` invocation — has three sources
in precedence order:

1. **`--dashboard-uid <uid>` flag** — survives shell sandboxes that
   strip env vars; explicit and durable.
2. **`OCR_DASHBOARD_EXECUTION_UID` env var** — works when the AI
   shell preserves unfamiliar env vars.
3. **`.ocr/data/dashboard-active-spawn.json` marker file** — written
   by the dashboard at spawn, read by `state init`. PID-liveness
   checked so a stale marker from a crashed dashboard can't be
   consumed.

Both `autoLinkPendingDashboardExecution` (watcher hook) and
`linkExecutionToActiveSession` (post-spawn polling) are server-side
fallbacks for the case where all three above fail.

```ts
type ResumeOutcome =
  | { kind: 'resumable'; vendor: VendorId; sessionId: string; commands: ResumeCommands }
  | { kind: 'unresumable'; reason: UnresumableReason; diagnostics: CaptureDiagnostics }

type UnresumableReason =
  | 'workflow-not-found'
  | 'no-session-id-captured'
  | 'host-binary-missing'
// Note: an earlier `session-id-captured-but-unlinked` variant was
// dropped — the JSONL recovery primitive runs before unresumable is
// computed and transparently backfills the unlinked case. The
// recovery helper at `recover-from-events.ts` is load-bearing for
// this type's completeness; making it conditional re-opens the gap.

type CaptureDiagnostics = {
  vendor: VendorId | null
  vendorBinaryAvailable: boolean
  invocationsForWorkflow: number
  sessionIdEventsObserved: number
  remediation: string
}
```

The service is a thin façade. Its first implementation wraps the existing
SQL in `agent-sessions.ts`. Future phases (per the architecture doc) will
swap internals without touching call sites — this is the load-bearing
discipline of Branch by Abstraction.

### JSONL recovery flow

```
resolveResumeContext(workflowId):
  1. Look up the parent invocation row by workflow_id.
     If no row → return { kind: 'unresumable', reason: 'workflow-not-found' }
  2. If row.vendor_session_id is set → return { kind: 'resumable', ... }
  3. Recovery attempt: scan events JSONL for the workflow's invocations.
     If a captured session_id is found:
       - Idempotently UPDATE the row with the captured value.
       - Return { kind: 'resumable', ... }
     Else → return { kind: 'unresumable', reason: 'no-session-id-captured', diagnostics }
```

The recovery is "last chance, best effort" — if the JSONL is corrupt or
missing, we fall through to the structured failure with diagnostics. We never
fabricate a resume command from incomplete data.

### Why a typed enum over a string

Stringly-typed errors are exactly the smell this proposal addresses for vendor
names elsewhere. The enum:

- Is exhaustively switched in the panel (TypeScript compiler catches missing
  cases).
- Maps 1:1 to a microcopy file. Adding a new reason requires updating the
  file; CI lint enforces every variant has a microcopy entry.
- Surfaces in API e2e tests as a discriminated union — tests assert the
  *reason* shape, not just `fallback: 'fresh-start'`.

### Why JSONL replay (and not "just fix the binding")

The binding fix landed earlier today (direct UPDATE on parent
`executionId` + late workflow_id link from `state init`). That handles the
*known* class of bug. But:

- A future torn write could miss a binding even when both writers behave
  correctly.
- A future vendor adapter regression could silently stop emitting
  `session_id` to the runner — but the events JSONL would still capture
  what the adapter DID emit.
- The events file is already on disk. Treating it as recoverable data is
  free.

This is the smallest possible step toward "events as truth" without
committing to full event sourcing. It demonstrates the pattern's value
before the deeper architectural work.

## Alternatives considered

### A. Move ALL capture into events; relational state becomes pure projection.

This is the right long-term shape (Phase 4 in the architecture roadmap). It's
deferred here because:

- It's a big migration with shadow-write + projection-rebuild infrastructure.
- The Branch-by-Abstraction refactor (this change) is a prerequisite anyway —
  with a service in place, swapping its internals to event-sourced becomes a
  surgical change rather than a systemic rewrite.
- The user pain ("resume failed silently") is addressed without the full
  rewrite.

### B. Keep binding split across layers; just add the diagnostic message.

Rejected. The user-visible improvement (structured failure) requires the
service in place to compute reasons cleanly. Without consolidation, the
diagnostic logic itself splits across three layers — same smell.

### C. Use process exit code or stderr signal for resume failures.

Rejected. The handoff is read by the dashboard at user-click time, long after
the AI process has exited. Process exit metadata is the wrong layer.

### D. Push resume entirely client-side by exposing raw rows.

Rejected. The client should not reconstruct vendor-specific resume command
strings — that's already correctly server-owned and shouldn't change.

## Migration plan

This is a Branch-by-Abstraction refactor. Each step is independently
shippable, behaviorally non-regressing, and reversible.

### Step 1 — Service skeleton

Create `SessionCaptureService` with `recordSessionId` and
`linkInvocationToWorkflow` methods that delegate to existing SQL. Move
`command-runner.ts` and `state.ts` call sites. All existing tests pass.

### Step 2 — resolveResumeContext

Add `resolveResumeContext` to the service. Update the handoff route to
delegate. The route now has zero direct SQL calls.

### Step 3 — Structured outcome

Replace `HandoffPayload.fallback: 'fresh-start' | null` with a discriminated
union. Update `api-types.ts`. Update `TerminalHandoffPanel` to switch on
`outcome.kind`. Add per-reason microcopy file with CI lint that enforces
exhaustiveness.

### Step 4 — JSONL recovery

Add `recoverFromEventsJsonl()` helper. Wire into `resolveResumeContext`
before returning `unresumable`. New e2e test exercises recovery (delete
`vendor_session_id` from a row whose JSONL has a captured event; verify
recovery fires and returns `resumable`).

### Step 5 — Tests + verify

API e2e tests for each `UnresumableReason` (covers happy path, missing
binding, missing workflow, missing host binary, recovered-via-replay).
Build green. Manual live verification per the proposal's verification
section.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Microcopy gets stale for new reasons | Medium | Low | CI lint: every `UnresumableReason` variant must have a microcopy entry |
| JSONL recovery surfaces a wrong session id | Low | Medium | Recovery only runs when relational state is *incomplete*, never overwrites; uses COALESCE semantics |
| Branch-by-Abstraction refactor breaks an existing call site | Medium | High | Characterization tests on the existing handoff API e2e shape locked in BEFORE refactor begins |
| Future event-sourcing migration changes the service contract | Low | Low | Service contract is designed for that future; internals swap, signatures don't |

## Out of scope (queued in architecture doc)

These improvements are real and valuable but deferred because none addresses
active user pain today:

- Storage upgrade (better-sqlite3 + WAL)
- Event sourcing as system of record
- Domain table split (workflows / agent_invocations / process_lifecycle)
- `InvocationSupervisor` with structured shutdown
- Vendor capability contract refactor (replacing string switches in handoff/review)
- Polyglot agent UI for mixed-vendor reviewer teams
- Resume-as-URL pages with shareable audit history
- Live capture telemetry pip in the running-command UI
- Vendor conformance UI / vendor ops dashboard
- Internal observability endpoints

These will queue as follow-on proposals when evidence (user requests,
performance data, support burden) justifies them.
