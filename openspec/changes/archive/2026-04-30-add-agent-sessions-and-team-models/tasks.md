# Tasks

Each phase is independently shippable. Within a phase, tasks are dependency-ordered. Tasks are sized to ≤ 2 hours.

## Phase 1 — Foundation: Agent-session journal, heartbeat, sweep, WAL hygiene

- [x] 1.1 Add `agent_sessions` table migration (`packages/cli/src/lib/db/migrations.ts` migration v10). Path corrected from spec — db migrations live under `lib/db/`, not `lib/state/`.
- [x] 1.2 Add `AgentSession`, `AgentSessionStatus`, `AgentVendor` types to `packages/cli/src/lib/state/types.ts`; corresponding `AgentSessionRow`, `InsertAgentSessionParams`, `UpdateAgentSessionParams`, `SweepResult` to `packages/cli/src/lib/db/types.ts`. (`ReviewerInstance` deferred to Phase 4 where it belongs.)
- [x] 1.3 Implement `packages/cli/src/lib/db/agent-sessions.ts` — `insertAgentSession`, `getAgentSession`, `listAgentSessionsForWorkflow`, `getLatestAgentSessionWithVendorId`, `bumpAgentSessionHeartbeat`, `setAgentSessionVendorId`, `setAgentSessionStatus`, `updateAgentSession`, `sweepStaleAgentSessions`. Re-exported from `packages/cli/src/lib/db/index.ts`.
- [x] 1.4 Concurrent writer serialization — relies on the existing merge-before-write pattern (`DbSyncWatcher` + `registerSaveHooks` in `packages/dashboard/src/server/db.ts`). No new code added today: OCR uses sql.js (WASM, in-memory), so cross-process atomicity comes from atomic file rename + merge-before-write rather than SQL `BEGIN IMMEDIATE`. The spec was tightened (`specs/sqlite-state/spec.md > Concurrent Writer Serialization`) to reflect this honestly, with a forward-compatible scenario documenting that BEGIN IMMEDIATE + retry-on-busy MAY be adopted if and when OCR migrates to a native SQLite driver (e.g. `better-sqlite3`). See design.md Decision 8.
- [x] 1.5 WAL checkpoint helper — `walCheckpointTruncate(dbPath)` in `packages/cli/src/lib/db/index.ts`. Best-effort: probes for the native `sqlite3` binary on PATH and executes `PRAGMA wal_checkpoint(TRUNCATE)` against the on-disk file if available. Returns `"checkpointed"` / `"skipped"` / `"failed"`. sql.js cannot reach the on-disk WAL itself; this is the only honest way to reclaim a stale WAL left behind by external native clients (the Wrkbelt-class symptom).
- [x] 1.6 Wired into dashboard startup in `packages/dashboard/src/server/index.ts` — WAL checkpoint runs immediately before `openDb`, sweep runs immediately after the existing stale-`command_executions` cleanup. New CLI exports added: `@open-code-review/cli/runtime-config` subpath (built via `build.mjs`).
- [x] 1.7 Unit tests in `packages/cli/src/lib/db/__tests__/agent-sessions.test.ts` (insert/list/heartbeat/vendor-id rebind/status transitions/notes accumulation) and `packages/cli/src/lib/__tests__/runtime-config.test.ts` (default, block form, inline form, invalid values, comments).
- [x] 1.8 Integration tests in `agent-sessions.test.ts > sweepStaleAgentSessions` block: backdated heartbeat → sweep → assert `orphaned` + `ended_at` + `notes` containing threshold; fresh row untouched; already-terminal rows untouched; multi-row sweep; FK integrity test for workflow deletion.
- [ ] 1.9 Manual verification against `wrkbelt`'s `.ocr/data/`: run dashboard with the new build, verify the 28-day-old WAL gets checkpointed and any stale running rows reclassified. **To be performed in a follow-up session against the actual environment.**

## Phase 2 — Session journaling: `ocr session` subcommand family + workflow `session_id` capture

- [x] 2.1 Implemented `ocr session start-instance` in `packages/cli/src/commands/session.ts`. Auto-derives `name` from `{persona}-{instance_index}` when not supplied. Sweeps stale rows opportunistically per spec.
- [x] 2.2 Implemented `bind-vendor-id`, `beat`, `end-instance`, `list`. `end-instance` infers status from exit code (0 → done, non-zero → crashed) when `--status` is omitted. `list` supports `--json` for machine consumption.
- [x] 2.3 Wired `sessionCommand` into `packages/cli/src/index.ts`.
- [x] 2.4 Added `case 'session_id'` to the workflow event switch in `packages/dashboard/src/server/socket/command-runner.ts`. Implemented as `bindVendorSessionIdOpportunistically` — finds the most recent unbound `running` row in an active workflow, binds, no-ops if already bound, drops the event silently when no candidate exists. Honest about the chicken-and-egg with the Tech Lead's first session_id (which arrives before any OCR session is initialized) — a later re-emission of the same vendor id binds correctly once a row exists.
- [x] 2.5 Test coverage in `agent-sessions.test.ts > bindVendorSessionIdOpportunistically` — null-when-no-candidate, binds-most-recent-unbound, idempotent on re-bind of same id, ignores rows in inactive workflows, ignores rows already bound to different vendor id, ignores terminal rows.

## Phase 3 — Model discovery: `listModels()` adapter method + `ocr models list`

- [x] 3.1 Added `ModelDescriptor` type, `listModels(): Promise<ModelDescriptor[]>` and `supportsPerTaskModel` to `AiCliAdapter` interface; added `model?: string` to `SpawnOptions`.
- [x] 3.2 `listModels()` implemented in `claude-adapter.ts`. Probes `claude models --json`, falls back to bundled known-good list. `supportsPerTaskModel = true`.
- [x] 3.3 `listModels()` implemented in `opencode-adapter.ts`. Probes `opencode models --json`, bundled fallback uses provider-prefixed ids. `supportsPerTaskModel = false`.
- [x] 3.4 `--model <id>` passed through both adapters when `SpawnOptions.model` is set. Mirrors the existing `--resume` precedent.
- [x] 3.5 `ocr models list` implemented in `packages/cli/src/commands/models.ts` (auto-detect vendor, `--vendor` override, `--json` for programmatic consumption). Backed by shared `packages/cli/src/lib/models.ts` so vendor logic isn't duplicated across packages.
- [x] 3.6 Vendor-list snapshot test in `packages/cli/src/lib/__tests__/models.test.ts` — confirms each vendor returns a non-empty list (native or bundled) and that OpenCode bundled ids carry a provider prefix.
- [x] 3.7 `supportsPerTaskModel` capability flag added to interface (true for Claude Code, false for OpenCode). Consumers can branch on the flag.

## Phase 4 — Team config parser + `ocr team` subcommands

- [x] 4.1 Implemented `parseTeamConfigYaml` in `packages/cli/src/lib/team-config.ts` using the `yaml` package (added to cli deps). Three forms (number/object/array) normalize to canonical `ReviewerInstance[]`. Mixing forms rejected at parse time with clear errors. `loadTeamConfig(ocrDir)` is the disk-side wrapper.
- [x] 4.2 Alias expansion + `models.default` fallback. Resolution chain: instance > teamModel > defaultModel > null. OCR ships zero alias entries.
- [x] 4.3 `resolveTeamComposition(team, override?)` applies session-time overrides per persona — overrides replace ALL existing instances of a referenced persona; untouched personas pass through unchanged.
- [x] 4.4 `ocr team resolve` (`--session-override <json>`, `--session-override-stdin`, `--json` for AI consumption) and `ocr team set --stdin` implemented. `set` preserves unrelated config keys (models.aliases, runtime, code-review-map) and emits the most compact form per persona.
- [x] 4.5 Replaced the regex parser in `installer.ts:274-286` with a call to `parseTeamConfigYaml`. `is_default` derivation now uses the canonical parser — `reviewers-meta.json` lights up correctly for all three schema forms.
- [x] 4.6 Property-style tests in `packages/cli/src/lib/__tests__/team-config.test.ts` covering: shorthand, object form, list form, backwards-compat with prior single-number configs, mixing rejection, non-positive counts, empty-list rejection, alias expansion, default-model fallback, instance-overrides-team precedence, override resolution.
- [x] 4.7-4.9 Subsumed by 4.6 — error-path tests (mixing/missing-count/non-positive/empty-list) and backwards-compat regression are inline in the same file.

## Phase 5 — Workflow honors per-instance models

- [x] 5.1 Updated `packages/agents/skills/ocr/references/workflow.md` Phase 4 — replaced the manual YAML-parsing instruction with `ocr team resolve --json`. New step covers per-instance model honoring (and graceful degradation when host lacks per-task primitive) plus the journaling sequence (`start-instance` / `bind-vendor-id` / `beat` / `end-instance`).
- [x] 5.2 Per-task-model-override capability requirement documented inline in the new Phase 4 instructions; explicit "do NOT silently ignore configured models" guidance added.
- [x] 5.3 Mirrored Phase 4 reference in `packages/agents/skills/ocr/SKILL.md > Default Reviewer Team` — added "Resolving the team at runtime", "Per-instance models", and "Journaling" subsections.
- [x] 5.4 Added the three-form schema (Form 1 active, Forms 2/3 commented out as examples) to `packages/agents/skills/ocr/assets/config.yaml`. Also added new optional `models:` and `runtime:` sections (entirely user-owned, OCR ships zero alias entries).
- [ ] 5.5 End-to-end test against a Claude Code subagent-capable host — **deferred to follow-up validation against the actual environment** (`/openspec:apply` is design-and-implementation; full E2E requires both Claude Code and OpenCode installed and a real review run).
- [ ] 5.6 Negative-path test against an OpenCode host — **deferred to same follow-up**.

## Phase 6 — Dashboard liveness + Continue here + Pick up in terminal

- [x] 6.1 `GET /api/agent-sessions?workflow=<id>` implemented in `packages/dashboard/src/server/routes/agent-sessions.ts`. Returns `{ workflow_id, agent_sessions: AgentSessionRow[] }`.
- [x] 6.2 `agent_session:updated` socket event wired through `DbSyncWatcher.syncAgentSessions` — INSERT-OR-REPLACE mirror from disk, single emission per sync with affected workflow ids in the payload. Client invalidates only matching queries.
- [x] 6.3 `LivenessHeader` component (`liveness-header.tsx`) — Running / Stalled / Orphaned / idle classification via `classifyLiveness`, with a 60s heartbeat freshness threshold matching the server-side default. Self-suppresses when no agent_sessions exist or status is idle. Includes per-status counts summary.
- [x] 6.4 In-dashboard "Continue here" wired via the existing `command:run` socket pattern with a new `--resume <workflow-id>` arg. `command-runner.ts` parses the flag, looks up `vendor_session_id` via `getLatestAgentSessionWithVendorId`, and threads it through `SpawnOptions.resumeSessionId`.
- [x] 6.5 `ResumeCard` component (`resume-card.tsx`) — primary "Continue here" button + secondary "Pick up in terminal" trigger. Uses workspace-level dark/light/zinc-based palette to match existing components.
- [x] 6.6 `GET /api/sessions/:id/handoff` returns the full Spec 5 payload — server-built command strings, host-binary PATH probe, fresh-start fallback when no vendor id is captured.
- [x] 6.7 `TerminalHandoffPanel` modal (`terminal-handoff-panel.tsx`) — full Spec 5 implementation. Mode toggle (OCR-mediated / vendor-native bypass), two-step `cd` + resume commands, per-line copy buttons, "Copy both" helper, vendor-native warning banner, fresh-start fallback messaging, host-binary-missing inline note. Modal pattern matches existing `prompt-viewer-sheet.tsx` (overlay + click-outside + ESC + focus-trap).
- [x] 6.8 Edge-case states implemented: loading skeleton, ready (OCR mode), ready (vendor mode), no vendor id captured (fresh-start fallback), missing host binary inline note. Mode toggle hidden when no vendor command is available.
- [x] 6.9 Entry point wired on the session detail page above the existing session header. Liveness header self-suppresses when idle; `ResumeCard` shows for stalled / orphaned / completed-resumable workflows.
- [x] 6.10 `ocr review --resume <workflow-id>` CLI command added (`packages/cli/src/commands/review.ts`). Looks up the captured vendor session id and execs the host CLI's native resume invocation with stdio inherited. Backs the OCR-mediated path of the terminal handoff panel.
- [ ] 6.11 / 6.12 Manual verification against Claude Code and OpenCode environments — deferred to follow-up validation against real installs.

- [x] 6.13 Khorikov classical-school e2e suite added in `packages/cli-e2e/src/agent-sessions.test.ts` (22 new tests) and `packages/dashboard-api-e2e/src/agent-sessions-api.test.ts` (13 new tests). Real subprocess execution of the built `ocr` binary, real SQLite on disk, real HTTP against a forked dashboard server. Covers session journaling lifecycle, sweep-on-insert, vendor-id binding semantics, three-form team config parsing + alias expansion + override resolution, model-list discovery + bundled fallback, OCR-mediated and vendor-native handoff command construction, and CLI→dashboard cross-process visibility via DbSyncWatcher.

## Phase 7 — Team Composition Panel + reviewers page badge

- [x] 7.1 `GET /api/team/resolved`, `POST /api/team/default`, and `GET /api/team/models` implemented in `packages/dashboard/src/server/routes/team.ts`. `resolved` accepts `?override=<json>`; `default` shells out to `ocr team set --stdin`; `models` wraps `listModelsForVendor` from the new `@open-code-review/cli/models` subpath export.
- [x] 7.2 `TeamCompositionPanel` component (`team-composition-panel.tsx`) — flagship Spec 1 implementation. Persona rows with disclosure toggle, count stepper, "Same model" / "Per reviewer" mode toggle, per-instance model dropdowns, "Add reviewer" inline picker, "Save as default" opt-in checkbox + explicit "Save now" button. Matches the dashboard's existing zinc-based palette, rounded-md borders, and lucide iconography (Plus/Minus/ChevronDown/UserPlus/Save/X).
- [x] 7.3 Wired into the New Review flow in `commands-page.tsx`. The advanced override is appended as `--team <json>` to any `review` command via the `command:run` wrapper; basic palette's `--team` is still emitted, but command-runner's parser picks the last value (advanced wins). No collision logic required.
- [x] 7.4 Override serialization is the canonical `ReviewerInstance[]` JSON shape end-to-end. Same parser handles disk YAML and override JSON.
- [x] 7.5 Degraded states implemented: empty `listModels()` → free-text input fallback; per-reviewer mode auto-selected when external state already has variance; reset-to-default clears overrides; unresolvable `listModels()` doesn't break the panel.
- [x] 7.6 Reviewers page "in default team ×N" badge — `reviewer-card.tsx` accepts an `inDefaultTeamCount` prop. `reviewers-page.tsx` aggregates per-persona counts from `useResolvedTeam()` and passes through. Replaces the existing binary "Default" badge for in-team reviewers.
- [ ] 7.7 / 7.8 Component tests + manual verification — deferred to a follow-up testing session. Manual verification touches the live dashboard server.

## Cross-cutting

- [ ] X.1 Confirm TypeScript-only across all new files (per `CLAUDE.md`); no raw `.js`/`.mjs` introduced.
- [ ] X.2 Confirm Nx-native automation for any new release-time hooks; do not add npm lifecycle scripts.
- [ ] X.3 Update `CHANGELOG.md` with a single entry summarizing this change.
- [ ] X.4 Update relevant package READMEs (cli, dashboard) with new commands and dashboard surfaces.
- [ ] X.5 Add an example to `packages/agents/skills/ocr/assets/config.yaml` showing the three-form schema with comments.
- [ ] X.6 `openspec validate add-agent-sessions-and-team-models --strict` passes.

## Validation

- [ ] V.1 All unit and integration tests pass (`nx test cli`, `nx test dashboard`).
- [ ] V.2 `wrkbelt` smoke test: open `wrkbelt`'s `.ocr/data/` with the new dashboard build; confirm WAL checkpoint executes and stale `running` sessions get reclassified `orphaned`.
- [ ] V.3 End-to-end: configure two principals on different models, run a review against Claude Code, kill it mid-phase, resume from dashboard "Continue here", confirm review completes with both models honored across the agent_sessions journal.
- [ ] V.4 End-to-end: same flow against OpenCode; confirm graceful behavior on a host without per-task model support (warning surfaced, parent model used uniformly, journal accurate).
- [ ] V.5 Backwards-compat smoke test: open a project that uses the old `default_team: { principal: 2 }` config; confirm parse, resolve, and review run unchanged.
