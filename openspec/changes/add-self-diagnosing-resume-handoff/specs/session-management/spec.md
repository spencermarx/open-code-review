# Session Management Spec Delta

## ADDED Requirements

### Requirement: Single Owner for Session Capture

All code paths that read or write `vendor_session_id` on agent invocations or that link an `agent_invocation` to a `workflow` SHALL delegate to a single `SessionCaptureService` façade. No call site outside the service implementation SHALL execute SQL that mutates `vendor_session_id` or `workflow_id` directly.

#### Scenario: Command-runner records session ids through the service

- **GIVEN** the dashboard's command-runner observes a `session_id` event from an AI CLI's stdout
- **WHEN** the runner needs to bind that vendor session id to its parent execution row
- **THEN** the runner SHALL call `sessionCapture.recordSessionId(executionId, vendorSessionId)`
- **AND** the runner SHALL NOT execute a direct UPDATE on `command_executions.vendor_session_id`

#### Scenario: state init links workflow_id through the service

- **GIVEN** the AI calls `ocr state init` with `OCR_DASHBOARD_EXECUTION_UID` set in the environment
- **WHEN** the new session row is created
- **THEN** the state init command SHALL call `sessionCapture.linkInvocationToWorkflow(uid, sessionId)`
- **AND** the state init command SHALL NOT execute a direct UPDATE on `command_executions.workflow_id`

#### Scenario: Handoff route resolves resume context through the service

- **GIVEN** a request to `GET /api/sessions/:id/handoff`
- **WHEN** the route builds its response payload
- **THEN** the route SHALL call `sessionCapture.resolveResumeContext(workflowId)` and return its outcome
- **AND** the route SHALL NOT execute SELECTs against `command_executions` to determine resume state

#### Scenario: Service idempotency

- **GIVEN** a `session_id` event arrives multiple times for the same execution row (vendors emit it on every stream message)
- **WHEN** `sessionCapture.recordSessionId(executionId, vendorSessionId)` is called repeatedly
- **THEN** only the first vendor session id SHALL be persisted (subsequent calls SHALL be no-ops via `COALESCE` semantics)
- **AND** `last_heartbeat_at` SHALL be refreshed on the first capture (idempotent same-id repeats and drift events are no-ops and SHALL NOT refresh — drift is an anomaly signal, refreshing would conflate with normal liveness)

#### Scenario: Service interface stability across future refactors

- **GIVEN** future architectural phases (event sourcing, domain table split, storage upgrade) refactor the service's internals
- **WHEN** internal SQL or storage changes
- **THEN** the public method signatures (`recordSessionId`, `linkInvocationToWorkflow`, `resolveResumeContext`) SHALL remain stable
- **AND** call sites in command-runner, state.ts, and the handoff route SHALL NOT require coordinated updates
- **AND** internal linkage-discovery strategies (server-side fallbacks for cross-process uid propagation — currently `autoLinkPendingDashboardExecution` and `linkExecutionToActiveSession`) MAY evolve without spec amendment; only the three contract methods above are externally-stable

---

### Requirement: Events JSONL Replay as Recovery Primitive

When the relational state is incomplete but the per-execution events JSONL on disk contains a captured `session_id` event for the workflow, the `SessionCaptureService` SHALL backfill the relational state from the JSONL and return a resumable outcome. The events file SHALL be load-bearing for resume recovery.

#### Scenario: Recovery from a missed binding

- **GIVEN** an `agent_invocations` row whose `vendor_session_id` is NULL
- **AND** the events JSONL at `.ocr/data/events/<execution_id>.jsonl` contains at least one `session_id` event for that invocation
- **WHEN** `sessionCapture.resolveResumeContext(workflowId)` is called for a workflow containing that invocation
- **THEN** the service SHALL read the JSONL, extract the captured `session_id`, persist it to the row idempotently
- **AND** the service SHALL return `{ kind: 'resumable', ... }` with the recovered vendor session id

#### Scenario: No JSONL means no recovery

- **GIVEN** an `agent_invocations` row whose `vendor_session_id` is NULL
- **AND** no events JSONL exists for that invocation OR the JSONL contains no `session_id` events
- **WHEN** the service attempts recovery
- **THEN** the service SHALL return `{ kind: 'unresumable', reason: 'no-session-id-captured', ... }`

#### Scenario: Recovery never overwrites bound state

- **GIVEN** an `agent_invocations` row whose `vendor_session_id` is already set
- **WHEN** the service is asked to resolve a resume context
- **THEN** the service SHALL use the persisted value
- **AND** the service SHALL NOT consult the JSONL replay path for that row

#### Scenario: Recovery is best-effort, not load-bearing for binding correctness

- **GIVEN** the events JSONL is corrupt, missing, or unreadable
- **WHEN** the service attempts recovery
- **THEN** the service SHALL log a warning and treat the row as unrecoverable
- **AND** the service SHALL return `{ kind: 'unresumable', reason: 'no-session-id-captured', ... }` with diagnostics noting the recovery attempt failed
- **AND** the service SHALL NOT throw or otherwise fail the request

---

### Requirement: Vendor-Agnostic Session Capture Contract

The `SessionCaptureService` and the underlying agent vendor adapters SHALL maintain a vendor-agnostic capture contract: every supported vendor adapter SHALL emit `session_id` events through the normalized event stream; the service SHALL persist them through one code path; vendor-specific resume command construction SHALL be encapsulated in adapter-owned helpers.

#### Scenario: Both vendors emit session_id events

- **GIVEN** an AI process spawned via the Claude Code adapter OR the OpenCode adapter
- **WHEN** the vendor's stdout includes a session id (Claude's top-level `session_id`, OpenCode's top-level `sessionID`)
- **THEN** the adapter SHALL emit a `NormalizedEvent` of `{ type: 'session_id', id: <string> }`
- **AND** the service SHALL persist it through the same `recordSessionId()` call regardless of vendor

#### Scenario: Vendor-native resume commands are adapter-owned

- **GIVEN** the service needs to construct the vendor-native resume command for a captured session id
- **WHEN** building the resume context
- **THEN** the service SHALL delegate to a vendor adapter helper (e.g. `buildVendorResumeCommand(vendor, sessionId)`)
- **AND** the service SHALL NOT contain `if vendor === 'claude'` style switches

#### Scenario: New vendors integrate without service-level changes

- **GIVEN** a new agent vendor (e.g. `gemini-cli`) is added with a conformant adapter that emits `session_id` events through the normalized stream
- **WHEN** a workflow runs against the new vendor
- **THEN** the service SHALL capture and persist its session id without modification
- **AND** the resume context SHALL be constructed from the new vendor's adapter-owned command builder
