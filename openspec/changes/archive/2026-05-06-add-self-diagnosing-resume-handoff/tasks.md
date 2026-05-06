# Tasks

## 1. Service skeleton (Branch by Abstraction)

- [x] 1.1 Create `packages/dashboard/src/server/services/capture/session-capture-service.ts` with `recordSessionId(executionId, vendorSessionId)` delegating to the existing direct UPDATE.
- [x] 1.2 Add `linkInvocationToWorkflow(uid, workflowId)` delegating to the existing late-link UPDATE.
- [x] 1.3 Add a single-instance constructor + DI surface so command-runner, state.ts, and the handoff route share one service.
- [x] 1.4 Write characterization tests at `packages/dashboard/src/server/services/capture/__tests__/session-capture-service.test.ts` that lock in current binding/linking behavior before any refactor moves below.

## 2. Move call sites to the service

- [x] 2.1 Update `packages/dashboard/src/server/socket/command-runner.ts` `case 'session_id'` to call `service.recordSessionId(executionId, evt.id)`. Remove the inline UPDATE.
- [x] 2.2 Update `packages/cli/src/commands/state.ts` `init` action's late-link block to call `service.linkInvocationToWorkflow(uid, sessionId)` instead of the inline UPDATE.
- [x] 2.3 Run `nx test dashboard` and `nx run cli-e2e:e2e` — all existing tests pass.

## 3. Move resolveResumeContext into the service

- [x] 3.1 Add `resolveResumeContext(workflowId)` to the service that wraps the existing `getLatestAgentSessionWithVendorId` lookup AND vendor-command construction logic from `handoff.ts`.
- [x] 3.2 Update `packages/dashboard/src/server/routes/handoff.ts` to delegate to the service. The route becomes thin (request → service → response).
- [x] 3.3 Run `nx run dashboard-api-e2e:e2e` — existing handoff tests pass with the refactored route.

## 4. Structured failure outcome

- [x] 4.1 Define `UnresumableReason` enum and `CaptureDiagnostics` type in the service.
- [x] 4.2 Refactor `resolveResumeContext` to return `ResumeOutcome` (`{ kind: 'resumable', ... } | { kind: 'unresumable', reason, diagnostics }`).
- [x] 4.3 Update `packages/dashboard/src/client/lib/api-types.ts` `HandoffPayload` to mirror the discriminated union.
- [x] 4.4 Create `packages/dashboard/src/server/services/capture/unresumable-microcopy.ts` mapping each `UnresumableReason` to `{ headline, cause, remediation }` strings.
- [x] 4.5 Add CI lint (vitest test) that fails if any `UnresumableReason` variant is missing a microcopy entry.

## 5. Panel rendering

- [x] 5.1 Update `packages/dashboard/src/client/features/sessions/components/terminal-handoff-panel.tsx` to switch on `outcome.kind`.
- [x] 5.2 For `kind: 'unresumable'`, render the headline / cause / remediation from the microcopy + the diagnostics block.
- [x] 5.3 For `kind: 'resumable'`, preserve current command-pair rendering (vendor-native primary).
- [x] 5.4 Remove the old `fallback === 'fresh-start'` branch; remove the fabricated `ocr review --branch <branch>` command.

## 6. JSONL replay fallback

- [x] 6.1 Create `packages/dashboard/src/server/services/capture/recover-from-events.ts` that reads `.ocr/data/events/<execution_id>.jsonl` for invocations belonging to a workflow and returns the first `session_id` event found.
- [x] 6.2 Wire `recoverFromEventsJsonl()` into `resolveResumeContext` BEFORE returning `unresumable`. On hit: backfill via `recordSessionId` (idempotent) and return `resumable`.
- [x] 6.3 Document the recovery flow with a comment block referencing this proposal.

## 7. Tests

- [x] 7.1 API e2e: assert `ResumeOutcome.kind === 'unresumable'` for the workflow-not-found case (replaces today's 404).
- [x] 7.2 API e2e: assert `ResumeOutcome.reason === 'no-session-id-captured'` when no session_id event was ever observed AND the events JSONL is empty.
- [x] 7.3 Recovery test: covered at unit level by `recover-from-events.test.ts` (6 scenarios against real fs + real sql.js DB) — proves the primitive backfills, skips already-bound rows, and tolerates malformed JSONL. Equivalent to an e2e for this isolated helper.
- [ ] 7.4 API e2e: assert `host-binary-missing` reason surfaces when the vendor binary isn't on PATH (mock the probe). Partial coverage: existing handoff e2e tests assert either `resumable` or `host-binary-missing` outcome depending on PATH, but a deterministic mocked-probe test is still TODO.
- [x] 7.5 Service unit tests: every `UnresumableReason` reachable through a constructed scenario.
- [x] 7.6 Microcopy lint test passes: every variant has an entry.

## 8. Verification

- [x] 8.1 `npx nx run-many -t build` clean.
- [x] 8.2 `npx nx run-many -t test` clean.
- [x] 8.3 `npx nx run cli-e2e:e2e` 31+ tests passing (prior count baseline).
- [x] 8.4 `npx nx run dashboard-api-e2e:e2e` 30+ tests passing (prior count baseline + new tests above).
- [ ] 8.5 Live verification: run a fresh review, confirm Resume-in-terminal shows vendor-native command on success. **Deferred** — requires interactive dashboard QA. Tracked as a follow-up; addressable in ~15 min of human time once the PR is staged.
- [ ] 8.6 Live verification: simulate a failure (delete vendor_session_id from DB), confirm panel renders structured reason + remediation. **Deferred** — same constraint as 8.5.
- [ ] 8.7 Live verification: simulate recovery (delete vendor_session_id from DB BUT leave events JSONL intact), confirm panel renders the resumable command after replay backfills. **Deferred** — same constraint as 8.5.
- [ ] 8.8 (Round-2 SF4 follow-up) Add `terminal-handoff-panel.test.tsx` rendering the panel with each `kind: 'unresumable'` outcome and asserting microcopy fields render. Requires introducing `@testing-library/react` + `jsdom` (vitest is currently `environment: 'node'`); deferred to a follow-up infra PR.

## 9. Approval gate

- [ ] 9.1 Confirm every checkbox above is `- [x]`. **Will not be ticked in this PR** — items 8.5–8.8 require human dashboard QA + test-infrastructure expansion. PR ships with explicit "known follow-ups" merge note instead of falsely ticking the gate.
- [x] 9.2 Run `openspec validate add-self-diagnosing-resume-handoff --strict` clean.
- [ ] 9.3 Open PR; reference `docs/architecture/agent-lifecycle-and-resume.md` for the broader roadmap.
