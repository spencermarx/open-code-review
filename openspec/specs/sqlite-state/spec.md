# sqlite-state Specification

## Purpose
The SQLite state layer provides a durable, concurrent-safe single source of truth for all OCR data — workflow state, parsed artifacts, and user interactions — shared by the CLI, AI agents, and dashboard server via `.ocr/data/ocr.db`.
## Requirements
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

#### Scenario: Round completed event

- **WHEN** `ocr state round-complete` runs
- **THEN** a row is inserted with `event_type = 'round_completed'`, the round number in the `round` column, and metadata JSON containing derived counts (`blocker_count`, `critical_count`, `major_count`, `suggestion_count`, `nitpick_count`, `reviewer_count`) and `source: "orchestrator"`

#### Scenario: Map completed event

- **WHEN** `ocr state map-complete` runs
- **THEN** a row is inserted with `event_type = 'map_completed'`, the map run number in the `round` column, and metadata JSON containing derived counts (`section_count`, `file_count`) and `source: "orchestrator"`

#### Scenario: Immutable log

- **GIVEN** events exist in `orchestration_events`
- **WHEN** any consumer accesses the table
- **THEN** rows SHALL never be updated or deleted
- **AND** new events are always appended

#### Scenario: Timeline reconstruction

- **GIVEN** a session has multiple orchestration events
- **WHEN** the dashboard queries events for a session
- **THEN** a complete timeline of phase transitions, round starts, round completions, map completions, and status changes can be reconstructed from the event log

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

### Requirement: Source Tracking on Artifact Tables

The `review_rounds` and `map_runs` artifact tables SHALL include a `source` column that tracks how the data was populated, enabling an orchestrator-first data flow.

#### Scenario: Orchestrator source

- **GIVEN** a completion command (`round-complete` or `map-complete`) has been run
- **WHEN** the dashboard processes the corresponding orchestration event
- **THEN** the artifact row's `source` column SHALL be set to `'orchestrator'`
- **AND** subsequent filesystem parser runs SHALL NOT overwrite orchestrator-provided data

#### Scenario: Parser source

- **GIVEN** no completion command has been run for a round or map run
- **WHEN** FilesystemSync parses a markdown artifact
- **THEN** the artifact row's `source` column SHALL be set to `'parser'`

#### Scenario: Source latch

- **GIVEN** a row has `source = 'orchestrator'`
- **WHEN** FilesystemSync encounters the same artifact
- **THEN** it SHALL skip re-parsing structured data (sections, files, findings)
- **AND** it SHALL still store raw markdown content for display purposes

#### Scenario: Map runs section count

- **GIVEN** migration v7 has been applied
- **WHEN** the `map_runs` table is inspected
- **THEN** it SHALL include a `section_count` column (INTEGER, default 0)
- **AND** it SHALL include a `source` column (TEXT, default NULL)

### Requirement: Agent Sessions Table

The system SHALL maintain an `agent_sessions` table in `.ocr/data/ocr.db` that journals every agent-CLI process the AI declares it has started on behalf of a workflow session, providing the durable record needed for liveness, resume, and per-instance model attribution.

#### Scenario: Table exists with required columns

- **GIVEN** the OCR database is initialized
- **WHEN** the `agent_sessions` table is inspected
- **THEN** it SHALL contain at minimum the columns:
  - `id` (TEXT PRIMARY KEY) — OCR-owned UUID
  - `workflow_id` (TEXT NOT NULL, FK to `sessions.id`, ON DELETE RESTRICT)
  - `vendor` (TEXT NOT NULL) — e.g. `claude`, `opencode`, `gemini`
  - `vendor_session_id` (TEXT, nullable) — the underlying CLI's session id, recorded once known
  - `persona` (TEXT, nullable) — e.g. `principal`, `architect`
  - `instance_index` (INTEGER, nullable) — 1-based ordinal within `(workflow_id, persona)`
  - `name` (TEXT, nullable) — `{persona}-{instance_index}` by default; user-overridable
  - `resolved_model` (TEXT, nullable) — exact string passed to `--model` after alias resolution
  - `phase` (TEXT, nullable)
  - `status` (TEXT NOT NULL) — one of `spawning`, `running`, `done`, `crashed`, `cancelled`, `orphaned`
  - `pid` (INTEGER, nullable)
  - `started_at` (TEXT NOT NULL) — ISO 8601
  - `last_heartbeat_at` (TEXT NOT NULL) — ISO 8601
  - `ended_at` (TEXT, nullable) — ISO 8601
  - `exit_code` (INTEGER, nullable)
  - `notes` (TEXT, nullable) — free-form, e.g. structured warnings about host CLI limitations

#### Scenario: Indexes exist for common queries

- **GIVEN** the `agent_sessions` table is created
- **WHEN** indexes are inspected
- **THEN** the system SHALL maintain at minimum:
  - `idx_agent_sessions_workflow` on `(workflow_id)` for per-workflow listing
  - `idx_agent_sessions_status_heartbeat` on `(status, last_heartbeat_at)` for liveness sweeps

#### Scenario: Workflow deletion is restricted while agent_sessions exist

- **GIVEN** a workflow `sessions` row has at least one `agent_sessions` child row
- **WHEN** an attempt is made to delete the workflow row
- **THEN** the delete SHALL be rejected by the foreign-key constraint
- **AND** the audit trail SHALL remain intact

---

### Requirement: WAL Hygiene on Dashboard Startup

The system SHALL attempt to checkpoint the on-disk SQLite write-ahead-log before the dashboard process accepts client connections, so that stale `.db-wal` files left behind by external native clients (e.g. the `sqlite3` CLI, database GUIs, prior native-driver builds) do not persist across sessions.

OCR's primary engine is sql.js (WASM, in-memory), which loads the entire database into memory and serializes it back to disk via atomic file rename. sql.js does not produce its own WAL file. The implementation is therefore a best-effort cleanup against any WAL produced by *other* clients that happen to open the same DB file.

#### Scenario: Native sqlite3 is on PATH

- **GIVEN** the dashboard process is starting
- **AND** the native `sqlite3` binary is available on PATH
- **WHEN** initialization reaches the database-readiness step, before sql.js opens the file
- **THEN** the system SHALL invoke `sqlite3 <db-path> "PRAGMA wal_checkpoint(TRUNCATE);"` against `.ocr/data/ocr.db`
- **AND** any stale `.db-wal` shall be reclaimed by the native client

#### Scenario: Native sqlite3 is unavailable

- **GIVEN** the dashboard process is starting
- **AND** the native `sqlite3` binary is not on PATH
- **WHEN** initialization reaches the database-readiness step
- **THEN** the WAL checkpoint step SHALL be skipped without error
- **AND** the system SHALL continue startup normally

#### Scenario: WAL checkpoint failure does not block startup

- **GIVEN** the dashboard process is starting
- **AND** the native `sqlite3` invocation exits non-zero (e.g. permissions, locked file)
- **WHEN** the WAL checkpoint step completes
- **THEN** the system SHALL continue startup normally
- **AND** the failure SHALL NOT raise an exception or terminate the process

#### Scenario: Future native-SQLite engine performs the checkpoint directly

- **GIVEN** OCR has been migrated to a native SQLite engine (e.g. `better-sqlite3`)
- **WHEN** dashboard startup runs the WAL checkpoint
- **THEN** the system SHALL issue `PRAGMA wal_checkpoint(TRUNCATE)` directly against its primary connection
- **AND** the external `sqlite3` shellout SHALL no longer be required

---

### Requirement: Liveness Sweep on Startup

The system SHALL run an `agent_sessions` liveness sweep before the dashboard process accepts client connections, so that ghost `running` rows from a prior session that crashed before completion are reconciled at the earliest possible moment.

#### Scenario: Stale running sessions are reclassified

- **GIVEN** a previous `agent_sessions` row exists with `status = 'running'` and `last_heartbeat_at` older than the configured threshold
- **WHEN** dashboard startup runs the liveness sweep
- **THEN** the row SHALL transition to `status = 'orphaned'` with `ended_at` set to the sweep timestamp
- **AND** a `notes` entry SHALL be appended explaining auto-reclassification

#### Scenario: Active sessions are untouched

- **GIVEN** an `agent_sessions` row exists with `last_heartbeat_at` within the threshold
- **WHEN** the liveness sweep runs
- **THEN** the row's `status` SHALL remain `running`
- **AND** no other fields SHALL be modified

---

### Requirement: Concurrent Writer Serialization

The system SHALL serialize concurrent writes to `.ocr/data/ocr.db` from the CLI process and the dashboard process via the established merge-before-write pattern, so that neither writer's changes are silently overwritten by the other.

OCR's current SQLite engine is sql.js (WASM, in-memory). Each process loads the DB into its own memory, mutates locally, and persists via atomic file rename. Cross-process atomicity is therefore not provided by SQL transactions but by file-level merge semantics, owned by `DbSyncWatcher` in the dashboard server and the global save hooks (`registerSaveHooks` in `packages/dashboard/src/server/db.ts`).

#### Scenario: Dashboard merges CLI changes before writing

- **GIVEN** the CLI has written to `.ocr/data/ocr.db` while the dashboard server is running
- **WHEN** the dashboard next saves its in-memory database
- **THEN** the dashboard SHALL re-read the on-disk file via `DbSyncWatcher`, merge any external changes into its in-memory state, and only then write its own atomic rename
- **AND** the resulting on-disk file SHALL contain both the CLI's and the dashboard's changes

#### Scenario: Save hook sequencing

- **GIVEN** any consumer in the dashboard process invokes `saveDb`
- **WHEN** the save executes
- **THEN** the registered pre-save hook SHALL run (`syncFromDisk`) followed by the registered post-save hook (`markOwnWrite`)
- **AND** the watcher's "own writes" tracker SHALL NOT trigger a redundant resync on the very file the dashboard just wrote

#### Scenario: Migration to native SQLite adopts BEGIN IMMEDIATE

- **GIVEN** OCR has been migrated to a native SQLite engine that supports cross-process file locking
- **WHEN** any writer opens a transaction
- **THEN** writers SHALL use `BEGIN IMMEDIATE` rather than the default deferred mode
- **AND** writers SHALL retry on `SQLITE_BUSY` with bounded backoff (recommended: 5 retries with 50ms backoff)
- **AND** the merge-before-write pattern MAY be retired in favor of native serialization

