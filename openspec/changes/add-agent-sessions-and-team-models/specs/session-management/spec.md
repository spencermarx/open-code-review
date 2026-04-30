# session-management Spec Delta

## ADDED Requirements

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
