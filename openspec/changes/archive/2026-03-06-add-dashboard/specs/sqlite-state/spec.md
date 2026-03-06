## ADDED Requirements

### Requirement: SQLite as Single Source of Truth

The system SHALL use a SQLite database at `.ocr/data/ocr.db` as the single source of truth for all OCR state, replacing `state.json` as the primary state medium.

#### Scenario: Database location

- **GIVEN** OCR is initialized in a project
- **WHEN** any consumer needs to read or write state
- **THEN** it SHALL use `.ocr/data/ocr.db`
- **AND** the database file SHALL be gitignored

#### Scenario: Three-layer schema

- **GIVEN** the database is created
- **WHEN** the schema is inspected
- **THEN** it SHALL contain three distinct layers:
  - Workflow state layer (`sessions`, `orchestration_events`) — written by agents via `ocr state` CLI
  - Artifact layer (`review_rounds`, `reviewer_outputs`, `review_findings`, `markdown_artifacts`, `map_runs`, `map_sections`, `map_files`) — written by FilesystemSync
  - User interaction layer (`user_file_progress`, `user_finding_progress`, `user_notes`, `command_executions`, `schema_version`) — written by dashboard

#### Scenario: Shared consumers

- **GIVEN** the database exists
- **WHEN** the CLI (`ocr state`, `ocr progress`), AI agents (via `ocr state`), and dashboard server all access it
- **THEN** all consumers SHALL read from and write to the same `.ocr/data/ocr.db` file
- **AND** WAL mode SHALL be enabled for concurrent read/write safety

---

### Requirement: Database Auto-Creation

The system SHALL auto-create the SQLite database with full schema when any consumer needs it first.

#### Scenario: First ocr state command

- **GIVEN** `.ocr/` exists but `.ocr/data/ocr.db` does not
- **WHEN** user or agent runs `ocr state init`
- **THEN** `.ocr/data/` directory is created, `ocr.db` is created, all migrations run, and the command completes normally

#### Scenario: First ocr dashboard command

- **GIVEN** `.ocr/` exists but `.ocr/data/ocr.db` does not
- **WHEN** user runs `ocr dashboard`
- **THEN** the database is created with full schema before the server starts

#### Scenario: Database already exists

- **GIVEN** `.ocr/data/ocr.db` exists with current schema
- **WHEN** any consumer opens it
- **THEN** no migration runs and the connection opens normally

---

### Requirement: Schema Migrations

The system SHALL use a versioned migration system to manage the SQLite schema.

#### Scenario: Version tracking

- **GIVEN** the database is created
- **WHEN** migrations run
- **THEN** each applied migration is recorded in the `schema_version` table with version number, timestamp, and description

#### Scenario: Sequential migrations

- **GIVEN** the database is at schema version 2
- **WHEN** a new version of OCR introduces schema version 3
- **THEN** only migration 3 runs (not 1 or 2)
- **AND** the `schema_version` table records version 3

#### Scenario: No ORM

- **WHEN** migrations are defined
- **THEN** they SHALL be raw SQL files with no ORM dependency
- **AND** they SHALL be sequential and append-only (existing migrations are never modified)

---

### Requirement: Shared DB Access Layer

The system SHALL provide a shared internal module for typed SQLite access used by both the CLI and the dashboard server.

#### Scenario: CLI usage

- **GIVEN** the CLI runs `ocr state init` or `ocr state transition`
- **WHEN** it needs to read or write to SQLite
- **THEN** it SHALL use the shared DB access module for schema, migrations, and typed queries

#### Scenario: Dashboard server usage

- **GIVEN** the dashboard server starts
- **WHEN** it needs to read or write to SQLite
- **THEN** it SHALL use the same shared DB access module as the CLI

#### Scenario: Schema consistency

- **GIVEN** the shared module defines the schema
- **WHEN** both CLI and dashboard use it
- **THEN** schema drift between the two consumers SHALL be impossible

---

### Requirement: Orchestration Event Log

The system SHALL maintain an append-only event log in the `orchestration_events` table for every state change made via `ocr state` commands.

#### Scenario: Session creation event

- **WHEN** `ocr state init` runs
- **THEN** a row is inserted into `orchestration_events` with `event_type = 'session_created'`

#### Scenario: Phase transition event

- **WHEN** `ocr state transition` runs
- **THEN** a row is inserted with `event_type = 'phase_transition'`, the phase name, and phase number

#### Scenario: Session close event

- **WHEN** `ocr state close` runs
- **THEN** a row is inserted with `event_type = 'session_closed'`

#### Scenario: Immutable log

- **GIVEN** events exist in `orchestration_events`
- **WHEN** any consumer accesses the table
- **THEN** rows SHALL never be updated or deleted
- **AND** new events are always appended

#### Scenario: Timeline reconstruction

- **GIVEN** a session has multiple orchestration events
- **WHEN** the dashboard queries events for a session
- **THEN** a complete timeline of phase transitions, round starts, and status changes can be reconstructed from the event log

---

### Requirement: OCR State Init Command (SQLite)

The `ocr state init` CLI command SHALL write session state to SQLite instead of (or in addition to) `state.json`.

#### Scenario: Create session in SQLite

- **WHEN** agent runs `ocr state init`
- **THEN** a row is inserted into the `sessions` table with initial state (phase=context, status=active)
- **AND** a `session_created` event is inserted into `orchestration_events`
- **AND** the session ID is returned to stdout

#### Scenario: Backward-compatible state.json write

- **WHEN** `ocr state init` completes the SQLite write
- **THEN** it SHALL also write `state.json` as a backward-compatible side-effect

---

### Requirement: OCR State Transition Command (SQLite)

The `ocr state transition` CLI command SHALL update session state in SQLite and log the transition event.

#### Scenario: Phase transition

- **WHEN** agent runs `ocr state transition --phase reviews --phase-number 4`
- **THEN** the `sessions` row is updated with the new phase and phase number
- **AND** a `phase_transition` event is inserted into `orchestration_events`

#### Scenario: Round change

- **WHEN** agent runs a transition that changes the round number
- **THEN** a `round_started` event is also inserted into `orchestration_events`

#### Scenario: Backward-compatible state.json write

- **WHEN** `ocr state transition` completes the SQLite write
- **THEN** it SHALL also write `state.json` as a backward-compatible side-effect

---

### Requirement: OCR State Close Command (SQLite)

The `ocr state close` CLI command SHALL mark a session as closed in SQLite.

#### Scenario: Close session

- **WHEN** agent runs `ocr state close`
- **THEN** the `sessions` row is updated with `status = 'closed'` and `current_phase = 'complete'`
- **AND** a `session_closed` event is inserted into `orchestration_events`

#### Scenario: Backward-compatible state.json write

- **WHEN** `ocr state close` completes the SQLite write
- **THEN** it SHALL also write `state.json` as a backward-compatible side-effect

---

### Requirement: OCR State Show Command (SQLite)

The `ocr state show` CLI command SHALL read session state from SQLite.

#### Scenario: Show session state

- **WHEN** user or agent runs `ocr state show`
- **THEN** the command reads from the `sessions` table and recent `orchestration_events`
- **AND** displays current phase, round, status, and recent events

---

### Requirement: OCR State Sync Command (SQLite)

The `ocr state sync` CLI command SHALL trigger FilesystemSync logic to parse filesystem artifacts into SQLite.

#### Scenario: Manual sync

- **WHEN** user runs `ocr state sync`
- **THEN** the command scans `.ocr/sessions/` and upserts artifact data into SQLite
- **AND** backfills any `sessions` rows that exist on filesystem but not in the DB (legacy migration)

---

### Requirement: Data Durability

All data SHALL survive dashboard restarts, full filesystem re-syncs, CLI upgrades, and concurrent writes.

#### Scenario: Dashboard restart preserves user data

- **GIVEN** user has marked files as reviewed and triaged findings
- **WHEN** the dashboard restarts
- **THEN** all user progress (`user_file_progress`, `user_finding_progress`, `user_notes`) is preserved

#### Scenario: Filesystem re-sync preserves user data

- **WHEN** FilesystemSync runs a full re-import from `.ocr/sessions/`
- **THEN** user interaction tables are never touched
- **AND** artifact tables are upserted without data loss

#### Scenario: Concurrent writes from agents and dashboard

- **GIVEN** an AI agent writes via `ocr state` while the dashboard writes user progress
- **WHEN** both writes occur simultaneously
- **THEN** WAL mode and busy timeout (5s) ensure both writes succeed without corruption

#### Scenario: Foreign key cascade

- **GIVEN** user data references workflow data via foreign keys
- **WHEN** a session is deleted (e.g., manual cleanup)
- **THEN** related user data is cascade-deleted via `ON DELETE CASCADE`

---

### Requirement: SQLite Connection Pragmas

The system SHALL apply specific pragmas on every SQLite connection open.

#### Scenario: WAL mode

- **WHEN** a connection to `ocr.db` is opened
- **THEN** `PRAGMA journal_mode = WAL` SHALL be set for concurrent read/write safety

#### Scenario: Foreign keys

- **WHEN** a connection to `ocr.db` is opened
- **THEN** `PRAGMA foreign_keys = ON` SHALL be set to enforce referential integrity

#### Scenario: Busy timeout

- **WHEN** a connection to `ocr.db` is opened
- **THEN** `PRAGMA busy_timeout = 5000` SHALL be set to wait 5 seconds on lock contention
