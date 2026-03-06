## MODIFIED Requirements

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
