# reviewer-team-page — Spec Delta

**Capability**: `dashboard`

## ADDED Requirements

### Requirement: Reviewer Team Page

The dashboard SHALL provide a dedicated `/reviewers` page for browsing and managing the reviewer team.

#### Scenario: Page with reviewers loaded

- **GIVEN** `reviewers-meta.json` exists and contains reviewers
- **WHEN** user navigates to `/reviewers`
- **THEN** the page SHALL display all reviewers grouped by tier (holistic, specialist, persona, custom)
- **AND** each reviewer SHALL be shown as a card with: icon, name, tier badge, description, and focus area tags
- **AND** tiers with no reviewers SHALL be hidden

#### Scenario: No reviewers metadata

- **GIVEN** `reviewers-meta.json` does not exist
- **WHEN** user navigates to `/reviewers`
- **THEN** an empty state SHALL be shown with instructions to run `ocr init` or `/ocr:sync-reviewers`

#### Scenario: Search / filter reviewers

- **WHEN** user types in the search input on the Team page
- **THEN** reviewers SHALL be filtered client-side across `name`, `description`, `focus_areas`, and `known_for`
- **AND** tier sections with no matching reviewers SHALL be hidden

#### Scenario: Default reviewer indicators

- **GIVEN** a reviewer has `is_default: true` in the metadata
- **WHEN** displayed on the Team page
- **THEN** the card SHALL show a "Default" indicator badge

#### Scenario: Live refresh on metadata change

- **GIVEN** the Team page is open
- **WHEN** `reviewers-meta.json` is updated (by sync, creation, or manual edit)
- **THEN** the server SHALL emit `reviewers:updated` via Socket.IO
- **AND** the page SHALL refresh its data without manual reload

---

### Requirement: Reviewer Team Navigation

The dashboard sidebar SHALL include a navigation entry for the Reviewer Team page.

#### Scenario: Sidebar nav item

- **WHEN** the dashboard loads
- **THEN** the sidebar SHALL show a "Team" nav item with the `Users` icon
- **AND** it SHALL link to `/reviewers`
- **AND** it SHALL appear between "Commands" and "Sessions"

---

### Requirement: Prompt Viewer

The Team page SHALL provide a way to view the full markdown prompt for any reviewer.

#### Scenario: View prompt for built-in reviewer

- **GIVEN** a reviewer card is displayed
- **WHEN** user clicks "View Prompt" on the card
- **THEN** a sheet or modal SHALL open showing the full rendered markdown content of that reviewer's `.md` file
- **AND** the content SHALL be fetched via `GET /api/reviewers/:id/prompt`

#### Scenario: Prompt file not found

- **GIVEN** a reviewer exists in metadata but its `.md` file has been deleted
- **WHEN** user clicks "View Prompt"
- **THEN** the viewer SHALL show a "Prompt file not found" message

---

### Requirement: Reviewer Prompt API Endpoint

The dashboard server SHALL expose an endpoint to read individual reviewer prompt files.

#### Scenario: Valid reviewer ID

- **GIVEN** `.ocr/skills/references/reviewers/architect.md` exists
- **WHEN** `GET /api/reviewers/architect/prompt` is called
- **THEN** the server SHALL return `{ "id": "architect", "content": "<file contents>" }` with status 200

#### Scenario: Unknown reviewer ID

- **WHEN** `GET /api/reviewers/unknown-id/prompt` is called
- **AND** no matching `.md` file exists
- **THEN** the server SHALL return `{ "error": "Reviewer not found" }` with status 404

#### Scenario: Path traversal prevention

- **WHEN** `GET /api/reviewers/../../etc/passwd/prompt` is called
- **THEN** the server SHALL reject the request with status 400
- **AND** only alphanumeric characters and hyphens SHALL be accepted as reviewer IDs
