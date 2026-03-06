# cli Specification

## Purpose
TBD - created by archiving change add-ocr-cli. Update Purpose after archive.
## Requirements
### Requirement: CLI Package Distribution

The CLI SHALL be distributed as an npm package (`@open-code-review/cli`) that can be executed via `npx`, `pnpm dlx`, or global installation.

#### Scenario: Execute via npx

- **GIVEN** the package is published to npm
- **WHEN** user runs `npx @open-code-review/cli --help`
- **THEN** the CLI help message is displayed

#### Scenario: Execute via global install

- **GIVEN** user runs `npm install -g @open-code-review/cli`
- **WHEN** user runs `ocr --help`
- **THEN** the CLI help message is displayed

#### Scenario: Execute via pnpm dlx

- **GIVEN** the package is published to npm
- **WHEN** user runs `pnpm dlx @open-code-review/cli init`
- **THEN** the init command executes

---

### Requirement: Init Command

The CLI SHALL provide an `init` command that configures OCR for one or more AI coding environments.

#### Scenario: Interactive tool selection

- **GIVEN** user runs `ocr init` in a TTY terminal
- **WHEN** the prompt appears
- **THEN** user can select multiple AI tools via checkbox interface
- **AND** previously configured tools are pre-selected

#### Scenario: Non-interactive with tools flag

- **GIVEN** user runs `ocr init --tools claude,cursor`
- **WHEN** the command executes
- **THEN** OCR is installed for Claude Code and Cursor only

#### Scenario: Install all tools

- **GIVEN** user runs `ocr init --tools all`
- **WHEN** the command executes
- **THEN** OCR is installed for all supported AI tools

#### Scenario: Symlink mode inside OCR repository

- **GIVEN** user runs `ocr init` from within the OCR repository
- **WHEN** installation completes
- **THEN** skill and command directories are symlinked (not copied)
- **AND** changes to source files are reflected immediately

#### Scenario: Copy mode outside OCR repository

- **GIVEN** user runs `ocr init` from an external project
- **WHEN** installation completes
- **THEN** skill and command files are copied to the target directories

#### Scenario: Session directory creation

- **GIVEN** user runs `ocr init`
- **WHEN** installation completes
- **THEN** `.ocr/sessions/` directory is created
- **AND** `.ocr/.gitignore` is created with session exclusions

---

### Requirement: Supported AI Tools

The CLI SHALL support the following AI coding environments for initialization:

| Tool | Skills Directory |
|------|------------------|
| Amazon Q Developer | `.aws/amazonq` |
| Augment (Auggie) | `.augment` |
| Claude Code | `.claude` |
| Cline | `.cline` |
| Codex | `.codex` |
| Continue | `.continue` |
| Cursor | `.cursor` |
| Gemini CLI | `.gemini` |
| GitHub Copilot | `.github` |
| Kilo Code | `.kilocode` |
| OpenCode | `.opencode` |
| Qoder | `.qoder` |
| RooCode | `.roo` |
| Windsurf | `.windsurf` |

#### Scenario: List available tools

- **GIVEN** user runs `ocr init --help`
- **WHEN** help is displayed
- **THEN** all supported tool IDs are listed in the `--tools` option description

---

### Requirement: Progress Command

The CLI SHALL provide a `progress` command that displays real-time code review progress by watching session files.

#### Scenario: Display active review progress

- **GIVEN** a code review is in progress with session files in `.ocr/sessions/`
- **WHEN** user runs `ocr progress`
- **THEN** a live-updating display shows:
  - All 8 workflow phases with completion indicators
  - Progress bar with percentage
  - Status of each reviewer (pending, in-progress, complete)
  - Elapsed time
  - Finding counts per reviewer

#### Scenario: Auto-detect current session

- **GIVEN** multiple sessions exist in `.ocr/sessions/`
- **WHEN** user runs `ocr progress`
- **THEN** the most recent active session is displayed

#### Scenario: Specify session explicitly

- **GIVEN** user runs `ocr progress --session 2025-01-26-feature-auth`
- **WHEN** the command executes
- **THEN** progress for the specified session is displayed

#### Scenario: No active session

- **GIVEN** no session files exist in `.ocr/sessions/`
- **WHEN** user runs `ocr progress`
- **THEN** message "No active review session found" is displayed

#### Scenario: Review completion

- **GIVEN** a review session completes (final.md is created)
- **WHEN** the progress display updates
- **THEN** "Review Complete" status is shown
- **AND** summary of total findings is displayed

---

### Requirement: Progress Phase Tracking

The CLI SHALL track all 8 review phases by reading from SQLite (primary) with `state.json` fallback, from the session directory.

#### Scenario: SQLite primary source

- **GIVEN** a session exists in SQLite (`sessions` table)
- **WHEN** progress command reads the session
- **THEN** it SHALL read phase information from the `sessions` table in `.ocr/data/ocr.db`
- **AND** orchestration events from `orchestration_events` for timeline data

#### Scenario: State.json fallback

- **GIVEN** a session directory exists but no corresponding row in SQLite
- **WHEN** progress command reads the session
- **THEN** it SHALL fall back to reading `state.json` for phase information
- **AND** if `state.json` is also missing, the session is treated as "waiting"

#### Scenario: State file format (SQLite)

- **GIVEN** a session row exists in SQLite
- **WHEN** progress command reads it
- **THEN** it SHALL parse:
  - `current_phase` - The current workflow phase
  - `phase_number` - Numeric phase (1-8)
  - `current_round` - Current round number
  - `started_at` - Session start timestamp
  - `updated_at` - Last update timestamp

#### Scenario: Phase completion derived from state

- **GIVEN** progress command displays phase checkmarks
- **WHEN** determining which phases are complete
- **THEN** it SHALL derive completion from `phase_number` (phases < current are complete)
- **AND** it SHALL NOT count files or use hardcoded thresholds

#### Scenario: Phase transitions

- **GIVEN** progress command is running
- **WHEN** SQLite is updated with a new phase (or `state.json` as fallback)
- **THEN** display updates to show the new current phase
- **AND** completed phases show checkmarks

#### Scenario: Waiting state

- **GIVEN** user runs `ocr progress` with no active session in SQLite or `state.json`
- **WHEN** the display renders
- **THEN** a "Waiting for review" state is shown
- **AND** the command continues watching for new sessions

#### Scenario: Cross-mode compatibility

- **GIVEN** OCR is running as a Claude Code plugin (not CLI installed)
- **WHEN** the agent writes state via `ocr state` commands (which write to SQLite)
- **THEN** `npx @open-code-review/cli progress` SHALL track the session correctly

### Requirement: Error Handling

The CLI SHALL provide clear error messages for common failure scenarios.

#### Scenario: OCR source not found

- **GIVEN** user runs `ocr init` but OCR source files cannot be located
- **WHEN** the command fails
- **THEN** error message explains how to install OCR properly

#### Scenario: Invalid tool ID

- **GIVEN** user runs `ocr init --tools invalid-tool`
- **WHEN** the command executes
- **THEN** error message lists valid tool IDs

#### Scenario: Permission denied

- **GIVEN** user lacks write permission to target directory
- **WHEN** installation fails
- **THEN** error message indicates permission issue and affected path

---

### Requirement: AGENTS.md Instruction Injection

The CLI SHALL inject OCR instructions into the user's `AGENTS.md` and `CLAUDE.md` files during initialization, following the OpenSpec managed block pattern.

#### Scenario: First-time injection

- **GIVEN** user runs `ocr init` in a project without OCR instructions
- **WHEN** installation completes
- **THEN** a managed block `<!-- OCR:START -->...<!-- OCR:END -->` is appended to `AGENTS.md`
- **AND** the same block is appended to `CLAUDE.md` if it exists or is created

#### Scenario: Update existing instructions

- **GIVEN** `AGENTS.md` already contains an OCR managed block
- **WHEN** user runs `ocr init` again
- **THEN** the existing managed block is replaced with the updated version
- **AND** content outside the managed block is preserved

#### Scenario: Instruction content

- **GIVEN** the OCR managed block is injected
- **WHEN** an AI assistant reads `AGENTS.md`
- **THEN** the block instructs the assistant to open `.ocr/AGENTS.md` for code review requests

#### Scenario: Skip injection with flag

- **GIVEN** user runs `ocr init --no-inject`
- **WHEN** installation completes
- **THEN** `AGENTS.md` and `CLAUDE.md` are not modified

---

### Requirement: Agents Package Dependency

The CLI SHALL depend on the `@open-code-review/agents` package for skill files, commands, and reviewer personas.

#### Scenario: Install from agents package

- **GIVEN** user runs `ocr init`
- **WHEN** installing OCR skills and commands
- **THEN** files are sourced from the `@open-code-review/agents` package
- **AND** files are copied to `.ocr/` in the target project

#### Scenario: Package version alignment

- **GIVEN** `@open-code-review/cli` version 1.2.0 is installed
- **WHEN** checking `@open-code-review/agents` dependency
- **THEN** the agents package version matches the CLI version

---

### Requirement: Update Command

The CLI SHALL provide an `update` command that refreshes OCR assets when the package is upgraded, without requiring full re-initialization.

#### Scenario: Update all assets

- **GIVEN** user has OCR installed and upgrades `@open-code-review/cli`
- **WHEN** user runs `ocr update`
- **THEN** OCR commands/workflows are updated for all configured tools
- **AND** AGENTS.md/CLAUDE.md managed blocks are refreshed
- **AND** .ocr/skills/ is updated with latest skill files

#### Scenario: Update specific components

- **GIVEN** user runs `ocr update --commands`
- **WHEN** the command executes
- **THEN** only commands/workflows are updated
- **AND** AGENTS.md injection is skipped

#### Scenario: Update only skills and assets

- **GIVEN** user runs `ocr update --skills`
- **WHEN** the command executes
- **THEN** .ocr/skills/ is updated including:
  - SKILL.md (main skill)
  - references/ (workflow, discourse)
  - assets/reviewer-template.md
  - assets/standards/README.md
- **AND** the following are preserved (not modified):
  - .ocr/config.yaml
  - .ocr/skills/references/reviewers/ (all reviewer personas)
- **AND** AGENTS.md injection is skipped

#### Scenario: Update only AGENTS.md injection

- **GIVEN** user runs `ocr update --inject`
- **WHEN** the command executes
- **THEN** only AGENTS.md and CLAUDE.md managed blocks are refreshed
- **AND** commands/skills are not modified

#### Scenario: Detect configured tools

- **GIVEN** user previously ran `ocr init` for Claude Code and Windsurf
- **WHEN** user runs `ocr update`
- **THEN** only Claude Code and Windsurf assets are updated
- **AND** unconfigured tools are not affected

#### Scenario: No OCR installation found

- **GIVEN** user runs `ocr update` in a project without `.ocr/` directory
- **WHEN** the command executes
- **THEN** error message instructs user to run `ocr init` first

#### Scenario: Show what would be updated

- **GIVEN** user runs `ocr update --dry-run`
- **WHEN** the command executes
- **THEN** list of files that would be updated is displayed
- **AND** list of preserved files is displayed
- **AND** no files are actually modified

---

### Requirement: Reviewer Preservation During Update

The CLI SHALL preserve all reviewer persona files during updates to support future template-based reviewer management.

#### Scenario: Default reviewers preserved

- **GIVEN** user has existing reviewers in `.ocr/skills/references/reviewers/`
- **WHEN** user runs `ocr update`
- **THEN** all existing reviewer files are preserved unchanged
- **AND** no reviewer files are overwritten with package defaults

#### Scenario: Custom reviewers preserved

- **GIVEN** user has created custom reviewers (e.g., `performance.md`)
- **WHEN** user runs `ocr update`
- **THEN** custom reviewer files are preserved
- **AND** custom reviewers remain usable in reviews

#### Scenario: Fresh install includes default reviewers

- **GIVEN** user runs `ocr init` in a project without `.ocr/`
- **WHEN** installation completes
- **THEN** default reviewers are installed from the agents package
- **AND** reviewers include: principal.md, quality.md, security.md, testing.md

---

### Requirement: OCR Setup Validation

The CLI SHALL validate OCR setup before running commands that require it.

#### Scenario: Progress command without setup

- **GIVEN** user runs `ocr progress` in a project without `.ocr/` directory
- **WHEN** the command executes
- **THEN** error message explains OCR is not set up
- **AND** instructions to run `ocr init` are provided

#### Scenario: Update command without setup

- **GIVEN** user runs `ocr update` in a project without `.ocr/` directory  
- **WHEN** the command executes
- **THEN** error message explains OCR is not set up
- **AND** instructions to run `ocr init` are provided

---

### Requirement: Tool-Specific Command Installation

The CLI SHALL install commands using the appropriate naming convention for each AI tool.

#### Scenario: Subdirectory convention (Claude Code, Cursor, etc.)

- **GIVEN** user runs `ocr init --tools claude`
- **WHEN** installation completes
- **THEN** commands are installed to `.claude/commands/ocr/`
- **AND** command files are named without prefix (e.g., `doctor.md`)
- **AND** slash command format is `/ocr:doctor`

#### Scenario: Flat-prefixed convention (Windsurf)

- **GIVEN** user runs `ocr init --tools windsurf`
- **WHEN** installation completes
- **THEN** commands are installed directly to `.windsurf/workflows/`
- **AND** command files are prefixed (e.g., `ocr-doctor.md`)
- **AND** slash command format is `/ocr-doctor`

---

### Requirement: Agent-Side Setup Guard

The agents package SHALL include a setup guard sub-skill that AI assistants call before any OCR operation.

#### Scenario: Setup guard validates OCR installation

- **GIVEN** an AI assistant attempts to run an OCR command
- **WHEN** the assistant reads `references/setup-guard.md`
- **THEN** instructions guide the assistant to check for `.ocr/` directory
- **AND** instructions guide the assistant to check for `.ocr/skills/` directory

#### Scenario: Setup guard provides helpful error

- **GIVEN** OCR is not set up in the project
- **WHEN** the setup guard check fails
- **THEN** error message explains OCR is not installed
- **AND** instructions to run `ocr init` are provided
- **AND** the assistant is instructed to STOP the operation

#### Scenario: Setup guard bootstraps sessions directory

- **GIVEN** `.ocr/` exists but `.ocr/sessions/` does not
- **WHEN** the setup guard runs
- **THEN** `.ocr/sessions/` is created automatically

---

### Requirement: Project Standards Template

The CLI SHALL install a customizable project standards template that users can edit to provide review context.

#### Scenario: Standards template installed

- **GIVEN** user runs `ocr init`
- **WHEN** installation completes
- **THEN** `.ocr/skills/assets/standards/README.md` is created
- **AND** the file is a fillable template with commented placeholders

#### Scenario: Standards template content

- **GIVEN** the standards template is installed
- **WHEN** user opens `.ocr/skills/assets/standards/README.md`
- **THEN** sections for Repository Standards References exist
- **AND** sections for Key Requirements exist
- **AND** sections for Constraints exist
- **AND** sections for Review Focus Areas exist

#### Scenario: Standards included in reviews

- **GIVEN** user has customized the standards template
- **WHEN** a code review runs
- **THEN** the standards content is included in reviewer context

---

### Requirement: Claude Code Plugin Distribution

The agents package SHALL be structured as a valid Claude Code plugin for native installation in Claude Code.

#### Scenario: Plugin manifest present

- **GIVEN** the agents package at `packages/agents/`
- **WHEN** checking for plugin compatibility
- **THEN** `.claude-plugin/plugin.json` manifest exists
- **AND** manifest contains required fields (name, description, version)

#### Scenario: Plugin directory structure

- **GIVEN** the agents package is structured as a plugin
- **WHEN** installed via `claude --plugin-dir`
- **THEN** `commands/` contains slash command definitions
- **AND** `skills/ocr/` contains the main OCR skill
- **AND** commands are accessible as `/open-code-review:command`

#### Scenario: Plugin installation via marketplace

- **GIVEN** user adds the OCR marketplace in Claude Code
- **WHEN** user runs `/plugin install open-code-review`
- **THEN** OCR skills and commands are available from plugin cache
- **AND** commands are namespaced as `/open-code-review:review`
- **AND** `.ocr/sessions/` is created JIT by setup-guard when first command runs

#### Scenario: CLI compatibility maintained

- **GIVEN** the plugin directory structure (`skills/ocr/`)
- **WHEN** user runs `ocr init` via CLI
- **THEN** skills are installed from `skills/ocr/` to `.ocr/skills/`
- **AND** commands are installed to tool-specific directories
- **AND** both CLI and plugin installations work independently

### Requirement: Doctor Command

The CLI SHALL provide a `doctor` command that checks external dependencies and OCR installation status, providing actionable remediation for any issues found.

#### Scenario: All checks pass

- **GIVEN** `git`, `claude`, and `gh` are in PATH and OCR is initialized
- **WHEN** user runs `ocr doctor`
- **THEN** a compact status block shows green checkmarks with version numbers for all dependencies
- **AND** OCR installation checks show `.ocr/skills/`, `.ocr/sessions/`, `.ocr/config.yaml`, `.ocr/data/ocr.db`
- **AND** "Ready for code review!" summary is displayed
- **AND** the process exits with code 0

#### Scenario: Required dependency missing

- **GIVEN** `claude` is not in PATH
- **WHEN** user runs `ocr doctor`
- **THEN** the preflight block shows a red `✗` next to "Claude Code" with "not found"
- **AND** the summary shows "Issues found" with an install URL
- **AND** the process exits with code 1

#### Scenario: Optional dependency missing

- **GIVEN** `gh` (GitHub CLI) is not in PATH but all required deps are present
- **WHEN** user runs `ocr doctor`
- **THEN** the preflight block shows a dim `✗` next to "GitHub CLI" with "not found (optional)"
- **AND** the summary shows "Ready for code review!" (optional deps do not cause failure)
- **AND** the process exits with code 0

#### Scenario: OCR not initialized

- **GIVEN** `.ocr/` directory does not exist
- **WHEN** user runs `ocr doctor`
- **THEN** OCR installation checks show dim `✗` for all OCR paths
- **AND** the summary shows "Issues found" with instruction to run `ocr init`
- **AND** the process exits with code 1

#### Scenario: Informational OCR checks

- **GIVEN** `.ocr/data/ocr.db` does not exist (no review run yet)
- **WHEN** user runs `ocr doctor`
- **THEN** the database check shows dim `✗` with "(created on first review)" hint
- **AND** this does NOT cause exit code 1 (informational only)

---

### Requirement: Init Preflight Check

The `ocr init` command SHALL display a dependency check block after the banner and before tool selection, without blocking initialization.

#### Scenario: All dependencies found

- **GIVEN** `git`, `claude`, and `gh` are in PATH
- **WHEN** user runs `ocr init`
- **THEN** a "Preflight" block shows green checkmarks with versions for all dependencies
- **AND** tool selection proceeds normally

#### Scenario: Required dependency missing during init

- **GIVEN** `claude` is not in PATH
- **WHEN** user runs `ocr init`
- **THEN** the preflight block shows a red `✗` for Claude Code with "not found"
- **AND** a yellow warning with install URL is displayed
- **AND** initialization continues (non-blocking)
- **AND** tool selection proceeds normally

---

### Requirement: Dependency Check Module

The CLI SHALL provide a shared internal module for checking external binary dependencies, used by both `init` and `doctor` commands.

#### Scenario: Check binary availability

- **GIVEN** a list of dependencies to check (git, claude, gh)
- **WHEN** `checkDependencies()` is called
- **THEN** each binary is tested via `execFileSync(binary, ['--version'])` with a 5-second timeout
- **AND** the version is parsed from stdout using a semver-like regex
- **AND** the result includes `found`, `version`, `required`, and `installHint` for each dependency

#### Scenario: Print dependency status

- **GIVEN** a `DepCheckResult` from `checkDependencies()`
- **WHEN** `printDepChecks()` is called
- **THEN** a column-aligned block is printed with checkmarks/X marks and versions
- **AND** missing required deps show red `✗` with warnings (unless `suppressWarnings` is true)
- **AND** missing optional deps show dim `✗` with "(optional)" suffix

### Requirement: Dashboard Command

The CLI SHALL provide a `dashboard` command that starts a local HTTP + WebSocket server and opens the dashboard in the user's default browser.

#### Scenario: Start dashboard

- **GIVEN** user has run `ocr init` (`.ocr/` directory exists)
- **WHEN** user runs `ocr dashboard`
- **THEN** a local server starts on port 4173 (default) serving both HTTP and Socket.IO
- **AND** the user's default browser opens to `http://localhost:4173`
- **AND** the terminal displays the URL, Socket.IO status, and "Press Ctrl+C to stop"

#### Scenario: Custom port

- **GIVEN** port 4173 is in use
- **WHEN** user runs `ocr dashboard --port 8080`
- **THEN** server starts on port 8080

#### Scenario: No browser auto-open

- **WHEN** user runs `ocr dashboard --no-open`
- **THEN** server starts but browser does not open

#### Scenario: No OCR setup

- **GIVEN** `.ocr/` directory does not exist
- **WHEN** user runs `ocr dashboard`
- **THEN** the command exits with an error: "OCR not initialized. Run `ocr init` first."

#### Scenario: Database auto-creation

- **GIVEN** `.ocr/` exists but `.ocr/data/ocr.db` does not
- **WHEN** user runs `ocr dashboard`
- **THEN** the database is created, migrations run, and the server starts normally

---

### Requirement: Zero Dashboard Startup Cost

The dashboard code SHALL NOT be loaded unless the user runs `ocr dashboard`. Commands like `ocr init`, `ocr progress`, and `ocr state` MUST remain fast.

#### Scenario: Dynamic import only on dashboard command

- **GIVEN** user runs any CLI command other than `ocr dashboard`
- **WHEN** the CLI process starts
- **THEN** the dashboard server module (`dist/dashboard/server.js`) SHALL NOT be imported or loaded

#### Scenario: Dashboard dependencies isolated

- **GIVEN** the dashboard adds significant dependencies (React, Socket.IO, sql.js client bundle)
- **WHEN** user runs `ocr init` or `ocr progress`
- **THEN** none of these dependencies are loaded
- **AND** CLI startup time is unaffected

---

