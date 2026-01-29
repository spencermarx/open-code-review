## ADDED Requirements

### Requirement: Command-Agnostic Discovery

The context discovery workflow SHALL be shared identically by all OCR commands that require project context, including `/ocr:review` and `/ocr:map`.

#### Scenario: Map command uses same discovery
- **GIVEN** user invokes `/ocr:map`
- **WHEN** context discovery phase executes
- **THEN** the system SHALL use the identical discovery algorithm as `/ocr:review`

#### Scenario: Shared session context
- **GIVEN** a session has `discovered-standards.md` from a prior command
- **WHEN** another command runs in the same session
- **THEN** the system SHALL reuse the existing discovered context without re-discovery

---

### Requirement: Exhaustive Discovery Depth

The context discovery process SHALL be thorough and exhaustive, reading complete file contents without summarization or skipping.

#### Scenario: Complete file reading
- **GIVEN** a file is in the discovery sources
- **WHEN** the file is processed
- **THEN** the system SHALL:
  - Read the complete file contents
  - NOT skip sections or summarize content
  - Include all content in the merged output with source attribution

#### Scenario: OpenSpec specs inclusion
- **GIVEN** OpenSpec discovery is enabled
- **WHEN** context is gathered
- **THEN** the system SHALL read ALL spec files in `openspec/specs/**/*.md` for full architectural context

#### Scenario: Active changes awareness
- **GIVEN** OpenSpec discovery is enabled
- **WHEN** context is gathered
- **THEN** the system SHALL include active change proposals from `openspec/changes/**/*.md` for awareness of in-flight work
