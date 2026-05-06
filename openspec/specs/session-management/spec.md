# session-management Specification

## Purpose
Session management governs the lifecycle and storage of all OCR review and map artifacts, from session creation through multi-round reviews and map runs, ensuring consistent directory structure, state tracking, and historical access.
## Requirements
### Requirement: Session Directory Structure

The system SHALL store all review artifacts in a structured session directory with round-based organization.

#### Scenario: Session creation
- **GIVEN** a new review is initiated
- **WHEN** the session begins
- **THEN** the system SHALL create directory `.ocr/sessions/{YYYY-MM-DD}-{branch}/`

#### Scenario: Session ID format
- **GIVEN** a review runs on branch `feat/auth-flow`
- **WHEN** session ID is generated
- **THEN** the ID SHALL be `{YYYY-MM-DD}-feat-auth-flow` (slashes replaced with dashes)

#### Scenario: Session contents with rounds
- **GIVEN** a session directory is created
- **WHEN** review completes
- **THEN** the directory SHALL contain:
  - `state.json` - Session state for progress tracking (REQUIRED)
  - `discovered-standards.md` - Merged project context (shared across rounds)
  - `context.md` - Change summary and intent (shared across rounds)
  - `rounds/round-{n}/` - Round-specific artifacts containing:
    - `reviews/` - Individual reviewer outputs
    - `discourse.md` - Discourse results (if not --quick)
    - `final.md` - Synthesized final review

---

### Requirement: Individual Review Storage

The system SHALL store each reviewer's output in the round-specific reviews subdirectory.

#### Scenario: Review file naming
- **GIVEN** security reviewer runs with redundancy=2 in round 1
- **WHEN** reviews are saved
- **THEN** files SHALL be named:
  - `rounds/round-1/reviews/security-1.md`
  - `rounds/round-1/reviews/security-2.md`

#### Scenario: Review file content
- **GIVEN** a reviewer completes their review
- **WHEN** the output is saved
- **THEN** the file SHALL contain:
  - Reviewer name and run number
  - Summary
  - What was explored
  - Findings with severity and location
  - Positives
  - Questions for discourse

---

### Requirement: Session Gitignore

The system SHALL create a .gitignore to exclude session data by default.

#### Scenario: Gitignore creation
- **GIVEN** `.ocr/` directory is created
- **WHEN** first session runs
- **THEN** the system SHALL create `.ocr/.gitignore` containing `sessions/`

#### Scenario: Optional commit
- **GIVEN** user wants to commit review history
- **WHEN** they remove `.ocr/.gitignore` or modify it
- **THEN** session data MAY be committed to version control

---

### Requirement: Session State Tracking

The system SHALL maintain explicit state in SQLite as the primary store, with `state.json` written as a backward-compatible side-effect, for reliable progress tracking with round awareness.

#### Scenario: State stored in SQLite

- **GIVEN** a new review session begins
- **WHEN** the session is initialized via `ocr state init`
- **THEN** the system SHALL insert a row into the `sessions` table in `.ocr/data/ocr.db` with initial state
- **AND** insert a `session_created` event into `orchestration_events`
- **AND** write `state.json` as a backward-compatible side-effect

#### Scenario: State file format (SQLite)

- **GIVEN** a session is in progress
- **WHEN** the `sessions` table row is read
- **THEN** it SHALL contain:
  - `id` - Session identifier
  - `branch` - Branch name
  - `status` - active or closed
  - `workflow_type` - review or map
  - `current_phase` - Current workflow phase
  - `phase_number` - Numeric phase (1-8)
  - `current_round` - Current round number
  - `current_map_run` - Current map run number
  - `started_at` - ISO timestamp of session start
  - `updated_at` - ISO timestamp of last update
  - `session_dir` - Relative path to session directory

#### Scenario: Filesystem-derived state (deprecated)

- **GIVEN** a session directory exists
- **WHEN** state information is needed
- **THEN** the system SHALL read from the `sessions` table in SQLite as the primary source
- **AND** filesystem-derived state (round count from directory enumeration, round completion from `final.md` existence) SHALL be used only as a fallback when no SQLite row exists (legacy migration)

#### Scenario: State updates at phase transitions

- **GIVEN** a review progresses through phases
- **WHEN** transitioning to a new phase
- **THEN** the orchestrating agent SHALL call `ocr state transition` which updates the `sessions` table and inserts an `orchestration_events` row BEFORE starting work on the phase
- **AND** `state.json` SHALL be written as a backward-compatible side-effect

#### Scenario: Phase completion display

- **GIVEN** the CLI displays progress
- **WHEN** determining phase completion checkmarks
- **THEN** the CLI SHALL derive completion from the `phase_number` column in the `sessions` table (phases < current are complete)

#### Scenario: CLI progress tracking

- **GIVEN** a session exists in SQLite
- **WHEN** `ocr progress` CLI is invoked
- **THEN** the CLI SHALL read from the `sessions` table for accurate progress display including current round
- **AND** fall back to `state.json` if no SQLite row exists

#### Scenario: Missing state handling

- **GIVEN** no SQLite row exists and `state.json` is missing or corrupt in a session
- **WHEN** `ocr progress` CLI is invoked
- **THEN** the CLI SHALL display "Waiting for session..." until valid state is created

#### Scenario: Cross-mode compatibility

- **GIVEN** OCR runs as a Claude Code plugin
- **WHEN** sessions are stored in `.ocr/sessions/` and state is written via `ocr state` commands
- **THEN** the standalone CLI SHALL find and track session progress identically via SQLite

---

### Requirement: Session History

The system SHALL maintain accessible history of review sessions.

#### Scenario: List sessions
- **GIVEN** multiple sessions exist in `.ocr/sessions/`
- **WHEN** `/ocr:history` is invoked
- **THEN** the system SHALL list sessions sorted by date (newest first)

#### Scenario: Session metadata
- **GIVEN** a session directory exists
- **WHEN** listing sessions
- **THEN** the system SHALL extract metadata from `state.json`:
  - Session ID and branch
  - Current phase and status
  - Start time and last update

---

### Requirement: Session Retrieval

The system SHALL support retrieving and displaying past sessions from the current round.

#### Scenario: View final review
- **GIVEN** user invokes `/ocr:show {session-id}`
- **WHEN** session exists
- **THEN** the system SHALL display contents of `rounds/round-{current_round}/final.md`

#### Scenario: View with discourse
- **GIVEN** user invokes `/ocr:show {session-id} --discourse`
- **WHEN** session has discourse.md in current round
- **THEN** the system SHALL include discourse details from `rounds/round-{current_round}/discourse.md`

#### Scenario: View individual reviews
- **GIVEN** user invokes `/ocr:show {session-id} --reviews`
- **WHEN** session has reviews in current round
- **THEN** the system SHALL include all individual reviewer outputs from `rounds/round-{current_round}/reviews/`

---

### Requirement: Context Preservation

The system SHALL preserve change context for historical reference.

#### Scenario: Save change context
- **GIVEN** review workflow gathers change information
- **WHEN** context is collected
- **THEN** the system SHALL save to `context.md`:
  - Target (staged, commit range, or PR)
  - Branch name
  - Commit information
  - Diff summary

#### Scenario: Preserve discovered standards
- **GIVEN** context discovery finds project files
- **WHEN** context is merged
- **THEN** the system SHALL save merged content to `discovered-standards.md` with source attribution

---

### Requirement: Session Uniqueness

The system SHALL handle multiple reviews on the same day and branch using review rounds.

#### Scenario: Same-day re-review
- **GIVEN** a session `2025-01-26-main` already exists with `rounds/round-1/` complete
- **WHEN** another review runs on main branch on 2025-01-26
- **THEN** the system SHALL:
  - Create `rounds/round-2/` directory in the existing session
  - Update `current_round` to 2 in `state.json`
  - Preserve all `round-1/` artifacts unchanged

#### Scenario: Round history preservation
- **GIVEN** multiple review rounds have been completed
- **WHEN** a new round starts
- **THEN** previous round artifacts SHALL remain unchanged and accessible

---

### Requirement: Round-Specific Artifacts

The system SHALL store discourse and synthesis outputs inside round directories, not at session root.

#### Scenario: Discourse output location
- **GIVEN** discourse phase completes for round 2
- **WHEN** discourse results are saved
- **THEN** the file SHALL be saved to `rounds/round-2/discourse.md`

#### Scenario: Final review output location
- **GIVEN** synthesis phase completes for round 2
- **WHEN** final review is saved
- **THEN** the file SHALL be saved to `rounds/round-2/final.md`

#### Scenario: Round metadata output location
- **GIVEN** the synthesis phase completes for round 1
- **WHEN** the orchestrator pipes structured data to `ocr state round-complete --stdin`
- **THEN** the CLI SHALL write `rounds/round-1/round-meta.json` with validated structured review data

#### Scenario: Shared context remains at root
- **GIVEN** a multi-round session exists
- **WHEN** context is examined
- **THEN** `discovered-standards.md`, `requirements.md`, and `context.md` SHALL remain at session root (shared across all rounds)

### Requirement: State Reconciliation

The system SHALL use SQLite as the authoritative source of truth for session state, with filesystem serving as the artifact delivery mechanism only.

#### Scenario: SQLite is authoritative

- **GIVEN** a session exists in both SQLite and on the filesystem
- **WHEN** any consumer needs session state (phase, status, round)
- **THEN** the system SHALL read from SQLite
- **AND** filesystem artifacts are parsed into SQLite by FilesystemSync but do NOT override orchestration state

#### Scenario: Missing SQLite row (legacy session)

- **GIVEN** a session directory exists on filesystem without a corresponding SQLite row
- **WHEN** `ocr state sync` or FilesystemSync runs
- **THEN** the system SHALL backfill a `sessions` row from `state.json` if present
- **AND** if `state.json` is also missing, the system SHALL create a minimal row with status derived from filesystem artifacts

#### Scenario: State.json disagrees with SQLite

- **GIVEN** `state.json` has different phase or round data than the `sessions` table
- **WHEN** any consumer reads state
- **THEN** the system SHALL trust SQLite as authoritative
- **AND** `state.json` is NOT read by any first-party consumer in the new architecture (except as legacy fallback)

#### Scenario: Corrupt state.json

- **GIVEN** `state.json` contains invalid JSON but SQLite has valid state
- **WHEN** CLI or dashboard reads the session
- **THEN** the system SHALL use SQLite state without error
- **AND** `state.json` corruption does not affect the session

#### Scenario: User creates empty round directory

- **GIVEN** user manually creates `rounds/round-2/` with no contents
- **WHEN** FilesystemSync runs
- **THEN** a `review_rounds` row is created in SQLite for the empty round
- **AND** orchestration state in `sessions` table is NOT modified (only `ocr state` commands modify orchestration state)

---

### Requirement: Human Review Draft Storage

The system SHALL store AI-generated human-voice review drafts alongside the review round artifacts.

#### Scenario: Draft file location

- **GIVEN** a human review is generated for round 2
- **WHEN** the user saves the draft
- **THEN** it is stored as `rounds/round-2/final-human.md`

#### Scenario: Draft artifact parsing

- **GIVEN** `final-human.md` exists in a round directory
- **WHEN** FilesystemSync processes it
- **THEN** it is stored as a `final-human` artifact type in the `markdown_artifacts` table

#### Scenario: Draft preservation

- **GIVEN** a human review draft exists
- **WHEN** subsequent reviews or syncs run
- **THEN** the draft file is preserved unchanged

### Requirement: Map Artifact Storage

The system SHALL store review map artifacts in a dedicated subdirectory within the session directory, organized by runs.

#### Scenario: Map directory structure
- **GIVEN** a review map is initiated
- **WHEN** the map workflow begins
- **THEN** the system SHALL create `.ocr/sessions/{id}/map/runs/run-{n}/` directory

#### Scenario: Map run contents
- **GIVEN** a review map workflow completes
- **WHEN** artifacts are saved
- **THEN** the `map/runs/run-{n}/` directory SHALL contain:
  - `map-meta.json` — Structured map data (written by CLI via `ocr state map-complete --stdin`)
  - `map.md` — Final rendered review map (presentation artifact, written by orchestrator)

#### Scenario: Map coexistence with reviews
- **GIVEN** a session has both map and review artifacts
- **WHEN** artifacts are stored
- **THEN** they SHALL coexist independently:
  - `map/runs/` for review map runs
  - `rounds/` for code review rounds
  - Shared: `discovered-standards.md`, `context.md`, `requirements.md`

#### Scenario: Multiple map runs
- **GIVEN** a map already exists at `map/runs/run-1/`
- **WHEN** user runs `/ocr:map` again on the same session
- **THEN** the system SHALL:
  - Create `map/runs/run-2/` directory
  - Update `current_map_run` to 2 in SQLite
  - Preserve all `run-1/` artifacts unchanged

#### Scenario: Map run history preservation
- **GIVEN** multiple map runs have been completed
- **WHEN** a new run starts
- **THEN** previous run artifacts SHALL remain unchanged and accessible

---

### Requirement: Map State Tracking

The system SHALL track map generation state in `state.json` using dedicated phase values.

#### Scenario: Map phase values
- **GIVEN** a map workflow is in progress
- **WHEN** `state.json` is updated
- **THEN** `current_phase` SHALL use map-specific values:
  - `map-context` — Context discovery for map
  - `topology` — Topology analysis phase
  - `flow-analysis` — Flow tracing phase
  - `requirements-mapping` — Requirements mapping phase
  - `synthesis` — Map synthesis phase
  - `complete` — Map generation complete

#### Scenario: Map and review state independence
- **GIVEN** a session has both map and review workflows
- **WHEN** tracking state
- **THEN** the system SHALL support:
  - Running map and review independently
  - Different completion states for map vs review
  - Clear indication of which workflow is active
  - Separate tracking: `current_round` for reviews, `current_map_run` for maps

#### Scenario: Map run tracking in state.json
- **GIVEN** map workflow is in progress
- **WHEN** `state.json` is updated
- **THEN** it SHALL include:
  - `current_map_run` — Current map run number (integer)
  - `map_phase` — Current map workflow phase (string)

---

### Requirement: Map Session Retrieval

The system SHALL support retrieving and displaying past map sessions.

#### Scenario: View current map via show command
- **GIVEN** user invokes `/ocr:show {session-id} --map`
- **WHEN** session has map runs
- **THEN** the system SHALL display contents of `map/runs/run-{current_map_run}/map.md`

#### Scenario: View specific map run
- **GIVEN** user invokes `/ocr:show {session-id} --map --run 1`
- **WHEN** the specified run exists
- **THEN** the system SHALL display contents of `map/runs/run-1/map.md`

#### Scenario: Map in history listing
- **GIVEN** user invokes `/ocr:history`
- **WHEN** sessions are listed
- **THEN** sessions with maps SHALL indicate:
  - Map availability
  - Number of map runs completed

### Requirement: Agent-Session Heartbeat Liveness

The system SHALL determine the liveness of an agent-CLI process by the freshness of its heartbeat, recorded against its `agent_sessions` row, with no reliance on direct process inspection or stdout snooping.

#### Scenario: Heartbeat threshold default

- **GIVEN** the user has not configured `runtime.agent_heartbeat_seconds` in `.ocr/config.yaml`
- **WHEN** the system evaluates an `agent_sessions` row's liveness
- **THEN** the threshold SHALL default to 60 seconds

#### Scenario: Heartbeat threshold is configurable

- **GIVEN** the user sets `runtime.agent_heartbeat_seconds: 120` in `.ocr/config.yaml`
- **WHEN** the system evaluates liveness
- **THEN** the threshold SHALL be 120 seconds

#### Scenario: Live session is one with a fresh heartbeat

- **GIVEN** an `agent_sessions` row has `status = 'running'` and `last_heartbeat_at` within the threshold
- **WHEN** liveness is evaluated
- **THEN** the row SHALL be considered live
- **AND** the dashboard SHALL display the parent workflow as Running

#### Scenario: Stale session is detectable before sweep

- **GIVEN** an `agent_sessions` row has `status = 'running'` and `last_heartbeat_at` older than the threshold
- **WHEN** liveness is evaluated *before* the next sweep runs
- **THEN** the row SHALL be classified as Stalled in the dashboard
- **AND** the workflow SHALL surface a "Continue" or "Mark abandoned" affordance

---

### Requirement: Liveness Sweep Trigger Points

The system SHALL run the agent-session liveness sweep at exactly two trigger points and SHALL NOT rely on a background timer.

#### Scenario: Sweep runs on dashboard startup

- **GIVEN** the dashboard process is starting
- **WHEN** initialization reaches the database-readiness step
- **THEN** the system SHALL execute the sweep before accepting client connections

#### Scenario: Sweep runs on agent-session creation

- **GIVEN** the AI invokes `ocr session start-instance` to journal a new agent process
- **WHEN** the new row is inserted
- **THEN** the system SHALL also run the sweep within the same transaction or immediately afterward
- **AND** any prior stale `running` rows for the same workflow SHALL be reclassified

#### Scenario: No background timer

- **GIVEN** the dashboard has been running for an extended period with no new agent sessions
- **WHEN** stale rows accumulate
- **THEN** the system SHALL NOT execute a recurring background sweep
- **AND** stale rows SHALL be reconciled on the next dashboard restart or new agent-session creation

---

### Requirement: Orphan Reclassification

The system SHALL reclassify stale `agent_sessions` rows to `orphaned` rather than leaving them in `running`, providing an unambiguous terminal state and a sweep-time record of the reclassification.

#### Scenario: Stale row transitions to orphaned

- **GIVEN** an `agent_sessions` row has `status = 'running'` and `last_heartbeat_at` older than the threshold
- **WHEN** the sweep executes
- **THEN** the row SHALL transition to `status = 'orphaned'`
- **AND** `ended_at` SHALL be set to the sweep timestamp
- **AND** `notes` SHALL include `"orphaned by liveness sweep at <timestamp>"`

#### Scenario: Already-terminal rows are untouched

- **GIVEN** an `agent_sessions` row has `status` in the set `{ done, crashed, cancelled, orphaned }`
- **WHEN** the sweep executes
- **THEN** the row SHALL be untouched

---

### Requirement: Workflow Liveness Derivation

The system SHALL derive the perceived liveness of a workflow `sessions` row from the freshest heartbeat among its child `agent_sessions`, rather than from the workflow row's own `status` field alone.

#### Scenario: Workflow has at least one live agent session

- **GIVEN** a workflow `sessions` row with `status = 'active'` and at least one child `agent_sessions` row in `status = 'running'` with a fresh heartbeat
- **WHEN** the dashboard renders the session
- **THEN** the workflow SHALL be displayed as Running

#### Scenario: Workflow has only stale or terminal agent sessions

- **GIVEN** a workflow `sessions` row with `status = 'active'` and all child `agent_sessions` rows are stale or terminal
- **WHEN** the dashboard renders the session
- **THEN** the workflow SHALL be displayed as Stalled or Orphaned (matching the most recent agent session's classification)
- **AND** affordances for Continue / Mark abandoned SHALL be available

#### Scenario: Workflow has no agent_sessions yet

- **GIVEN** a workflow `sessions` row exists but no `agent_sessions` rows have been created yet
- **WHEN** the dashboard renders the session
- **THEN** the workflow SHALL be displayed using its existing `sessions.status` field, unchanged from current behavior

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

