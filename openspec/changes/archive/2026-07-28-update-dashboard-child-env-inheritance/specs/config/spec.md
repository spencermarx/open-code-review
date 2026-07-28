# Config Spec Delta — Dashboard Settings Parsing

## ADDED Requirements

### Requirement: Dashboard Settings Parsing

The shared config layer SHALL provide `readDashboardConfig(ocrDir)` parsing
the `dashboard` section of `.ocr/config.yaml` with the real YAML parser
(replacing the dashboard app's regex-over-raw-YAML read of
`dashboard.ai_cli`). It SHALL return typed defaults (`aiCli: "auto"`) when
the file or section is missing or malformed, and SHALL never throw on
malformed input. A `dashboard.env_passthrough` key — proposed in unmerged
PR #56 and never released — SHALL be ignored with exactly one startup
notice, SHALL never cause an error, and SHALL NOT appear in the
`DashboardConfig` type.

#### Scenario: ai_cli preference parsed

- **GIVEN** `.ocr/config.yaml` contains `dashboard.ai_cli: opencode`
- **WHEN** the dashboard starts
- **THEN** `readDashboardConfig` SHALL return `aiCli: "opencode"`
- **AND** an invalid value SHALL fall back to `"auto"`

#### Scenario: Missing or malformed config falls back safely

- **GIVEN** `.ocr/config.yaml` is absent or fails to parse
- **WHEN** `readDashboardConfig` is called
- **THEN** it SHALL return defaults without throwing
- **AND** malformed YAML SHALL produce a stderr notice without exposing file
  contents

#### Scenario: Retired env_passthrough key warns once and is ignored

- **GIVEN** `.ocr/config.yaml` contains
  `dashboard.env_passthrough: [AWS_REGION]`
- **WHEN** the dashboard starts
- **THEN** exactly one notice SHALL state the key is no longer needed
  (children now inherit the shell environment) and can be deleted
- **AND** startup SHALL proceed normally
- **AND** `AWS_REGION` SHALL flow to children via inheritance regardless
