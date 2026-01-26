# Reviewer Management

Reviewer personas, configuration, and interactive management.

## ADDED Requirements

### Requirement: Default Reviewer Personas

The system SHALL provide four default reviewer personas with distinct expertise areas.

#### Scenario: Principal Engineer persona
- **GIVEN** the principal reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on:
  - Architecture and cohesion
  - Composition and structure
  - Simplicity and patterns
  - Net impact on codebase

#### Scenario: Security Engineer persona
- **GIVEN** the security reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on:
  - Input validation and injection risks
  - Authentication and authorization
  - Data protection and secrets
  - Error handling information leakage

#### Scenario: Quality Engineer persona
- **GIVEN** the quality reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on:
  - Readability and maintainability
  - Consistency with codebase conventions
  - Error handling and edge cases
  - Documentation and clarity

#### Scenario: Testing Engineer persona
- **GIVEN** the testing reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on:
  - Test coverage and gaps
  - Test quality (behavior vs implementation)
  - Edge cases and boundaries
  - Testability of code structure

---

### Requirement: Reviewer Persona Structure

Each reviewer persona SHALL be defined as a markdown file with standard sections.

#### Scenario: Persona file structure
- **GIVEN** a reviewer persona file exists
- **WHEN** the file is read
- **THEN** it SHALL contain:
  - Identity (background and perspective)
  - Focus areas (what to look for)
  - How You Review (approach and principles)
  - Project Standards reminder

#### Scenario: Persona location
- **GIVEN** a reviewer named `{name}`
- **WHEN** loading the persona
- **THEN** the system SHALL read from `.ocr/skills/references/reviewers/{name}.md`

---

### Requirement: Redundancy Configuration

The system SHALL support configurable redundancy at default and per-reviewer levels.

#### Scenario: Default redundancy
- **GIVEN** `config.yaml` specifies `default_redundancy: 1`
- **WHEN** a reviewer without explicit redundancy is spawned
- **THEN** the reviewer SHALL run 1 time

#### Scenario: Per-reviewer redundancy
- **GIVEN** `config.yaml` specifies `reviewer_redundancy: security: 2`
- **WHEN** the security reviewer is spawned
- **THEN** the security reviewer SHALL run 2 times

#### Scenario: Runtime redundancy override
- **GIVEN** user specifies `--redundancy 3`
- **WHEN** any reviewer is spawned
- **THEN** all reviewers SHALL run 3 times, overriding config

---

### Requirement: List Reviewers Command

The system SHALL provide `/ocr:reviewers` to list all available reviewers.

#### Scenario: List reviewers with config
- **GIVEN** user invokes `/ocr:reviewers`
- **WHEN** command executes
- **THEN** the system SHALL display:
  - Each reviewer name
  - Focus summary
  - Redundancy setting
  - Whether reviewer is custom or default

---

### Requirement: Interactive Reviewer Creation

The system SHALL provide `/ocr:add-reviewer` for interactive reviewer creation.

#### Scenario: Add reviewer flow
- **GIVEN** user invokes `/ocr:add-reviewer performance`
- **WHEN** the interactive flow begins
- **THEN** the system SHALL ask (one at a time):
  1. What should the reviewer focus on?
  2. What specific things should they look for?
  3. What's their background/perspective?
  4. Any tools, metrics, or standards to reference?
  5. What redundancy level? (1=default, 2+=critical)

#### Scenario: Preview before save
- **GIVEN** user has answered all questions
- **WHEN** persona is generated
- **THEN** the system SHALL:
  - Show preview of generated persona
  - Ask for confirmation before saving

#### Scenario: Save new reviewer
- **GIVEN** user confirms the persona
- **WHEN** save executes
- **THEN** the system SHALL:
  - Save to `.ocr/skills/references/reviewers/{name}.md`
  - Update `config.yaml` if redundancy > 1
  - Confirm creation to user

#### Scenario: Prevent duplicate
- **GIVEN** user invokes `/ocr:add-reviewer security`
- **WHEN** security.md already exists
- **THEN** the system SHALL suggest `/ocr:edit-reviewer security` instead

---

### Requirement: Interactive Reviewer Editing

The system SHALL provide `/ocr:edit-reviewer` for modifying existing reviewers.

#### Scenario: Edit reviewer flow
- **GIVEN** user invokes `/ocr:edit-reviewer security`
- **WHEN** security.md exists
- **THEN** the system SHALL:
  - Load and display current persona
  - Ask what to change (focus, perspective, redundancy, etc.)
  - Apply changes based on feedback
  - Show preview and confirm before saving

#### Scenario: Handle missing reviewer
- **GIVEN** user invokes `/ocr:edit-reviewer unknown`
- **WHEN** unknown.md does not exist
- **THEN** the system SHALL suggest `/ocr:add-reviewer unknown` instead

---

### Requirement: Reviewer Template

The system SHALL provide a template for creating new reviewers.

#### Scenario: Template usage
- **GIVEN** `/ocr:add-reviewer` is creating a new persona
- **WHEN** generating the persona file
- **THEN** the system SHALL use the template from `.ocr/skills/assets/reviewer-template.md`

#### Scenario: Template structure
- **GIVEN** the reviewer template exists
- **WHEN** it is read
- **THEN** it SHALL contain placeholders for:
  - Name
  - Identity/background
  - Focus areas
  - Review approach
  - Project standards reminder
