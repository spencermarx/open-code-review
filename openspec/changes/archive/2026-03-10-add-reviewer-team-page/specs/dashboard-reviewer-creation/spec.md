# dashboard-reviewer-creation — Spec Delta

**Capability**: `dashboard`

## ADDED Requirements

### Requirement: Create Reviewer from Dashboard

The Team page SHALL allow users to create new custom reviewers via an AI-powered flow.

#### Scenario: Open create dialog

- **GIVEN** the Team page is open and an AI CLI is available
- **WHEN** user clicks "Create Reviewer"
- **THEN** a dialog SHALL open with inputs for reviewer name and focus description

#### Scenario: AI CLI unavailable

- **GIVEN** no AI CLI is detected (Claude Code or OpenCode not installed, or `ai_cli: off`)
- **WHEN** the Team page loads
- **THEN** the "Create Reviewer" button SHALL be disabled
- **AND** a tooltip SHALL explain that an AI CLI is required

#### Scenario: Submit create request

- **GIVEN** the Create Reviewer dialog is open
- **WHEN** user enters a name (e.g., "API Design") and description (e.g., "REST API design, backwards compatibility, versioning")
- **AND** clicks "Create"
- **THEN** the dashboard SHALL emit `command:run` with the command `create-reviewer {slug} --focus "{description}"`
- **AND** the dialog SHALL show the command output inline
- **AND** on success, the new reviewer SHALL appear on the page automatically (via `reviewers:updated`)

#### Scenario: Name validation

- **WHEN** user enters a name in the Create Reviewer dialog
- **THEN** the slug SHALL be auto-generated (lowercase, hyphens for spaces, alphanumeric only)
- **AND** the slug SHALL be shown as a preview below the name input

---

### Requirement: Sync Reviewers from Dashboard

The Team page SHALL allow users to trigger a reviewer metadata sync.

#### Scenario: Trigger sync

- **GIVEN** the Team page is open and an AI CLI is available
- **WHEN** user clicks "Sync Reviewers"
- **THEN** the dashboard SHALL emit `command:run` with the command `sync-reviewers`
- **AND** a loading indicator SHALL be shown on the button
- **AND** on completion, the reviewer list SHALL refresh automatically

#### Scenario: Sync button disabled during command

- **GIVEN** a sync or create command is currently running
- **WHEN** user views the Team page
- **THEN** the Sync and Create buttons SHALL be disabled until the command completes

## MODIFIED Requirements

### Requirement: AI Command Whitelist (from `dashboard` spec)

The command runner's AI command whitelist SHALL include `create-reviewer` and `sync-reviewers`.

#### Scenario: Create reviewer via dashboard

- **WHEN** `command:run` is emitted with command `create-reviewer custom-name --focus "description"`
- **THEN** the command runner SHALL accept and spawn the AI command
- **AND** it SHALL read `.ocr/commands/create-reviewer.md` as the command file

#### Scenario: Sync reviewers via dashboard

- **WHEN** `command:run` is emitted with command `sync-reviewers`
- **THEN** the command runner SHALL accept and spawn the AI command
