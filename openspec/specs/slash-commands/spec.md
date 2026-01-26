# slash-commands Specification

## Purpose
TBD - created by archiving change add-ocr-core. Update Purpose after archive.
## Requirements
### Requirement: Review Command

The system SHALL provide `/ocr:review` as the primary command for initiating code reviews.

#### Scenario: Command structure
- **GIVEN** user wants to run a review
- **WHEN** they invoke `/ocr:review`
- **THEN** the command SHALL accept:
  - Optional target: `staged` (default), `HEAD~N..HEAD`, `pr <number>`, or `<commit-range>`
  - Optional `--post` flag to post to GitHub PR
  - Optional `--quick` flag to skip discourse
  - Optional `--redundancy N` to override config

#### Scenario: Help text
- **GIVEN** user invokes `/ocr:review --help` or views command in `/help`
- **WHEN** help is displayed
- **THEN** it SHALL show:
  - Command description
  - Argument hints
  - Examples

---

### Requirement: Doctor Command

The system SHALL provide `/ocr:doctor` for diagnostics and setup validation.

#### Scenario: Health check output
- **GIVEN** user invokes `/ocr:doctor`
- **WHEN** command executes
- **THEN** the system SHALL display:
  - OCR skill installation status
  - Configuration validity
  - Available reviewers with redundancy
  - Discovered context files
  - Git repository status
  - GitHub CLI availability and auth status

#### Scenario: Show discovered context
- **GIVEN** user invokes `/ocr:doctor`
- **WHEN** context files exist
- **THEN** the system SHALL list each discovered file with size

#### Scenario: Ready confirmation
- **GIVEN** all checks pass
- **WHEN** doctor completes
- **THEN** the system SHALL display "Ready to review!" with example commands

---

### Requirement: Reviewers Command

The system SHALL provide `/ocr:reviewers` to list available reviewers.

#### Scenario: Reviewers list output
- **GIVEN** user invokes `/ocr:reviewers`
- **WHEN** command executes
- **THEN** the system SHALL display a table with:
  - Name
  - Focus summary
  - Redundancy setting
  - Custom indicator for user-created reviewers

---

### Requirement: Add Reviewer Command

The system SHALL provide `/ocr:add-reviewer <name>` for interactive reviewer creation.

#### Scenario: Require name argument
- **GIVEN** user invokes `/ocr:add-reviewer` without name
- **WHEN** command validates input
- **THEN** the system SHALL prompt for a name

#### Scenario: Valid name format
- **GIVEN** user provides a reviewer name
- **WHEN** name is validated
- **THEN** name SHALL be lowercase, single word (e.g., `performance`, `accessibility`)

---

### Requirement: Edit Reviewer Command

The system SHALL provide `/ocr:edit-reviewer <name>` for modifying existing reviewers.

#### Scenario: Load existing reviewer
- **GIVEN** user invokes `/ocr:edit-reviewer security`
- **WHEN** security.md exists
- **THEN** the system SHALL load and display current persona before modifications

---

### Requirement: History Command

The system SHALL provide `/ocr:history` to list recent review sessions.

#### Scenario: List sessions
- **GIVEN** user invokes `/ocr:history`
- **WHEN** sessions exist in `.ocr/sessions/`
- **THEN** the system SHALL display:
  - Session ID (date-branch)
  - Status (Complete/In Progress)
  - Reviewer count
  - Redundancy summary

#### Scenario: Limit results
- **GIVEN** user invokes `/ocr:history -n 5`
- **WHEN** more than 5 sessions exist
- **THEN** the system SHALL display only the 5 most recent

---

### Requirement: Show Command

The system SHALL provide `/ocr:show` to display a review session.

#### Scenario: Show most recent
- **GIVEN** user invokes `/ocr:show` without session ID
- **WHEN** sessions exist
- **THEN** the system SHALL display the most recent final.md

#### Scenario: Show specific session
- **GIVEN** user invokes `/ocr:show 2025-01-26-feat-auth`
- **WHEN** session exists
- **THEN** the system SHALL display that session's final.md

#### Scenario: Include discourse
- **GIVEN** user invokes `/ocr:show --discourse`
- **WHEN** displaying session
- **THEN** the system SHALL include discourse.md content

#### Scenario: Include individual reviews
- **GIVEN** user invokes `/ocr:show --reviews`
- **WHEN** displaying session
- **THEN** the system SHALL include individual reviewer outputs

---

### Requirement: Post Command

The system SHALL provide `/ocr:post` to post reviews to GitHub PRs.

#### Scenario: Post most recent
- **GIVEN** user invokes `/ocr:post`
- **WHEN** most recent session and current PR exist
- **THEN** the system SHALL post final.md to the current branch's PR

#### Scenario: Post specific session
- **GIVEN** user invokes `/ocr:post 2025-01-26-feat-auth`
- **WHEN** session exists
- **THEN** the system SHALL post that session's final.md

#### Scenario: Specify PR
- **GIVEN** user invokes `/ocr:post --pr 123`
- **WHEN** PR #123 exists
- **THEN** the system SHALL post to PR #123

#### Scenario: GitHub CLI required
- **GIVEN** user invokes `/ocr:post`
- **WHEN** `gh` CLI is not available or not authenticated
- **THEN** the system SHALL display a clear error with installation/auth instructions

---

### Requirement: Command Namespacing

All OCR commands SHALL be namespaced under `/ocr:` to prevent conflicts.

#### Scenario: Namespace format
- **GIVEN** OCR is installed as a plugin
- **WHEN** commands are registered
- **THEN** all commands SHALL use the format `/ocr:<command>`

#### Scenario: Help integration
- **GIVEN** user invokes `/help`
- **WHEN** help is displayed
- **THEN** OCR commands SHALL appear grouped under the `ocr` namespace

