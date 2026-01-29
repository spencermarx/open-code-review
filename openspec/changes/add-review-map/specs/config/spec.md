## ADDED Requirements

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
