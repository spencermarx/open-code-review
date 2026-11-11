# context-discovery Specification

## Purpose
Context discovery automatically locates and merges project standards, rules, and configuration from known sources (CLAUDE.md, AGENTS.md, .cursorrules, OpenSpec, etc.) to provide reviewers with project-specific awareness during code review.
## Requirements
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

---

### Requirement: Cross-Harness Context Discovery

When multiple AI coding harnesses are configured in the project, context discovery SHALL treat `AGENTS.md` as the canonical source of truth and recognize that different harnesses read different native files. Discovery SHALL NOT assume a harness reads a file another harness ignores. This ensures that shared project instructions (code conventions, release process, managed blocks) authored in the canonical context are always accessible regardless of which harness is performing the discovery.

#### Scenario: OpenCode reads AGENTS.md, not CLAUDE.md
- **GIVEN** a project has both `AGENTS.md` and `CLAUDE.md`
- **WHEN** OpenCode performs context discovery
- **THEN** OpenCode SHALL read `AGENTS.md` and SHALL NOT attempt to read `CLAUDE.md` as its context source

#### Scenario: Projection keeps every harness current
- **GIVEN** shared project context is updated in `AGENTS.md`
- **WHEN** the cross-harness sync runs (e.g., `npx ocr update`)
- **THEN** all native instruction files (`CLAUDE.md`, `.windsurfrules`, etc.) SHALL be regenerated from `AGENTS.md` so that every harness sees the latest context

#### Scenario: Discovery resolves through projection
- **GIVEN** `AGENTS.md` is the canonical source and `CLAUDE.md` is an `@AGENTS.md` import pointer
- **WHEN** a harness discovers project context
- **THEN** the harness SHALL resolve the same shared instructions regardless of whether it reads `AGENTS.md` directly or through the `CLAUDE.md` import
