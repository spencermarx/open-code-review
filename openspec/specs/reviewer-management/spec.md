# reviewer-management Specification

## Purpose
Reviewer management governs the creation, configuration, and deployment of AI reviewer personas — the independent "Principal Engineers" that perform code reviews with customizable expertise areas and configurable redundancy.
## Requirements
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

### Requirement: Three-Form Default Team Schema

The system SHALL accept three forms for each persona entry under `default_team` in `.ocr/config.yaml`, picked unambiguously by YAML type, all normalizing to a canonical list of reviewer instances.

#### Scenario: Shorthand form (number)

- **GIVEN** a config entry `security: 1` under `default_team`
- **WHEN** the team is parsed
- **THEN** the parser SHALL produce one reviewer instance for `security` with `instance_index = 1`, `name = "security-1"`, and `model = null`

#### Scenario: Object form (count + optional model)

- **GIVEN** a config entry `quality: { count: 2, model: claude-haiku-4-5-20251001 }`
- **WHEN** the team is parsed
- **THEN** the parser SHALL produce two reviewer instances for `quality`, each with `model = "claude-haiku-4-5-20251001"`, `instance_index = 1` and `2` respectively, and default names `quality-1` and `quality-2`

#### Scenario: List form (per-instance configs)

- **GIVEN** a config entry `principal: [{ model: "claude-opus-4-7" }, { model: "claude-sonnet-4-6", name: "principal-balanced" }]`
- **WHEN** the team is parsed
- **THEN** the parser SHALL produce two reviewer instances:
  - First: `persona = "principal"`, `instance_index = 1`, `name = "principal-1"`, `model = "claude-opus-4-7"`
  - Second: `persona = "principal"`, `instance_index = 2`, `name = "principal-balanced"`, `model = "claude-sonnet-4-6"`

#### Scenario: Backwards compatibility with existing configs

- **GIVEN** a pre-existing `.ocr/config.yaml` containing `default_team: { principal: 2, quality: 2 }` authored against a prior OCR version
- **WHEN** the new parser runs
- **THEN** the resolved composition SHALL contain four reviewer instances (two `principal-*`, two `quality-*`), all with `model = null`
- **AND** no migration step SHALL be required

#### Scenario: Mixing forms within a single entry is rejected

- **GIVEN** a config entry `principal: { count: 2, instances: [{ model: "claude-opus-4-7" }] }`
- **WHEN** the team is parsed
- **THEN** the parser SHALL reject the entry with a clear error identifying the offending key
- **AND** SHALL NOT silently coerce one form into another

---

### Requirement: Reviewer Instance Addressability

The system SHALL assign each reviewer instance a stable, addressable identity composed of its persona and an instance index, with optional user override of the instance name.

#### Scenario: Default instance naming

- **GIVEN** a parsed team with two `principal` instances and no explicit `name` overrides
- **WHEN** instance names are derived
- **THEN** the names SHALL be `principal-1` and `principal-2`

#### Scenario: User-supplied instance name override

- **GIVEN** a list-form entry `principal: [{ model: "claude-opus-4-7", name: "principal-architect-lens" }]`
- **WHEN** the team is parsed
- **THEN** the resulting instance's `name` SHALL be `principal-architect-lens`

#### Scenario: Instance index uniqueness within a persona

- **GIVEN** a parsed team with multiple instances of the same persona
- **WHEN** instance indices are inspected
- **THEN** indices SHALL be sequential starting at 1 within each `(persona)` group

---

### Requirement: Per-Instance Model Assignment

The system SHALL allow each reviewer instance to be assigned a model identifier (vendor-native string or user-defined alias) which, when present, SHALL be passed to the host AI CLI's per-task model override mechanism.

#### Scenario: Model resolution chain

- **GIVEN** a reviewer instance with no explicit `model` field
- **WHEN** the model is resolved
- **THEN** the system SHALL consult, in order:
  1. The instance's own `model` field
  2. The team-level `model` field, when present
  3. `models.default` from `.ocr/config.yaml`, when present
  4. None — no `--model` flag is passed and the host CLI's own default applies

#### Scenario: User-defined alias expansion

- **GIVEN** `models.aliases.workhorse: claude-sonnet-4-6` in config and a reviewer instance with `model: workhorse`
- **WHEN** the team is resolved
- **THEN** the instance's `resolved_model` SHALL be `claude-sonnet-4-6`

#### Scenario: Vendor-native model identifier

- **GIVEN** a reviewer instance with `model: claude-opus-4-7` (no alias defined)
- **WHEN** the team is resolved
- **THEN** the instance's `resolved_model` SHALL be `claude-opus-4-7` and SHALL be passed verbatim to the active adapter

#### Scenario: Model is not a property of the persona file

- **GIVEN** a reviewer markdown file at `.ocr/skills/references/reviewers/principal.md`
- **WHEN** the file is inspected
- **THEN** it SHALL NOT contain a `model:` frontmatter field
- **AND** model selection SHALL live exclusively in `default_team` and team overrides

---

### Requirement: Reviewers Catalog Excludes Deployment Configuration

The system SHALL keep `reviewers-meta.json` (the catalog of available reviewers) free of model or instance configuration; that data lives only in the resolved team composition.

#### Scenario: reviewers-meta.json schema unchanged for new fields

- **GIVEN** a workspace with the three-form schema in use
- **WHEN** `reviewers-meta.json` is generated
- **THEN** each `ReviewerMeta` row SHALL contain only persona-intrinsic fields (id, name, tier, icon, description, focus_areas, is_default, is_builtin, plus persona-only `known_for`/`philosophy`)
- **AND** SHALL NOT contain a `model` or `instances` field

#### Scenario: is_default reflects "this persona is in the team"

- **GIVEN** `default_team` lists `principal` with count 2 (in any of the three forms)
- **WHEN** `reviewers-meta.json` is generated
- **THEN** the `principal` reviewer's `is_default` SHALL be `true`
- **AND** the dashboard SHALL be free to display "in default team ×2" using both this flag and a separate query for instance count

