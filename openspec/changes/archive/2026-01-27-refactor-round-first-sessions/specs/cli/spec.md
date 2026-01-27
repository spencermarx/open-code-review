## MODIFIED Requirements

### Requirement: Progress Phase Tracking

The CLI SHALL track all 8 review phases by reading `state.json` from the session directory.

#### Scenario: State file required

- **GIVEN** a session directory exists
- **WHEN** progress command reads the session
- **THEN** it SHALL read `state.json` for phase information
- **AND** if `state.json` is missing, the session is treated as "waiting"

#### Scenario: State file format

- **GIVEN** `state.json` exists in a session
- **WHEN** progress command reads it
- **THEN** it SHALL parse:
  - `current_phase` - The current workflow phase
  - `phase_number` - Numeric phase (1-8)
  - `current_round` - Current round number
  - `started_at` - Session start timestamp
  - `round_started_at` - Current round start timestamp (for multi-round timing)

#### Scenario: Phase completion derived from state

- **GIVEN** progress command displays phase checkmarks
- **WHEN** determining which phases are complete
- **THEN** it SHALL derive completion from `phase_number` (phases < current are complete)
- **AND** it SHALL NOT count files or use hardcoded thresholds

#### Scenario: Phase transitions

- **GIVEN** progress command is running
- **WHEN** `state.json` is updated with new phase
- **THEN** display updates to show the new current phase
- **AND** completed phases show checkmarks

#### Scenario: Waiting state

- **GIVEN** user runs `ocr progress` with no active session or missing `state.json`
- **WHEN** the display renders
- **THEN** a "Waiting for review" state is shown
- **AND** the command continues watching for new sessions

#### Scenario: Cross-mode compatibility

- **GIVEN** OCR is running as a Claude Code plugin (not CLI installed)
- **WHEN** the agent writes `state.json` to `.ocr/sessions/`
- **THEN** `npx @open-code-review/cli progress` SHALL track the session correctly
