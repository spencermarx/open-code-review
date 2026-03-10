# reviewer-selection-ui — Spec Delta

**Parent specs**: `dashboard`, `review-orchestration`

---

## ADDED Requirements

### Requirement: Reviewers API Endpoint

The dashboard server SHALL expose a reviewers API endpoint.

#### Scenario: Reviewers meta file exists
- **GIVEN** `.ocr/reviewers-meta.json` exists and is valid
- **WHEN** `GET /api/reviewers` is called
- **THEN** the server SHALL return the parsed JSON contents
- **AND** include a `defaults` array of reviewer IDs where `is_default` is true

#### Scenario: Reviewers meta file missing
- **GIVEN** `.ocr/reviewers-meta.json` does not exist
- **WHEN** `GET /api/reviewers` is called
- **THEN** the server SHALL return `{ "reviewers": [], "defaults": [] }`

#### Scenario: Real-time update on file change
- **GIVEN** the dashboard is running and a client is connected
- **WHEN** `.ocr/reviewers-meta.json` is created or modified
- **THEN** the server SHALL emit a `reviewers:updated` Socket.IO event
- **AND** the event payload SHALL contain the updated reviewer list

---

### Requirement: Default Reviewers Display

The review command form SHALL display default reviewers as an inline section.

#### Scenario: Default reviewers shown as chips
- **GIVEN** `reviewers-meta.json` exists with default reviewers
- **WHEN** the user views the Review command form
- **THEN** default reviewers SHALL appear as compact chips/badges
- **AND** each chip SHALL show: Lucide icon, short name, redundancy count (e.g., "×2")

#### Scenario: Remove default reviewer from run
- **GIVEN** default reviewer chips are displayed
- **WHEN** the user clicks the remove (×) button on a chip
- **THEN** that reviewer SHALL be excluded from the current review run
- **AND** the `--team` flag SHALL reflect the remaining selection

#### Scenario: No reviewers-meta.json available
- **GIVEN** `reviewers-meta.json` does not exist
- **WHEN** the user views the Review command form
- **THEN** a subtle prompt SHALL display: "Run /ocr:sync-reviewers to customize your review team"
- **AND** the review command SHALL still function using `config.yaml` defaults

---

### Requirement: Reviewer Selection Dialog

The dashboard SHALL provide a modal dialog for selecting reviewers.

#### Scenario: Open dialog
- **GIVEN** default reviewer chips are displayed
- **WHEN** the user clicks "Customize..."
- **THEN** a full-width modal dialog SHALL open
- **AND** all reviewers from `reviewers-meta.json` SHALL be shown

#### Scenario: Search filtering
- **GIVEN** the reviewer dialog is open
- **WHEN** the user types in the search input
- **THEN** reviewers SHALL be filtered in real-time by name, description, and focus areas
- **AND** filtering SHALL be client-side (no API calls)

#### Scenario: Tier grouping
- **GIVEN** the reviewer dialog is open
- **WHEN** reviewers are displayed
- **THEN** they SHALL be grouped under collapsible tier headers:
  - "Generalists" (tier: holistic)
  - "Specialists" (tier: specialist)
  - "Famous Engineers" (tier: persona)
  - "Custom" (tier: custom, only shown if custom reviewers exist)

#### Scenario: Reviewer card display
- **GIVEN** a reviewer entry in the dialog
- **WHEN** it is rendered
- **THEN** the card SHALL show:
  - Lucide icon (left)
  - Name and tier badge (top line)
  - One-line description (below name)
  - Selection checkbox (multi-select)

#### Scenario: Reviewer help popover
- **GIVEN** a reviewer card in the dialog
- **WHEN** the user clicks the help (?) button
- **THEN** a popover SHALL display:
  - Full description of the reviewer's focus
  - For persona tier: "Known for" and "Philosophy" text
  - Focus areas rendered as tags/pills

#### Scenario: Redundancy selection
- **GIVEN** a reviewer is checked (selected) in the dialog
- **WHEN** the reviewer card is in selected state
- **THEN** a redundancy stepper (1-3) SHALL become visible
- **AND** the default redundancy SHALL be 1

#### Scenario: Apply selection
- **GIVEN** the user has selected reviewers in the dialog
- **WHEN** the user clicks "Apply"
- **THEN** the dialog SHALL close
- **AND** the command form SHALL update to reflect the custom selection
- **AND** the inline chips SHALL update to show the new selection

#### Scenario: Cancel selection
- **GIVEN** the user has made changes in the dialog
- **WHEN** the user clicks "Cancel" or presses Escape
- **THEN** the dialog SHALL close
- **AND** no changes SHALL be applied to the command form

---

### Requirement: Team Override Flag

The review command SHALL support a `--team` flag for explicit reviewer selection.

#### Scenario: Team flag format
- **GIVEN** the user has customized the reviewer selection
- **WHEN** the command string is built
- **THEN** the `--team` flag SHALL use format: `--team <id>:<count>,<id>:<count>`
- **AND** example: `--team principal:2,martin-fowler:1,frontend:1`

#### Scenario: Default team — no flag
- **GIVEN** the user has not modified the default reviewer selection
- **WHEN** the command string is built
- **THEN** the `--team` flag SHALL be omitted
- **AND** the review SHALL use `config.yaml` `default_team` as usual

#### Scenario: Parse team flag for re-run
- **GIVEN** a command history entry contains a `--team` flag
- **WHEN** the user clicks "Re-run" on that command
- **THEN** the command palette SHALL prefill the reviewer selection from the `--team` value

#### Scenario: AI skill processes team flag
- **GIVEN** the user runs `/ocr:review --team principal:1,martin-fowler:1`
- **WHEN** the AI review skill begins
- **THEN** the skill SHALL spawn only the specified reviewers at the specified redundancy
- **AND** the `config.yaml` `default_team` SHALL be ignored for this run

---

## MODIFIED Requirements

### Requirement: Command Palette Review Form (modified)

The review command form in the command palette SHALL include reviewer selection controls.

#### Scenario: Review form with reviewer section
- **GIVEN** the user selects "Review" in the command palette
- **WHEN** the form is displayed
- **THEN** the form SHALL include (in order):
  1. Target input field
  2. Requirements input field
  3. Reviewer selection section (default chips + customize button)
  4. Fresh start toggle
  5. Run button

#### Scenario: Command string includes team override
- **GIVEN** the user has customized the reviewer selection
- **WHEN** "Run Review" is clicked and confirmed
- **THEN** the generated command string SHALL include the `--team` flag
- **AND** example: `ocr review --team principal:2,security:1 --requirements spec.md`
