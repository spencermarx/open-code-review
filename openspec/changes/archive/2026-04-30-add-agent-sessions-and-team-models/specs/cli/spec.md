# cli Spec Delta

## ADDED Requirements

### Requirement: `ocr team` Subcommand

The CLI SHALL provide an `ocr team` subcommand for resolving and persisting team composition, used by the AI workflow and the dashboard.

#### Scenario: Resolve produces canonical reviewer instances

- **GIVEN** a workspace with `default_team` defined in `.ocr/config.yaml`
- **WHEN** user runs `ocr team resolve --json`
- **THEN** the output SHALL be a JSON array of `ReviewerInstance` objects with fields `persona`, `instance_index`, `name`, `model`
- **AND** the array SHALL reflect alias expansion and the model resolution chain

#### Scenario: Session override is applied without persisting

- **GIVEN** a workspace with `default_team: { principal: 2 }`
- **WHEN** user runs `ocr team resolve --session-override "principal=[claude-opus-4-7,claude-sonnet-4-6]" --json`
- **THEN** the resolved composition SHALL contain two `principal` instances with the overridden models
- **AND** `.ocr/config.yaml` SHALL NOT be modified

#### Scenario: Set persists a new team to config

- **GIVEN** a workspace and a JSON array of `ReviewerInstance` objects on stdin
- **WHEN** user runs `ocr team set --stdin`
- **THEN** the system SHALL validate the input, normalize it, and write it back to `.ocr/config.yaml > default_team`
- **AND** SHALL preserve user comments where the YAML library permits

---

### Requirement: `ocr models` Subcommand

The CLI SHALL provide an `ocr models list` subcommand that surfaces the active adapter's known model identifiers, populated through the adapter's `listModels()` method.

#### Scenario: List with native enumeration

- **GIVEN** the active adapter's underlying CLI exposes a model-listing command (e.g. `opencode models --json`)
- **WHEN** user runs `ocr models list`
- **THEN** the output SHALL include the vendor-native model identifiers returned by the underlying CLI

#### Scenario: List with bundled fallback

- **GIVEN** the active adapter's underlying CLI does not expose a model-listing command
- **WHEN** user runs `ocr models list`
- **THEN** the output SHALL include the adapter's bundled known-good list
- **AND** the output SHALL include a note marking the list as best-effort and possibly stale

#### Scenario: JSON output for programmatic consumption

- **GIVEN** the dashboard or workflow needs the model list
- **WHEN** `ocr models list --json` is invoked
- **THEN** the output SHALL be a JSON array of `{ id, displayName?, provider?, tags? }` records

---

### Requirement: `ocr session` Subcommand Family

The CLI SHALL provide an `ocr session` subcommand family used by the AI to journal agent-CLI processes it spawns. None of these subcommands SHALL spawn, fork, or watch processes themselves.

#### Scenario: Start an agent session

- **GIVEN** the AI is about to spawn a reviewer sub-agent
- **WHEN** the AI runs `ocr session start-instance --workflow <id> --persona principal --instance 1 --name principal-1 --vendor claude --model claude-opus-4-7`
- **THEN** the system SHALL insert a row in `agent_sessions` with `status = 'running'`, `started_at = now`, and `last_heartbeat_at = now`
- **AND** SHALL print the new agent-session UUID on stdout

#### Scenario: Bind a vendor session id

- **GIVEN** an agent session has been started and the underlying CLI has emitted its session id
- **WHEN** the AI runs `ocr session bind-vendor-id <agent-id> <vendor-id>`
- **THEN** the row's `vendor_session_id` SHALL be set
- **AND** subsequent attempts to bind a different value SHALL be rejected

#### Scenario: Bump a heartbeat

- **GIVEN** an agent session is `running`
- **WHEN** the AI runs `ocr session beat <agent-id>`
- **THEN** the row's `last_heartbeat_at` SHALL be set to the current time

#### Scenario: End an agent session

- **GIVEN** an agent session is in progress
- **WHEN** the AI runs `ocr session end-instance <agent-id> --exit-code 0`
- **THEN** the row SHALL transition to `status = 'done'` (or `crashed`/`cancelled` based on exit-code semantics or explicit `--status`)
- **AND** `ended_at` SHALL be set

#### Scenario: List agent sessions for a workflow

- **GIVEN** a workflow with multiple agent sessions
- **WHEN** user or dashboard runs `ocr session list --workflow <id> --json`
- **THEN** the output SHALL be a JSON array of `agent_sessions` rows for that workflow

#### Scenario: Subcommands do not own processes

- **GIVEN** any of `ocr session start-instance`, `bind-vendor-id`, `beat`, `end-instance` are invoked
- **WHEN** the command executes
- **THEN** it SHALL only read from and write to the database
- **AND** SHALL NOT spawn, fork, kill, or watch any other process

---

### Requirement: Resume Flag on Existing Review Command

The CLI's `ocr review` command SHALL accept a `--resume <workflow-session-id>` flag that resolves the latest captured `vendor_session_id` for that workflow and dispatches it through the active adapter's resume primitive.

#### Scenario: Resume by workflow id

- **GIVEN** a workflow `sessions` row exists with at least one `agent_sessions` row whose `vendor_session_id` is set
- **WHEN** user runs `ocr review --resume <workflow-session-id>`
- **THEN** the system SHALL look up the most recent agent-session for that workflow with a non-null `vendor_session_id`
- **AND** SHALL spawn the host CLI with its vendor-native resume flag and the captured `vendor_session_id`

#### Scenario: Resume with no captured vendor id falls back

- **GIVEN** a workflow exists but no `vendor_session_id` was ever captured (e.g. the workflow crashed before the first `session_id` event)
- **WHEN** user runs `ocr review --resume <workflow-session-id>`
- **THEN** the system SHALL print a clear message that no resume token is available
- **AND** SHALL exit with a non-zero status without spawning the host CLI
