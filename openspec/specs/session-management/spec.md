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

