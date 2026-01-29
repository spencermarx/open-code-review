## ADDED Requirements

### Requirement: Map Command

The system SHALL provide `/ocr:map` as the command for generating code review maps.

#### Scenario: Command structure
- **GIVEN** user wants to generate a review map
- **WHEN** they invoke `/ocr:map`
- **THEN** the command SHALL accept:
  - Optional target: `staged` (default), `HEAD~N..HEAD`, `pr <number>`, or `<commit-range>`
  - Optional requirements reference (inline or document path)
  - Optional `--summary` flag for condensed output on large change sets

#### Scenario: Help text
- **GIVEN** user invokes `/ocr:map --help` or views command in `/help`
- **WHEN** help is displayed
- **THEN** it SHALL show:
  - Command description explaining the review map purpose
  - Argument hints for target and requirements
  - Examples of common usage patterns

#### Scenario: Map staged changes (default)
- **GIVEN** user invokes `/ocr:map` without arguments
- **WHEN** staged changes exist in the repository
- **THEN** the system SHALL generate a review map for staged changes

#### Scenario: Map commit range
- **GIVEN** user invokes `/ocr:map HEAD~5..HEAD`
- **WHEN** the commit range is valid
- **THEN** the system SHALL generate a review map for the specified range

#### Scenario: Map pull request
- **GIVEN** user invokes `/ocr:map pr 123`
- **WHEN** PR #123 exists and `gh` CLI is available
- **THEN** the system SHALL generate a review map for the pull request diff

#### Scenario: Map with requirements
- **GIVEN** user invokes `/ocr:map` with requirements context
- **WHEN** requirements are provided inline or by reference
- **THEN** the system SHALL include requirements mapping in the output
