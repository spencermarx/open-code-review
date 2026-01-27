## MODIFIED Requirements

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

### Requirement: Session State Tracking

The system SHALL maintain explicit state in `state.json` for reliable progress tracking with round awareness.

#### Scenario: State file creation
- **GIVEN** a new review session begins
- **WHEN** the session directory is created
- **THEN** the system SHALL create `state.json` with initial state including round information

#### Scenario: State file format
- **GIVEN** a session is in progress
- **WHEN** `state.json` is read
- **THEN** it SHALL contain:
  - `session_id` - Session identifier
  - `current_phase` - Current workflow phase
  - `phase_number` - Numeric phase (1-8)
  - `current_round` - Current round number (hint, reconcilable with filesystem)
  - `started_at` - ISO timestamp of session start
  - `round_started_at` - ISO timestamp of current round start (for multi-round timing)
  - `updated_at` - ISO timestamp of last update

#### Scenario: Filesystem-derived state
- **GIVEN** a session directory exists
- **WHEN** state information is needed
- **THEN** the following SHALL be derived from filesystem:
  - Round count from `rounds/round-*/` directory enumeration
  - Round completion from presence of `final.md` in round directory
  - Reviewers from files in `rounds/round-{n}/reviews/`
  - Discourse completion from presence of `discourse.md` in round directory

#### Scenario: State updates at phase transitions
- **GIVEN** a review progresses through phases
- **WHEN** transitioning to a new phase
- **THEN** the orchestrating agent SHALL update `state.json` with `current_phase` and `phase_number` BEFORE starting work on the phase

#### Scenario: Phase completion display
- **GIVEN** the CLI displays progress
- **WHEN** determining phase completion checkmarks
- **THEN** the CLI SHALL derive completion from `state.json.phase_number` (phases < current are complete)

#### Scenario: CLI progress tracking
- **GIVEN** `state.json` exists in a session
- **WHEN** `ocr progress` CLI is invoked
- **THEN** the CLI SHALL read state.json for accurate progress display including current round

#### Scenario: Missing state.json handling
- **GIVEN** `state.json` is missing or corrupt in a session
- **WHEN** `ocr progress` CLI is invoked
- **THEN** the CLI SHALL display "Waiting for session..." until valid state.json is created
- **NOTE**: Future versions may implement filesystem reconstruction

#### Scenario: Cross-mode compatibility
- **GIVEN** OCR runs as a Claude Code plugin
- **WHEN** sessions are stored in `.ocr/sessions/`
- **THEN** the standalone CLI SHALL find and track session progress identically

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

## ADDED Requirements

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

#### Scenario: Shared context remains at root
- **GIVEN** a multi-round session exists
- **WHEN** context is examined
- **THEN** `discovered-standards.md`, `requirements.md`, and `context.md` SHALL remain at session root (shared across all rounds)

---

### Requirement: State Reconciliation

The system SHALL gracefully handle inconsistencies between `state.json` and filesystem state, treating filesystem as the source of truth.

#### Scenario: Missing state.json
- **GIVEN** a session directory exists without `state.json`
- **WHEN** CLI or command reads the session
- **THEN** the system SHOULD display "Waiting for session..." until the orchestrating agent creates `state.json`
- **NOTE**: Future versions MAY implement filesystem reconstruction to derive state from artifacts

#### Scenario: State references non-existent round
- **GIVEN** `state.json` has `current_round: 3` but only `round-1/` and `round-2/` exist
- **WHEN** CLI reads the session
- **THEN** the system SHALL adjust `current_round` to highest existing round (2)

#### Scenario: Filesystem shows completion but state disagrees
- **GIVEN** `rounds/round-1/final.md` exists but `state.json` says phase is "reviews"
- **WHEN** CLI reads the session
- **THEN** the system SHALL trust filesystem and treat round as complete

#### Scenario: Corrupt state.json
- **GIVEN** `state.json` contains invalid JSON
- **WHEN** CLI attempts to read state
- **THEN** the system SHOULD log a warning and MAY show "Waiting for session..." state
- **NOTE**: Full filesystem reconstruction is a future enhancement

#### Scenario: User creates empty round directory
- **GIVEN** user manually creates `rounds/round-2/` with no contents
- **WHEN** a new review is initiated
- **THEN** the system SHALL treat the empty round as the target for the new review
