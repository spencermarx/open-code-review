# Context Discovery

Automatic discovery and loading of project standards from configuration files.

## ADDED Requirements

### Requirement: Automatic Context Discovery

The system SHALL automatically discover and load project context from known configuration files at the start of every review.

#### Scenario: Discover CLAUDE.md
- **GIVEN** a project contains `CLAUDE.md` at the root
- **WHEN** context discovery runs
- **THEN** the system SHALL read and include CLAUDE.md contents in project context

#### Scenario: Discover AGENTS.md
- **GIVEN** a project contains `AGENTS.md` at the root
- **WHEN** context discovery runs
- **THEN** the system SHALL read and include AGENTS.md contents in project context

#### Scenario: Discover .cursorrules
- **GIVEN** a project contains `.cursorrules` at the root
- **WHEN** context discovery runs
- **THEN** the system SHALL read and include .cursorrules contents in project context

#### Scenario: Discover .windsurfrules
- **GIVEN** a project contains `.windsurfrules` at the root
- **WHEN** context discovery runs
- **THEN** the system SHALL read and include .windsurfrules contents in project context

#### Scenario: Discover copilot-instructions
- **GIVEN** a project contains `.github/copilot-instructions.md`
- **WHEN** context discovery runs
- **THEN** the system SHALL read and include the file contents in project context

#### Scenario: Discover OpenSpec project.md
- **GIVEN** a project contains `openspec/project.md` or `.openspec/project.md`
- **WHEN** context discovery runs
- **THEN** the system SHALL read and include the file contents in project context

#### Scenario: Discover CONTRIBUTING.md
- **GIVEN** a project contains `CONTRIBUTING.md` at the root
- **WHEN** context discovery runs
- **THEN** the system SHALL read and include CONTRIBUTING.md contents in project context

---

### Requirement: OCR-Specific Standards

The system SHALL support project-specific context and rules in `.ocr/config.yaml`.

#### Scenario: Load project config
- **GIVEN** `.ocr/config.yaml` exists with `context:` and `rules:` sections
- **WHEN** context discovery runs
- **THEN** the system SHALL read and include the config content with highest priority

#### Scenario: Config-based context priority
- **GIVEN** `.ocr/config.yaml` exists
- **WHEN** context is merged
- **THEN** OCR config context and rules SHALL have highest priority

---

### Requirement: Context Merging

The system SHALL merge all discovered context into a unified document with source attribution.

#### Scenario: Merge with attribution
- **GIVEN** multiple context files are discovered
- **WHEN** context is merged
- **THEN** the merged document SHALL:
  - Include contents from each source
  - Label each section with source filename
  - Follow priority order for conflict resolution

#### Scenario: Priority order
- **GIVEN** context sources may conflict
- **WHEN** priority is evaluated
- **THEN** sources SHALL be prioritized:
  1. `.ocr/config.yaml` context and rules (highest)
  2. `openspec/config.yaml` context (if enabled)
  3. `AGENTS.md`, `CLAUDE.md`
  4. `.cursorrules`, `.windsurfrules`, `copilot-instructions.md`
  5. `CONTRIBUTING.md` (lowest)

#### Scenario: Save merged context
- **GIVEN** context has been merged
- **WHEN** review session is created
- **THEN** the merged context SHALL be saved to `.ocr/sessions/{id}/discovered-standards.md`

---

### Requirement: Context Injection

The system SHALL inject discovered context into every reviewer Task.

#### Scenario: Reviewer receives context
- **GIVEN** project context has been discovered and merged
- **WHEN** a reviewer Task is spawned
- **THEN** the reviewer SHALL receive the merged context with instructions to evaluate code against these standards

#### Scenario: Flag standard violations
- **GIVEN** a reviewer has received project context
- **WHEN** the reviewer finds code that violates a discovered standard
- **THEN** the reviewer SHALL note which specific standard was violated

---

### Requirement: Zero-Config Graceful Degradation

The system SHALL work without any context files, using default best practices.

#### Scenario: No context files found
- **GIVEN** a project has no recognized context files
- **WHEN** context discovery runs
- **THEN** the system SHALL:
  - Complete successfully without error
  - Proceed with review using reviewer personas and best practices
  - Note in session that no project-specific context was discovered

#### Scenario: Partial context
- **GIVEN** only some context files exist
- **WHEN** context discovery runs
- **THEN** the system SHALL use whatever files are available
