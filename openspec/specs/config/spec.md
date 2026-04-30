# config Specification

## Purpose
TBD - created by archiving change add-review-map. Update Purpose after archive.
## Requirements
### Requirement: Code Review Map Configuration

The system SHALL support a `code-review-map` configuration section in `.ocr/config.yaml` that allows users to customize map generation behavior, including agent redundancy settings.

#### Scenario: Default configuration
- **GIVEN** user has not configured `code-review-map` in their config
- **WHEN** map generation runs
- **THEN** the system SHALL use default values:
  - `flow_analysts: 2`
  - `requirements_mappers: 2`

#### Scenario: Custom redundancy configuration
- **GIVEN** user configures `code-review-map` with custom redundancy values
- **WHEN** config contains:
  ```yaml
  code-review-map:
    agents:
      flow_analysts: 3
      requirements_mappers: 3
  ```
- **THEN** the system SHALL spawn the configured number of each agent type

#### Scenario: Large codebase optimization
- **GIVEN** user has a very large codebase with complex dependencies
- **WHEN** user increases redundancy to enhance accuracy:
  ```yaml
  code-review-map:
    agents:
      flow_analysts: 4
      requirements_mappers: 4
  ```
- **THEN** the system SHALL:
  - Spawn 4 Flow Analysts for parallel dependency tracing
  - Spawn 4 Requirements Mappers for parallel requirements coverage
  - Aggregate findings with higher confidence thresholds

#### Scenario: Minimal configuration for speed
- **GIVEN** user wants faster map generation with less redundancy
- **WHEN** user reduces redundancy:
  ```yaml
  code-review-map:
    agents:
      flow_analysts: 1
      requirements_mappers: 1
  ```
- **THEN** the system SHALL spawn single agents (no redundancy validation)

#### Scenario: Configuration validation
- **GIVEN** user provides invalid redundancy values
- **WHEN** config contains values < 1 or > 10
- **THEN** the system SHALL:
  - Log a warning about invalid configuration
  - Fall back to default values
  - Continue with map generation

---

### Requirement: Configuration Schema

The `code-review-map` configuration section SHALL follow a well-defined schema consistent with other OCR configuration sections.

#### Scenario: Full configuration example
- **GIVEN** user wants to see all available options
- **WHEN** viewing the config template
- **THEN** the template SHALL show:
  ```yaml
  # ─────────────────────────────────────────────────────────────────────────────
  # CODE REVIEW MAP
  # ─────────────────────────────────────────────────────────────────────────────
  # Configuration for the /ocr:map command.
  # Increase agent redundancy for large codebases to improve accuracy.
  # Note: Map is a standalone tool for humans; review command works independently.

  code-review-map:
    # Agent redundancy settings
    agents:
      flow_analysts: 2         # Number of Flow Analyst agents (1-10, default: 2)
      requirements_mappers: 2  # Number of Requirements Mapper agents (1-10, default: 2)
  ```

#### Scenario: Partial configuration
- **GIVEN** user only specifies some options
- **WHEN** config contains:
  ```yaml
  code-review-map:
    agents:
      flow_analysts: 3
  ```
- **THEN** the system SHALL:
  - Use the specified value for `flow_analysts` (3)
  - Use default value for `requirements_mappers` (2)

### Requirement: Three-Form `default_team` Schema

The system SHALL accept three forms for each persona entry under `default_team` in `.ocr/config.yaml`, picked unambiguously by YAML type, with full backwards compatibility for existing single-number entries.

#### Scenario: Existing shorthand-form configs continue to work

- **GIVEN** a pre-existing `.ocr/config.yaml`:
  ```yaml
  default_team:
    principal: 2
    quality: 2
  ```
- **WHEN** OCR reads the config under the new schema
- **THEN** parsing SHALL succeed without modification
- **AND** the resolved team SHALL produce two `principal` and two `quality` instances, each with `model = null`

#### Scenario: Object-form entries are accepted

- **GIVEN** a config containing `quality: { count: 2, model: claude-haiku-4-5-20251001 }`
- **WHEN** OCR parses the team
- **THEN** parsing SHALL succeed
- **AND** the two resulting `quality` instances SHALL share the configured model

#### Scenario: List-form entries are accepted

- **GIVEN** a config containing:
  ```yaml
  principal:
    - { model: claude-opus-4-7 }
    - { model: claude-sonnet-4-6, name: "principal-balanced" }
  ```
- **WHEN** OCR parses the team
- **THEN** parsing SHALL succeed
- **AND** the resulting two instances SHALL have distinct models and the second SHALL have the user-supplied name

#### Scenario: Mixing forms within an entry is rejected at parse time

- **GIVEN** an invalid entry combining count and instances within one persona key
- **WHEN** OCR parses the team
- **THEN** parsing SHALL fail with an error identifying the offending key and explaining that one form per entry is required

---

### Requirement: Optional User-Defined Model Aliases

The system SHALL support an optional `models` section in `.ocr/config.yaml` for user-defined model aliases and a default fallback model. OCR SHALL ship zero entries in this section.

#### Scenario: Aliases expand at parse time

- **GIVEN** a config:
  ```yaml
  models:
    aliases:
      workhorse: claude-sonnet-4-6
      big-brain: claude-opus-4-7
  default_team:
    principal: { count: 2, model: big-brain }
  ```
- **WHEN** OCR resolves the team
- **THEN** each principal instance's `resolved_model` SHALL be `claude-opus-4-7`

#### Scenario: Default model is used when no alias and no instance model is given

- **GIVEN** a config:
  ```yaml
  models:
    default: claude-sonnet-4-6
  default_team:
    quality: 2
  ```
- **WHEN** OCR resolves the team
- **THEN** each `quality` instance's `resolved_model` SHALL be `claude-sonnet-4-6`

#### Scenario: No `models` section means no `--model` flag is passed

- **GIVEN** a config with no `models` section and a team entry like `principal: 2`
- **WHEN** OCR resolves the team
- **THEN** each instance's `resolved_model` SHALL be `null`
- **AND** no `--model` flag SHALL be passed to the host CLI for that instance
- **AND** the host CLI's own default model SHALL apply

#### Scenario: OCR ships zero alias entries

- **GIVEN** a freshly initialized workspace (`ocr init` just run)
- **WHEN** the shipped `.ocr/config.yaml` template is inspected
- **THEN** the `models.aliases` map SHALL be empty (or commented out as an optional example)
- **AND** OCR SHALL NOT define logical aliases like `fast`/`balanced`/`strong`

---

### Requirement: Configurable Heartbeat Threshold

The system SHALL support an optional `runtime.agent_heartbeat_seconds` setting in `.ocr/config.yaml` that overrides the default agent-session heartbeat threshold.

#### Scenario: Default threshold

- **GIVEN** a config with no `runtime.agent_heartbeat_seconds` setting
- **WHEN** the system evaluates agent-session liveness
- **THEN** the threshold SHALL default to 60 seconds

#### Scenario: User override

- **GIVEN** a config containing `runtime: { agent_heartbeat_seconds: 120 }`
- **WHEN** the system evaluates agent-session liveness
- **THEN** the threshold SHALL be 120 seconds

#### Scenario: Invalid value falls back to default

- **GIVEN** a config containing `runtime: { agent_heartbeat_seconds: "not-a-number" }`
- **WHEN** the system loads the config
- **THEN** a warning SHALL be logged
- **AND** the threshold SHALL fall back to the default of 60 seconds

