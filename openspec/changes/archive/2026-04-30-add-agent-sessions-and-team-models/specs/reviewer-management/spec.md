# reviewer-management Spec Delta

## ADDED Requirements

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
