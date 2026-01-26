# Session Management

Review session storage, history, and artifact management.

## ADDED Requirements

### Requirement: Session Directory Structure

The system SHALL store all review artifacts in a structured session directory.

#### Scenario: Session creation
- **GIVEN** a new review is initiated
- **WHEN** the session begins
- **THEN** the system SHALL create directory `.ocr/sessions/{YYYY-MM-DD}-{branch}/`

#### Scenario: Session ID format
- **GIVEN** a review runs on branch `feat/auth-flow`
- **WHEN** session ID is generated
- **THEN** the ID SHALL be `{YYYY-MM-DD}-feat-auth-flow` (slashes replaced with dashes)

#### Scenario: Session contents
- **GIVEN** a session directory is created
- **WHEN** review completes
- **THEN** the directory SHALL contain:
  - `state.json` - Session state for progress tracking (REQUIRED)
  - `context.md` - Change summary and intent
  - `discovered-standards.md` - Merged project context
  - `reviews/` - Individual reviewer outputs
  - `discourse.md` - Discourse results (if not --quick)
  - `final.md` - Synthesized final review

---

### Requirement: Individual Review Storage

The system SHALL store each reviewer's output in the reviews subdirectory.

#### Scenario: Review file naming
- **GIVEN** security reviewer runs with redundancy=2
- **WHEN** reviews are saved
- **THEN** files SHALL be named:
  - `reviews/security-1.md`
  - `reviews/security-2.md`

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

The system SHALL maintain explicit state in `state.json` for reliable progress tracking.

#### Scenario: State file creation
- **GIVEN** a new review session begins
- **WHEN** the session directory is created
- **THEN** the system SHALL create `state.json` with initial state

#### Scenario: State file format
- **GIVEN** a session is in progress
- **WHEN** `state.json` is read
- **THEN** it SHALL contain:
  - `session_id` - Session identifier
  - `current_phase` - Current workflow phase
  - `phase_number` - Numeric phase (1-8)
  - `completed_phases` - Array of completed phase names
  - `started_at` - ISO timestamp of session start
  - `updated_at` - ISO timestamp of last update

#### Scenario: State updates at phase transitions
- **GIVEN** a review progresses through phases
- **WHEN** each phase completes
- **THEN** the system SHALL update `state.json` with new phase and completed_phases

#### Scenario: CLI progress tracking
- **GIVEN** `state.json` exists in a session
- **WHEN** `ocr progress` CLI is invoked
- **THEN** the CLI SHALL read state.json for accurate progress display

#### Scenario: Cross-mode compatibility
- **GIVEN** OCR runs as a Claude Code plugin
- **WHEN** sessions are stored in `.ocr/sessions/`
- **THEN** the standalone CLI SHALL find and track session progress identically

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

The system SHALL support retrieving and displaying past sessions.

#### Scenario: View final review
- **GIVEN** user invokes `/ocr:show {session-id}`
- **WHEN** session exists
- **THEN** the system SHALL display contents of `final.md`

#### Scenario: View with discourse
- **GIVEN** user invokes `/ocr:show {session-id} --discourse`
- **WHEN** session has discourse.md
- **THEN** the system SHALL include discourse details in output

#### Scenario: View individual reviews
- **GIVEN** user invokes `/ocr:show {session-id} --reviews`
- **WHEN** session has reviews
- **THEN** the system SHALL include all individual reviewer outputs

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

The system SHALL handle multiple reviews on the same day and branch.

#### Scenario: Same-day duplicate
- **GIVEN** a session `2025-01-26-main` already exists
- **WHEN** another review runs on main branch on 2025-01-26
- **THEN** the system SHALL either:
  - Append a counter (`2025-01-26-main-2`), OR
  - Overwrite existing session with warning

#### Scenario: Preserve important sessions
- **GIVEN** user wants to preserve a session from overwrite
- **WHEN** they rename or move the session directory
- **THEN** the session SHALL remain accessible via the new name
