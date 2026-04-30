# review-orchestration Spec Delta

## ADDED Requirements

### Requirement: Phase 4 Reads the Resolved Team via OCR

The Tech Lead SHALL read the resolved team composition by calling `ocr team resolve --json` at the start of Phase 4, rather than parsing `default_team` from `.ocr/config.yaml` directly.

#### Scenario: Tech Lead reads team via OCR

- **GIVEN** a review enters Phase 4
- **WHEN** the Tech Lead determines which reviewers to spawn
- **THEN** the Tech Lead SHALL invoke `ocr team resolve --json`
- **AND** the returned array SHALL be the source of truth for personas, instance counts, instance names, and per-instance model assignments

#### Scenario: Session-time override is respected

- **GIVEN** the user invokes a review with a session-level team override (via dashboard panel or `--team` CLI flag)
- **WHEN** the Tech Lead calls `ocr team resolve --json --session-override <override>`
- **THEN** the resolved composition SHALL reflect the override
- **AND** the override SHALL NOT be persisted to `.ocr/config.yaml`

---

### Requirement: Per-Instance Model Selection Honored on Capable Hosts

When the host AI CLI supports per-task model override (e.g. Claude Code subagent model frontmatter), Phase 4 SHALL pass each reviewer instance's `resolved_model` to the host's per-task primitive.

#### Scenario: Capable host honors per-instance models

- **GIVEN** a host CLI whose adapter reports `supportsPerTaskModel = true`
- **AND** a resolved team with two `principal` instances on different models
- **WHEN** Phase 4 spawns the reviewers
- **THEN** each instance SHALL be spawned with its assigned model
- **AND** each `agent_sessions` row SHALL record the actual `resolved_model` used

#### Scenario: Incapable host runs uniform parent model with warning

- **GIVEN** a host CLI whose adapter reports `supportsPerTaskModel = false`
- **AND** a resolved team that specifies different models per instance
- **WHEN** Phase 4 spawns the reviewers
- **THEN** all instances SHALL run on the parent process's model
- **AND** each `agent_sessions` row SHALL set `notes` to a structured warning indicating per-task model override is not supported on this host
- **AND** the warning SHALL be surfaced to the user in the final review output

---

### Requirement: Phase 4 Journals Each Instance via OCR

For every reviewer instance spawned in Phase 4, the Tech Lead SHALL record its lifecycle through the `ocr session` subcommand family.

#### Scenario: Instance start is journaled

- **GIVEN** a reviewer instance is about to be spawned
- **WHEN** the Tech Lead initiates the spawn
- **THEN** it SHALL first invoke `ocr session start-instance` with the workflow id, persona, instance index, name, vendor, and resolved model
- **AND** SHALL receive an `agent_sessions` id in return

#### Scenario: Vendor session id is bound when emitted

- **GIVEN** a spawned reviewer sub-agent emits its underlying CLI session id
- **WHEN** the Tech Lead observes the id
- **THEN** it SHALL invoke `ocr session bind-vendor-id <agent-id> <vendor-id>` exactly once

#### Scenario: Heartbeat is bumped between phases

- **GIVEN** a long-running reviewer instance is mid-review
- **WHEN** the Tech Lead progresses to a new sub-step or returns from a long tool call
- **THEN** it SHALL invoke `ocr session beat <agent-id>` to refresh `last_heartbeat_at`

#### Scenario: Instance end is journaled

- **GIVEN** a reviewer instance has completed (success, crash, or cancellation)
- **WHEN** the Tech Lead observes completion
- **THEN** it SHALL invoke `ocr session end-instance <agent-id>` with an appropriate exit code and optional note

---

### Requirement: OCR Does Not Own Phase 4 Process Spawning

The system SHALL NOT introduce a Phase 4 process orchestrator that spawns reviewer sub-agents from within OCR's own command-runner; sub-agent spawning remains the responsibility of the host AI CLI.

#### Scenario: command-runner does not fork per-reviewer adapters

- **GIVEN** a review enters Phase 4
- **WHEN** the dashboard's `command-runner.ts` orchestrates the review
- **THEN** it SHALL NOT fork one adapter process per reviewer instance
- **AND** the host AI CLI SHALL spawn sub-agents using its own per-task primitive
