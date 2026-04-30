# dashboard Spec Delta

## ADDED Requirements

### Requirement: Session Liveness Header

The dashboard SHALL display a liveness header on the session detail page (`/sessions/:id`) that classifies the session as Running, Stalled, or Orphaned based on the freshness of its child `agent_sessions` heartbeats.

#### Scenario: Running session

- **GIVEN** a workflow has at least one `agent_sessions` row in `status = 'running'` with `last_heartbeat_at` within the threshold
- **WHEN** the user opens the session detail page
- **THEN** the liveness header SHALL display "Running" with a fresh activity timestamp

#### Scenario: Stalled session pending sweep

- **GIVEN** a workflow has a `running` agent session with a stale heartbeat that has not yet been swept
- **WHEN** the user opens the session detail page
- **THEN** the liveness header SHALL display "Stalled" with the elapsed time since last activity
- **AND** SHALL surface "Continue here" and "Mark abandoned" affordances

#### Scenario: Orphaned session post sweep

- **GIVEN** a workflow has a stale agent session that has been reclassified to `orphaned`
- **WHEN** the user opens the session detail page
- **THEN** the liveness header SHALL display "Orphaned" with the elapsed time since last activity
- **AND** SHALL surface "View final state" and "Start new review on this branch" affordances

#### Scenario: Real-time push of liveness changes

- **GIVEN** the dashboard is open on a session
- **WHEN** an `agent_sessions` row transitions status (e.g. running → orphaned)
- **THEN** the server SHALL emit an `agent_session:updated` Socket.IO event (debounced 200ms)
- **AND** the liveness header SHALL update without a page refresh

---

### Requirement: In-Dashboard "Continue Here" Resume

The dashboard SHALL provide a one-click "Continue here" affordance on the session detail page for stalled, orphaned, or completed-but-resumable workflows, that re-spawns the host AI CLI via OCR's resume primitive.

#### Scenario: Continue resumes via captured vendor session id

- **GIVEN** a workflow has at least one `agent_sessions` row with `vendor_session_id` populated
- **WHEN** the user clicks "Continue here"
- **THEN** the server SHALL invoke `ocr review --resume <workflow-session-id>` via the existing socket command runner
- **AND** the host CLI SHALL be spawned with its vendor-native resume flag and the captured `vendor_session_id`
- **AND** the vendor session id SHALL NOT be displayed in the UI

#### Scenario: Continue is unavailable when no vendor id is captured

- **GIVEN** a workflow has no `agent_sessions` row with `vendor_session_id` populated
- **WHEN** the user views the session detail page
- **THEN** the "Continue here" affordance SHALL be disabled with a tooltip explaining that no resume token was captured
- **AND** the user SHALL be directed to "Pick up in terminal" or to start a fresh review

---

### Requirement: "Pick Up in Terminal" Handoff Panel

The dashboard SHALL provide a "Pick up in terminal" panel that surfaces copyable shell commands for resuming a session in the user's local terminal, in either an OCR-mediated mode or a vendor-native bypass mode.

#### Scenario: Panel shows OCR-mediated commands by default

- **GIVEN** a session with a captured `vendor_session_id`
- **WHEN** the user opens the handoff panel
- **THEN** the panel SHALL show two copyable commands:
  1. `cd <project-dir>`
  2. `ocr review --resume <workflow-session-id>`
- **AND** the OCR-mediated mode SHALL be selected by default

#### Scenario: Vendor-native bypass mode is available

- **GIVEN** the handoff panel is open
- **WHEN** the user toggles to "Resume directly in <CLI>"
- **THEN** the second command SHALL change to the host CLI's native resume invocation, parameterized by the raw `vendor_session_id`
- **AND** a clear warning SHALL state that this bypasses OCR and the review state will not advance

#### Scenario: Project directory and vendor are surfaced for context

- **GIVEN** the handoff panel is open
- **WHEN** the user views its header
- **THEN** the panel SHALL display the AI CLI used (e.g. "Claude Code") and the project directory (e.g. `~/work/my-app`)

#### Scenario: PATH detection for the host CLI

- **GIVEN** the dashboard server can probe the local environment for the host CLI binary
- **WHEN** the panel is opened
- **THEN** the server SHALL report whether the host CLI binary is on PATH
- **AND** when it is not, the panel SHALL display an inline note suggesting installation or "Continue here" as an alternative

#### Scenario: Edge case — no vendor id captured

- **GIVEN** a workflow that crashed before any `vendor_session_id` was captured
- **WHEN** the user opens the handoff panel
- **THEN** the panel SHALL show only the `cd` step and a "start fresh" command (e.g. `ocr review --branch <branch>`) with explanation
- **AND** the vendor-native mode SHALL be unavailable

#### Scenario: Server-built command strings

- **GIVEN** the panel is rendering its commands
- **WHEN** the client requests the handoff payload
- **THEN** the dashboard server SHALL return fully-built command strings via `GET /api/sessions/:id/handoff`
- **AND** the client SHALL NOT reconstruct command strings locally

#### Scenario: Multiple entry points

- **GIVEN** a session is selectable from multiple places in the dashboard
- **WHEN** the user invokes "Pick up in terminal" from any of: the session detail page, the sessions list kebab menu, or the phase progress page
- **THEN** the same handoff panel SHALL open scoped to that session

---

### Requirement: Team Composition Panel

The dashboard SHALL provide a Team Composition Panel in the New Review flow that lets the user compose a per-run team — count, persona selection, and per-instance models — without editing YAML.

#### Scenario: Panel reads the resolved team

- **GIVEN** the user opens "New Review" from the Command Center
- **WHEN** the Team Composition Panel mounts
- **THEN** it SHALL request `GET /api/team/resolved` and populate persona rows from the result
- **AND** it SHALL request the active adapter's `listModels()` to populate model dropdowns

#### Scenario: Same-model and per-reviewer modes per persona row

- **GIVEN** a persona row with count > 1
- **WHEN** the user toggles between "Same model" and "Per reviewer" mode
- **THEN** in "Same model" mode, one model dropdown SHALL apply to all instances of that persona
- **AND** in "Per reviewer" mode, each instance row SHALL display its own model dropdown

#### Scenario: Adding and removing reviewers

- **GIVEN** the panel is open
- **WHEN** the user adds a reviewer not currently in the team
- **THEN** a new row SHALL appear with count 1 and `(default)` model selected
- **AND** the user SHALL be able to remove rows by setting count to 0 or via an explicit remove control

#### Scenario: Save as default checkbox is opt-in

- **GIVEN** the user has customized the team for this run
- **WHEN** the user clicks Run with the "Save as default for this workspace" checkbox unchecked
- **THEN** the override SHALL be passed to `ocr review` as a session-only `--team` argument
- **AND** `.ocr/config.yaml` SHALL NOT be modified

#### Scenario: Save as default persists to config

- **GIVEN** the user has customized the team for this run
- **WHEN** the user clicks Run with the "Save as default for this workspace" checkbox checked
- **THEN** the dashboard SHALL invoke `ocr team set --stdin` with the new team
- **AND** SHALL then invoke `ocr review` without a session override

#### Scenario: Empty model list degrades to free-text input

- **GIVEN** the active adapter's `listModels()` returns an empty list
- **WHEN** the panel is rendered
- **THEN** model dropdowns SHALL be replaced by free-text inputs
- **AND** a tooltip SHALL explain that any model id accepted by the underlying CLI is valid

#### Scenario: Host without per-task model support disables per-reviewer mode

- **GIVEN** the active adapter reports `supportsPerTaskModel = false`
- **WHEN** the panel is rendered
- **THEN** the "Per reviewer" mode toggle SHALL be disabled with an explanatory tooltip
- **AND** all reviewers in a run SHALL be expected to share the same parent model

---

### Requirement: Reviewers Page "In Default Team" Badge

The reviewers page SHALL display, on each reviewer card, a small badge indicating whether and at what count the reviewer is in `default_team`.

#### Scenario: Badge displayed for in-team reviewers

- **GIVEN** the resolved team contains two `principal` instances
- **WHEN** the user opens the reviewers page
- **THEN** the `principal` reviewer card SHALL show a badge such as "In default team ×2"

#### Scenario: Badge absent for out-of-team reviewers

- **GIVEN** a reviewer is not present in `default_team`
- **WHEN** the user opens the reviewers page
- **THEN** that reviewer's card SHALL NOT show the badge

#### Scenario: Badge click opens team panel preset to the persona

- **GIVEN** a reviewer card displays the in-team badge
- **WHEN** the user clicks the badge
- **THEN** the Team Composition Panel SHALL open with that persona's row pre-focused

---

### Requirement: New Server Routes

The dashboard server SHALL expose new HTTP routes that back the team panel, agent-session liveness, "Continue here", and "Pick up in terminal" features.

#### Scenario: Team resolution endpoint

- **GIVEN** the dashboard team panel is loading
- **WHEN** the client calls `GET /api/team/resolved`
- **THEN** the server SHALL invoke `ocr team resolve --json` and return the resulting `ReviewerInstance[]`

#### Scenario: Team default persistence endpoint

- **GIVEN** the user has chosen "Save as default" with a customized team
- **WHEN** the client calls `POST /api/team/default` with `{ team: ReviewerInstance[] }`
- **THEN** the server SHALL invoke `ocr team set --stdin` with the supplied team and return success or a validation error

#### Scenario: Agent-session listing endpoint

- **GIVEN** the dashboard liveness header is loading for a session
- **WHEN** the client calls `GET /api/agent-sessions?workflow=<id>`
- **THEN** the server SHALL return the agent-session rows for that workflow

#### Scenario: In-dashboard continue endpoint

- **GIVEN** the user clicks "Continue here"
- **WHEN** the client calls `POST /api/sessions/:id/continue`
- **THEN** the server SHALL invoke `ocr review --resume <id>` via the existing command runner and emit live progress over Socket.IO

#### Scenario: Terminal handoff endpoint

- **GIVEN** the user opens the handoff panel for a session
- **WHEN** the client calls `GET /api/sessions/:id/handoff`
- **THEN** the server SHALL return a payload `{ vendor, vendorSessionId, projectDir, hostBinaryAvailable, ocrCommand, vendorCommand }`
- **AND** the two command strings SHALL be fully built server-side
