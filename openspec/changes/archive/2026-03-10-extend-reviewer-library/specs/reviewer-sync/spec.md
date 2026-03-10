# reviewer-sync — Spec Delta

**Parent specs**: `reviewer-management`, `cli`, `slash-commands`

---

## ADDED Requirements

### Requirement: Reviewers Meta JSON Schema

The system SHALL define a structured JSON format for reviewer metadata.

#### Scenario: Valid reviewers-meta.json structure
- **GIVEN** the `reviewers-meta.json` file exists
- **WHEN** it is read
- **THEN** it SHALL contain:
  - `schema_version`: number (currently `1`)
  - `generated_at`: ISO 8601 timestamp
  - `reviewers`: array of reviewer objects

#### Scenario: Reviewer object structure
- **GIVEN** a reviewer entry in `reviewers-meta.json`
- **WHEN** it is read
- **THEN** it SHALL contain:
  - `id`: string (filename without `.md` extension, lowercase, hyphens only)
  - `name`: string (display name)
  - `tier`: one of `holistic`, `specialist`, `persona`, `custom`
  - `icon`: string (Lucide icon name)
  - `description`: string (one-line summary of focus)
  - `focus_areas`: string array (key areas of expertise)
  - `is_default`: boolean (whether included in `default_team`)
  - `is_builtin`: boolean (whether shipped with OCR)

#### Scenario: Persona-specific fields
- **GIVEN** a reviewer entry with tier `persona`
- **WHEN** it is read
- **THEN** it SHALL additionally contain:
  - `known_for`: string (primary contribution or work)
  - `philosophy`: string (1-3 sentence philosophy summary)

#### Scenario: File location
- **GIVEN** a project with OCR installed
- **WHEN** `reviewers-meta.json` is written
- **THEN** it SHALL be located at `.ocr/reviewers-meta.json`

---

### Requirement: CLI Reviewers Sync Command

The CLI SHALL provide `ocr reviewers sync` for writing reviewer metadata, with two modes.

#### Scenario: Direct scan mode (no --stdin)
- **GIVEN** `.ocr/skills/references/reviewers/` contains `.md` files
- **WHEN** `ocr reviewers sync` is executed without `--stdin`
- **THEN** the CLI SHALL:
  - Scan all `.md` files in the reviewers directory using `generateReviewersMeta()`
  - Read `.ocr/config.yaml` for `default_team` classification
  - Write `.ocr/reviewers-meta.json` atomically (write to `.tmp`, then rename)
  - Print confirmation with the count and tier breakdown
  - Exit with code 0

#### Scenario: Stdin mode
- **GIVEN** valid `ReviewersMeta` JSON is piped to stdin
- **WHEN** `ocr reviewers sync --stdin` is executed
- **THEN** the CLI SHALL:
  - Validate the JSON against the `ReviewersMeta` schema
  - Write `.ocr/reviewers-meta.json` atomically (write to `.tmp`, then rename)
  - Print confirmation with the count of reviewers written
  - Exit with code 0

#### Scenario: Invalid schema on stdin
- **GIVEN** invalid JSON or JSON missing required fields is piped to stdin
- **WHEN** `ocr reviewers sync --stdin` is executed
- **THEN** the CLI SHALL:
  - Print a descriptive error message
  - NOT write or modify `reviewers-meta.json`
  - Exit with code 1

#### Scenario: No stdin provided
- **GIVEN** no data is piped to stdin
- **WHEN** `ocr reviewers sync --stdin` is executed without stdin
- **THEN** the CLI SHALL print an error and exit with code 1

#### Scenario: Duplicate reviewer IDs
- **GIVEN** JSON with duplicate `id` values in the `reviewers` array
- **WHEN** `ocr reviewers sync --stdin` is executed
- **THEN** the CLI SHALL reject the payload with an error

#### Scenario: No reviewer files found
- **GIVEN** `.ocr/skills/references/reviewers/` is empty or doesn't exist
- **WHEN** `ocr reviewers sync` is executed without `--stdin`
- **THEN** the CLI SHALL print a warning and exit with code 1

---

### Requirement: Sync Reviewers AI Command

The system SHALL provide `/ocr:sync-reviewers` as an AI-invoked command that combines flexible AI analysis with deterministic CLI persistence.

#### Scenario: Scan and sync reviewers
- **GIVEN** user invokes `/ocr:sync-reviewers`
- **WHEN** the AI skill executes
- **THEN** it SHALL:
  1. Read all `.md` files from `.ocr/skills/references/reviewers/`
  2. Read `.ocr/config.yaml` to identify `default_team` entries
  3. For each reviewer file, use semantic understanding to extract: name, focus areas, description (handling minor template deviations)
  4. Classify each reviewer into the correct tier
  5. Assign a Lucide icon based on the tier and role
  6. For `persona` tier, extract `known_for` and `philosophy` from blockquote header
  7. Build a `ReviewersMeta` JSON object
  8. Pipe the JSON to `ocr reviewers sync --stdin` for schema validation and atomic persistence

#### Scenario: Custom reviewer detection
- **GIVEN** a `.md` file exists in the reviewers directory that is not a built-in reviewer
- **WHEN** `/ocr:sync-reviewers` executes
- **THEN** the AI SHALL classify it as tier `custom` with `is_builtin: false`
- **AND** assign the `user` Lucide icon

#### Scenario: Sync confirmation
- **GIVEN** `/ocr:sync-reviewers` completes successfully
- **WHEN** output is displayed
- **THEN** the AI SHALL confirm: how many reviewers were synced, broken down by tier

---

## MODIFIED Requirements

### Requirement: OCR Init Includes Reviewer Sync (modified)

The `ocr init` command SHALL generate an initial `reviewers-meta.json`.

#### Scenario: Fresh initialization
- **GIVEN** user runs `ocr init` for a new project
- **WHEN** initialization completes
- **THEN** a `reviewers-meta.json` SHALL be generated for the built-in reviewers
- **AND** the file SHALL be ready for dashboard consumption without manual sync
