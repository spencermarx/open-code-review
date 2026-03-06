## ADDED Requirements

### Requirement: Round-Level Review Triage

The dashboard SHALL allow users to set a triage status on each review round, persisted to SQLite, for tracking review progress across sessions.

#### Scenario: Triage status values

- **GIVEN** a review round exists in the database
- **WHEN** a user sets triage status on the round
- **THEN** the status SHALL be one of: `needs_review`, `in_progress`, `changes_made`, `acknowledged`, `dismissed`
- **AND** the default status for rounds without explicit triage SHALL be `needs_review`

#### Scenario: Persist round triage

- **WHEN** user changes a round's triage status via the Reviews page dropdown
- **THEN** the client calls `PATCH /api/rounds/:id/progress` with `{ status }` body
- **AND** the server upserts a row in `user_round_progress` with the round ID and status
- **AND** the status persists across dashboard restarts

#### Scenario: Reset round triage

- **WHEN** user wants to clear triage status on a round
- **THEN** the client calls `DELETE /api/rounds/:id/progress`
- **AND** the `user_round_progress` row is deleted
- **AND** the round reverts to the default `needs_review` display

#### Scenario: Schema migration

- **GIVEN** the database is at schema version 2
- **WHEN** OCR upgrades to include round triage
- **THEN** migration v3 creates `user_round_progress` table with `UNIQUE(round_id)` and `ON DELETE CASCADE`

---

### Requirement: Reviews List Page

The dashboard SHALL display a filterable, sortable table of all review rounds across sessions, with an actionable-first default view.

#### Scenario: Default view shows actionable rounds

- **GIVEN** review rounds exist with various triage statuses
- **WHEN** user opens the Reviews page
- **THEN** only rounds with status `needs_review` or `in_progress` are shown by default
- **AND** an "Actionable" / "All" toggle controls the filter

#### Scenario: Filter by status

- **GIVEN** user has toggled to "All" view
- **WHEN** user selects a status from the Status dropdown
- **THEN** only rounds matching that status are shown

#### Scenario: Filter by verdict

- **WHEN** user selects a verdict from the Verdict dropdown
- **THEN** only rounds matching that verdict are shown
- **AND** verdict options are dynamically derived from loaded rounds

#### Scenario: Sortable columns

- **WHEN** user clicks a column header (Branch, Round, Verdict, Blockers, Status)
- **THEN** the table sorts by that column ascending
- **AND** clicking again reverses to descending

#### Scenario: Inline status change

- **WHEN** user changes a round's status via the inline dropdown
- **THEN** the status is updated via API without navigating away
- **AND** the dropdown click does not trigger row navigation

#### Scenario: Row navigation

- **WHEN** user clicks a table row (outside the status dropdown)
- **THEN** the user is navigated to `/sessions/:id/reviews/:round`

#### Scenario: Count display

- **WHEN** filters are applied
- **THEN** the table shows "N of M reviews" indicating filtered vs total count

---

### Requirement: Round Triage in Session Detail

The session detail Review tab SHALL display triage status badges next to each review round link.

#### Scenario: Round with triage status

- **GIVEN** a round has a `user_round_progress` row
- **WHEN** user views the session detail Review tab
- **THEN** a `StatusBadge` with the triage status is shown next to the round's verdict

#### Scenario: Round without triage status

- **GIVEN** a round has no `user_round_progress` row
- **WHEN** user views the session detail Review tab
- **THEN** no triage badge is shown (only the verdict text if present)

---

### Requirement: Enriched Review API Responses

All review-related API endpoints SHALL include the round's triage progress in responses.

#### Scenario: Reviews list endpoint

- **WHEN** client calls `GET /api/reviews`
- **THEN** each round in the response includes `progress: { id, round_id, status, updated_at } | null`

#### Scenario: Session rounds endpoint

- **WHEN** client calls `GET /api/sessions/:id/rounds`
- **THEN** each round includes the `progress` field

#### Scenario: Single round endpoint

- **WHEN** client calls `GET /api/sessions/:id/rounds/:round`
- **THEN** the response includes the `progress` field

---

### Requirement: Reusable SortableHeader Component

The dashboard SHALL provide a generic `SortableHeader` component for use across data tables.

#### Scenario: Generic sort control

- **GIVEN** a data table needs sortable columns
- **WHEN** the developer uses `SortableHeader<T>`
- **THEN** it renders a `<th>` with sort direction indicators and click handler
- **AND** it accepts a generic field type parameter for type-safe sort state
