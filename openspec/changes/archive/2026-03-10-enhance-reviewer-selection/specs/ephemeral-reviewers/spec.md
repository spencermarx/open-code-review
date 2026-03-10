# ephemeral-reviewers — Spec Delta

**Parent specs**: `review-orchestration`, `dashboard`, `slash-commands`, `session-management`

---

## ADDED Requirements

### Requirement: Ephemeral Reviewer Descriptions

The system SHALL support inline reviewer descriptions that exist only for a single review session.

#### Scenario: Describe flag on review command
- **GIVEN** user runs a review with `--reviewer "Focus on error handling"`
- **WHEN** the command is parsed
- **THEN** the system SHALL create one ephemeral reviewer from the description
- **AND** the ephemeral reviewer SHALL be spawned alongside any library reviewers

#### Scenario: Multiple ephemeral reviewers
- **GIVEN** user provides multiple `--reviewer` flags
- **WHEN** the command is parsed
- **THEN** each `--reviewer` value SHALL produce one ephemeral reviewer
- **AND** each SHALL be independently spawned with redundancy 1

#### Scenario: Ephemeral combined with library reviewers
- **GIVEN** user specifies both `--team` and `--reviewer` flags
- **WHEN** the review executes
- **THEN** the system SHALL spawn both library reviewers (from `--team`) and ephemeral reviewers (from `--reviewer`)
- **AND** all reviewers SHALL participate equally in discourse and synthesis

#### Scenario: Ephemeral reviewer output naming
- **GIVEN** ephemeral reviewers are spawned
- **WHEN** review output files are created
- **THEN** ephemeral reviewer files SHALL be named `ephemeral-{n}.md` (e.g., `ephemeral-1.md`)
- **AND** the file SHALL include the original description at the top of the review

#### Scenario: No persistence
- **GIVEN** an ephemeral reviewer completes its review
- **WHEN** the review session ends
- **THEN** the ephemeral reviewer SHALL NOT be written to `reviewers-meta.json`
- **AND** the ephemeral reviewer SHALL NOT be saved as a `.md` file in the reviewers directory

---

### Requirement: Ephemeral Reviewer Dashboard UI

The dashboard SHALL provide UI for adding ephemeral reviewer descriptions when configuring a review.

#### Scenario: Add ephemeral reviewer in dialog
- **GIVEN** the reviewer selection dialog is open
- **WHEN** user clicks "Add description..."
- **THEN** an inline textarea SHALL appear for entering a reviewer description
- **AND** submitting the description SHALL add it to the current selection

#### Scenario: Ephemeral chips in reviewer defaults
- **GIVEN** ephemeral reviewers are in the current selection
- **WHEN** the `ReviewerDefaults` component renders
- **THEN** ephemeral reviewers SHALL appear as visually distinct chips (italic text, pen icon, dashed border)
- **AND** each chip SHALL be removable

#### Scenario: Ephemeral serialization in command string
- **GIVEN** the selection includes ephemeral reviewers
- **WHEN** `buildCommandString()` is called
- **THEN** each ephemeral reviewer SHALL be serialized as a `--reviewer "..."` flag
- **AND** library reviewers SHALL be serialized as `--team` as before

#### Scenario: Ephemeral deserialization from command string
- **GIVEN** a command string contains `--reviewer` flags
- **WHEN** `parseCommandString()` is called
- **THEN** the parsed result SHALL include ephemeral reviewer descriptions
- **AND** re-run prefill SHALL restore the ephemeral descriptions

---

## MODIFIED Requirements

### Requirement: Reviewer Sub-Agent Spawning (modified)

The Tech Lead orchestrator SHALL handle ephemeral reviewer descriptions alongside library reviewers.

#### Scenario: Ephemeral reviewer prompt generation
- **GIVEN** a `--reviewer` value is provided
- **WHEN** the Tech Lead prepares to spawn reviewers
- **THEN** the Tech Lead SHALL synthesize a focused reviewer prompt from the description
- **AND** the synthesized prompt SHALL direct the reviewer to focus on the described area while still reviewing all code in the diff

#### Scenario: Ephemeral reviewer in discourse
- **GIVEN** ephemeral reviewers have produced review output
- **WHEN** the discourse phase begins
- **THEN** ephemeral reviewers SHALL participate in cross-reviewer discourse
- **AND** their findings SHALL be referenced by their description context, not an ID

#### Scenario: Ephemeral reviewer task context
- **GIVEN** an ephemeral reviewer is spawned
- **WHEN** the reviewer task is constructed
- **THEN** the reviewer SHALL receive the user's description as its persona (no `.md` file lookup)
- **AND** the reviewer SHALL receive the same project context, requirements, and Tech Lead guidance as library reviewers
- **AND** the reviewer SHALL use the same output format (`## Summary`, `## Findings`, etc.)

---

### Requirement: Session File Manifest for Ephemeral Reviewers (modified)

The session file manifest SHALL include ephemeral reviewer output files.

#### Scenario: Ephemeral files in session directory
- **GIVEN** a review session includes ephemeral reviewers
- **WHEN** the session directory is inspected
- **THEN** ephemeral reviewer files SHALL appear as `rounds/round-{n}/reviews/ephemeral-{n}.md`
- **AND** these files SHALL be listed alongside library reviewer files in CLI progress tracking
