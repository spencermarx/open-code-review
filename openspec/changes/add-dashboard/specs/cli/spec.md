## ADDED Requirements

### Requirement: Dashboard Command

The CLI SHALL provide a `dashboard` command that starts a local HTTP + WebSocket server and opens the dashboard in the user's default browser.

#### Scenario: Start dashboard

- **GIVEN** user has run `ocr init` (`.ocr/` directory exists)
- **WHEN** user runs `ocr dashboard`
- **THEN** a local server starts on port 4173 (default) serving both HTTP and Socket.IO
- **AND** the user's default browser opens to `http://localhost:4173`
- **AND** the terminal displays the URL, Socket.IO status, and "Press Ctrl+C to stop"

#### Scenario: Custom port

- **GIVEN** port 4173 is in use
- **WHEN** user runs `ocr dashboard --port 8080`
- **THEN** server starts on port 8080

#### Scenario: No browser auto-open

- **WHEN** user runs `ocr dashboard --no-open`
- **THEN** server starts but browser does not open

#### Scenario: No OCR setup

- **GIVEN** `.ocr/` directory does not exist
- **WHEN** user runs `ocr dashboard`
- **THEN** the command exits with an error: "OCR not initialized. Run `ocr init` first."

#### Scenario: Database auto-creation

- **GIVEN** `.ocr/` exists but `.ocr/data/ocr.db` does not
- **WHEN** user runs `ocr dashboard`
- **THEN** the database is created, migrations run, and the server starts normally

---

### Requirement: Zero Dashboard Startup Cost

The dashboard code SHALL NOT be loaded unless the user runs `ocr dashboard`. Commands like `ocr init`, `ocr progress`, and `ocr state` MUST remain fast.

#### Scenario: Dynamic import only on dashboard command

- **GIVEN** user runs any CLI command other than `ocr dashboard`
- **WHEN** the CLI process starts
- **THEN** the dashboard server module (`dist/dashboard/server.js`) SHALL NOT be imported or loaded

#### Scenario: Dashboard dependencies isolated

- **GIVEN** the dashboard adds significant dependencies (React, Socket.IO, sql.js client bundle)
- **WHEN** user runs `ocr init` or `ocr progress`
- **THEN** none of these dependencies are loaded
- **AND** CLI startup time is unaffected

---

## MODIFIED Requirements

### Requirement: Progress Phase Tracking

The CLI SHALL track all 8 review phases by reading from SQLite (primary) with `state.json` fallback, from the session directory.

#### Scenario: SQLite primary source

- **GIVEN** a session exists in SQLite (`sessions` table)
- **WHEN** progress command reads the session
- **THEN** it SHALL read phase information from the `sessions` table in `.ocr/data/ocr.db`
- **AND** orchestration events from `orchestration_events` for timeline data

#### Scenario: State.json fallback

- **GIVEN** a session directory exists but no corresponding row in SQLite
- **WHEN** progress command reads the session
- **THEN** it SHALL fall back to reading `state.json` for phase information
- **AND** if `state.json` is also missing, the session is treated as "waiting"

#### Scenario: State file format (SQLite)

- **GIVEN** a session row exists in SQLite
- **WHEN** progress command reads it
- **THEN** it SHALL parse:
  - `current_phase` - The current workflow phase
  - `phase_number` - Numeric phase (1-8)
  - `current_round` - Current round number
  - `started_at` - Session start timestamp
  - `updated_at` - Last update timestamp

#### Scenario: Phase completion derived from state

- **GIVEN** progress command displays phase checkmarks
- **WHEN** determining which phases are complete
- **THEN** it SHALL derive completion from `phase_number` (phases < current are complete)
- **AND** it SHALL NOT count files or use hardcoded thresholds

#### Scenario: Phase transitions

- **GIVEN** progress command is running
- **WHEN** SQLite is updated with a new phase (or `state.json` as fallback)
- **THEN** display updates to show the new current phase
- **AND** completed phases show checkmarks

#### Scenario: Waiting state

- **GIVEN** user runs `ocr progress` with no active session in SQLite or `state.json`
- **WHEN** the display renders
- **THEN** a "Waiting for review" state is shown
- **AND** the command continues watching for new sessions

#### Scenario: Cross-mode compatibility

- **GIVEN** OCR is running as a Claude Code plugin (not CLI installed)
- **WHEN** the agent writes state via `ocr state` commands (which write to SQLite)
- **THEN** `npx @open-code-review/cli progress` SHALL track the session correctly
