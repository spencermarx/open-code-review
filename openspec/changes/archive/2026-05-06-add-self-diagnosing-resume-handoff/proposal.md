# Proposal: Self-diagnosing resume handoff with consolidated capture service

## Why

The session-id capture flow that powers "Resume in terminal" works most of the
time but fails silently when it doesn't. Three architectural issues compound:

1. **Capture logic is split across three layers** — adapter parses
   `session_id` events, `command-runner` binds them to the parent row, and
   `ocr state init` late-links `workflow_id` via an env var. No single owner;
   three independent error paths; failures in any one drop the user back to a
   "fresh-start fallback" with no explanation.
2. **The handoff route's failure shape is opaque** — `fallback: 'fresh-start'`
   is a single boolean signal that erases information. Users can't tell
   whether the AI never emitted a session id, the binding raced, the vendor
   binary is missing, or the workflow itself is wrong.
3. **The events JSONL we already write is not consulted** when binding misses.
   We have evidence of every captured session id on disk, but `getLatestAgentSessionWithVendorId`
   only queries relational state — so a torn DB write or missed binding
   causes a permanent fresh-start fallback even though recovery data exists.

These manifest as a recurring user pain: "I clicked Resume and got
'fresh-start' with no explanation. Why?" Tonight a user asked twice in one
session.

## What Changes

This proposal stamps out the three issues in one cohesive refactor, scoped to
the existing capture/handoff surface — no new product features added.

### Architectural

- **Introduce `SessionCaptureService`** as the single owner of every code path
  that reads or writes `vendor_session_id` or links `agent_invocations` to
  `workflows`. `command-runner` (binding on `session_id` events), `ocr state
  init` (late workflow_id linkage), and the `/api/sessions/:id/handoff` route
  all delegate to it. The service is a Branch-by-Abstraction façade — it
  initially wraps existing SQL, and future phases (event sourcing, domain
  table split, storage upgrade) swap its internals without touching call
  sites.
- **Promote the events JSONL to a recovery primitive.** When the service
  detects a workflow that should be resumable but isn't bound, it scans
  `.ocr/data/events/<execution_id>.jsonl` for captured `session_id` events
  and backfills the relational state. The events file becomes load-bearing
  for resume.

### User-visible (the one DX addition)

- **Replace `fallback: 'fresh-start' | null` with a typed `UnresumableReason`
  enum + per-reason microcopy** rendered in `TerminalHandoffPanel`. Every
  failure mode shows the user what happened, why it likely happened, and
  what to do about it. Microcopy lives in one file so updates don't require
  React changes.

### What this is NOT

Per the simplification brief, this proposal **does not** introduce: live
capture telemetry pips, polyglot agent pickers, resume-as-URL pages, vendor
ops dashboards, internal observability endpoints, storage upgrades to
better-sqlite3, full event sourcing, or domain table splits. Those live in
`docs/architecture/agent-lifecycle-and-resume.md` for evidence-driven future
prioritization.

## Impact

- **Affected specs**:
  - `dashboard` — MODIFIED requirements on the `"Pick Up in Terminal"
    Handoff Panel` (response shape, default mode, no-fabricated-command
    behavior); ADDED requirement for self-diagnosing failure rendering.
  - `session-management` — ADDED requirements documenting the capture
    contract (single-owner service, JSONL replay fallback) that today's code
    implements informally.

- **Affected code**:
  - **NEW**: `packages/dashboard/src/server/services/capture/{session-capture-service,unresumable-microcopy,recover-from-events}.ts`
  - **MODIFIED**: `packages/dashboard/src/server/socket/command-runner.ts`
    (session_id case → service call), `packages/cli/src/commands/state.ts`
    (env-var late-link → service call), `packages/dashboard/src/server/routes/handoff.ts`
    (delegate to service, return structured outcome),
    `packages/dashboard/src/client/lib/api-types.ts` (HandoffPayload shape),
    `packages/dashboard/src/client/features/sessions/components/terminal-handoff-panel.tsx`
    (render structured failure)
  - **REUSED no changes**: `packages/dashboard/src/server/services/event-journal.ts`
    (already writes the JSONL we replay from)

- **Migration discipline** (Branch by Abstraction, Fowler):
  1. Introduce service with delegation to existing SQL — behavior unchanged.
  2. Move call sites to service one at a time — tests pass at every step.
  3. Add structured return type — route updates → API types → panel.
  4. Add JSONL recovery — new tests exercise the recovery path.

- **Cross-package**: yes (dashboard server + CLI). Coordinated via the
  existing `OCR_DASHBOARD_EXECUTION_UID` env-var contract; no new
  inter-process protocol introduced.

- **Breaking changes**: none for end users. Internal API shape
  (`HandoffPayload.fallback`) becomes a discriminated union; client and
  server land together so no API skew.
