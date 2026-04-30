# sqlite-state Spec Delta

## ADDED Requirements

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
