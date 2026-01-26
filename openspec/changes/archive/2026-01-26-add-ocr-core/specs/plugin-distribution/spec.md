# Plugin Distribution

Installation, packaging, and cross-tool portability.

## ADDED Requirements

### Requirement: Claude Code Plugin Structure

The system SHALL be packaged as a Claude Code plugin following the standard structure.

#### Scenario: Plugin manifest
- **GIVEN** OCR is packaged as a plugin
- **WHEN** the package is inspected
- **THEN** it SHALL contain `.claude-plugin/plugin.json` with:
  - name: "open-code-review"
  - version: semantic version
  - description
  - author information

#### Scenario: Plugin directory layout
- **GIVEN** OCR plugin is installed
- **WHEN** the directory is inspected
- **THEN** it SHALL contain:
  - `.claude-plugin/plugin.json` - Plugin manifest
  - `skills/ocr/SKILL.md` - Required skill definition
  - `skills/ocr/scripts/` - Optional executable code
  - `skills/ocr/references/` - Optional documentation
  - `skills/ocr/assets/` - Optional templates and resources
  - `commands/ocr/` - Slash commands
  - `README.md` - Documentation

---

### Requirement: Plugin Marketplace Installation

The system SHALL support installation via Claude Code plugin marketplace.

#### Scenario: Marketplace install
- **GIVEN** OCR is published to a marketplace
- **WHEN** user invokes `/plugin install ocr@open-code-review`
- **THEN** the system SHALL:
  - Download the plugin
  - Install to appropriate location
  - Make commands available

#### Scenario: Post-install verification
- **GIVEN** plugin installation completes
- **WHEN** user runs `/ocr:doctor`
- **THEN** the system SHALL confirm successful installation

---

### Requirement: Git Clone Installation

The system SHALL support installation via git clone for project-local or user-global use.

#### Scenario: Project-local installation
- **GIVEN** user wants OCR for a specific project
- **WHEN** they run `npx @open-code-review/cli init`
- **THEN** OCR SHALL be installed to `.ocr/` and available in that project

#### Scenario: User-global installation
- **GIVEN** user wants OCR available everywhere
- **WHEN** they run `npx @open-code-review/cli init` in each project
- **THEN** OCR SHALL be available in those projects

#### Scenario: Update via git pull
- **GIVEN** OCR was installed via git clone
- **WHEN** user runs `git pull` in the OCR directory
- **THEN** OCR SHALL be updated to the latest version

---

### Requirement: Agent Skills Standard Compliance

The system SHALL comply with the Agent Skills standard for cross-tool portability.

#### Scenario: SKILL.md format
- **GIVEN** the OCR skill is defined
- **WHEN** SKILL.md is inspected
- **THEN** it SHALL contain:
  - YAML frontmatter with required fields: `name`, `description`
  - YAML frontmatter with optional fields: `license`, `compatibility`, `metadata`
  - `name` field matching parent directory name (`ocr`)
  - `name` field using lowercase letters, numbers, and hyphens only
  - `description` field under 1024 characters describing what and when to use
  - Markdown body with instructions under 500 lines

#### Scenario: Slash command format
- **GIVEN** slash commands are defined
- **WHEN** command files are inspected
- **THEN** they SHALL contain:
  - YAML frontmatter with name, description, argument-hint
  - Markdown body with execution instructions

#### Scenario: Tool independence
- **GIVEN** OCR is designed for portability
- **WHEN** the implementation is reviewed
- **THEN** it SHALL:
  - Use only standard tools (Bash, Read, Write, Glob, Grep, Task)
  - Not depend on Claude Code-specific features beyond Agent Skills

---

### Requirement: Progressive Disclosure

The system SHALL follow the Agent Skills progressive disclosure pattern for efficient context usage.

#### Scenario: Metadata loading
- **GIVEN** an agent discovers OCR skill
- **WHEN** initial discovery occurs
- **THEN** only `name` and `description` fields (~100 tokens) SHALL be loaded

#### Scenario: Skill activation
- **GIVEN** a task matches the OCR skill description
- **WHEN** the skill is activated
- **THEN** the full SKILL.md body SHALL be loaded (<5000 tokens recommended)

#### Scenario: Resource loading
- **GIVEN** the skill is activated and executing
- **WHEN** detailed instructions are needed
- **THEN** files in `references/` and `scripts/` SHALL be loaded on-demand

#### Scenario: SKILL.md size constraint
- **GIVEN** SKILL.md is authored
- **WHEN** the file is validated
- **THEN** the body SHOULD be under 500 lines with detailed content in `references/`

---

### Requirement: Cross-Platform Installation

The system SHALL support installation across all major Agent Skills-compatible platforms.

#### Scenario: Cursor installation
- **GIVEN** user wants OCR in Cursor
- **WHEN** they run the installer with `--platform cursor`
- **THEN** the system SHALL:
  - Create `.cursor/skills/ocr` symlink or copy
  - Create `.cursor/commands/ocr` symlink or copy
  - Skills SHALL be discoverable via tool-specific command/skill paths

#### Scenario: Windsurf installation
- **GIVEN** user wants OCR in Windsurf
- **WHEN** they run the installer with `--platform windsurf`
- **THEN** the system SHALL:
  - Create `.windsurf/skills/ocr` symlink or copy
  - Create `.windsurf/workflows/` with OCR workflow files
  - Skills SHALL be invocable via `@ocr` or natural language

#### Scenario: Codex CLI installation
- **GIVEN** user wants OCR in Codex CLI
- **WHEN** they copy skills to `.codex/skills/`
- **THEN** OCR SHALL be available via natural language

#### Scenario: Multi-platform installation
- **GIVEN** user wants OCR in all platforms
- **WHEN** they run the installer with `--platform all`
- **THEN** the system SHALL install for Claude Code, Cursor, and Windsurf

---

### Requirement: Universal Installer Script

The system SHALL provide a universal installer script for cross-platform setup.

#### Scenario: Installer execution
- **GIVEN** user clones the OCR repository
- **WHEN** they run `./install.sh --platform <platform>`
- **THEN** the installer SHALL:
  - Accept platform argument (claude, cursor, windsurf, all)
  - Accept optional target directory argument
  - Create appropriate directory structure
  - Create symlinks to source files
  - Display success confirmation

#### Scenario: Installer help
- **GIVEN** user runs installer with invalid arguments
- **WHEN** the installer is invoked
- **THEN** it SHALL display usage instructions

---

### Requirement: Windsurf Workflow Files

The system SHALL provide Windsurf-compatible workflow files for slash command invocation.

#### Scenario: Workflow file structure
- **GIVEN** OCR includes Windsurf workflows
- **WHEN** the `workflows/` directory is inspected
- **THEN** it SHALL contain:
  - `ocr-review.md` - Full review workflow
  - `ocr-doctor.md` - Diagnostics workflow
  - `ocr-add-reviewer.md` - Reviewer creation workflow

#### Scenario: Workflow invocation
- **GIVEN** OCR workflows are installed in Windsurf
- **WHEN** user types `/ocr-review`
- **THEN** the workflow SHALL invoke the OCR skill and follow the review process

---

### Requirement: Platform Compatibility Matrix

The system SHALL document supported features per platform.

#### Scenario: Feature documentation
- **GIVEN** OCR README exists
- **WHEN** compatibility section is read
- **THEN** it SHALL document:
  - Full support features per platform
  - Degraded features per platform
  - Fallback behavior for unsupported features

#### Scenario: Slash command compatibility
- **GIVEN** OCR is installed
- **WHEN** slash commands are invoked
- **THEN**:
  - Claude Code: `/ocr:command` format
  - Cursor: `/command-name` format
  - Windsurf: `/workflow-name` format
  - Codex/Copilot: Natural language fallback

---

### Requirement: No Runtime Dependencies

The system SHALL have no external runtime dependencies.

#### Scenario: Pure markdown implementation
- **GIVEN** OCR is installed
- **WHEN** it runs
- **THEN** it SHALL NOT require:
  - Node.js
  - Python
  - Ruby
  - Or any other runtime beyond the AI tool itself

#### Scenario: Shell command compatibility
- **GIVEN** OCR uses shell commands
- **WHEN** commands are executed
- **THEN** they SHALL use only standard Unix utilities:
  - git (required)
  - gh (optional, for GitHub features)
  - Basic shell builtins (ls, cat, mkdir, etc.)

---

### Requirement: Documentation

The system SHALL include comprehensive documentation.

#### Scenario: README content
- **GIVEN** the README.md exists
- **WHEN** it is read
- **THEN** it SHALL include:
  - Overview and features
  - Installation instructions (marketplace and git clone)
  - Quick start guide
  - Configuration reference
  - Customization instructions

#### Scenario: Inline documentation
- **GIVEN** reference documents exist in `skills/ocr/reference/`
- **WHEN** they are read
- **THEN** each SHALL be self-documenting and understandable by AI and humans

---

### Requirement: Version Management

The system SHALL support semantic versioning.

#### Scenario: Version in manifest
- **GIVEN** OCR has a version
- **WHEN** plugin.json is inspected
- **THEN** version SHALL follow semantic versioning (e.g., "1.0.0")

#### Scenario: Changelog
- **GIVEN** OCR is updated
- **WHEN** new versions are released
- **THEN** a CHANGELOG.md SHOULD document changes

---

### Requirement: Graceful Feature Degradation

The system SHALL gracefully degrade when optional features are unavailable.

#### Scenario: GitHub CLI unavailable
- **GIVEN** user invokes `/ocr:review pr 123` or `/ocr:post`
- **WHEN** `gh` CLI is not installed
- **THEN** the system SHALL:
  - Display a clear error message
  - Suggest installation instructions
  - Continue with available features

#### Scenario: Doctor warnings
- **GIVEN** optional dependencies are missing
- **WHEN** `/ocr:doctor` runs
- **THEN** it SHALL display warnings (not errors) for optional features
