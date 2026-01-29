## ADDED Requirements

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
  - `map.md` — Final rendered review map
  - `files.json` — Canonical file list with section assignments (optional)

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
  - Update `current_map_run` to 2 in `state.json`
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
