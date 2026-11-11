## ADDED Requirements

### Requirement: Universal Agent Skill Pointer

The CLI SHALL support a vendor-neutral install target `agents` that writes `.agents/skills/ocr/SKILL.md`: a pointer skill carrying the packaged `SKILL.md` frontmatter verbatim and the marker line `This skill is managed by Open Code Review.`, whose body defers to `.ocr/skills/SKILL.md` at the repository root. The full skill SHALL remain only in `.ocr/skills/`. A `SKILL.md` at that path without the marker SHALL NOT be overwritten.

#### Scenario: Pointer skill written on init

- **GIVEN** user runs `ocr init --tools agents`
- **WHEN** installation completes
- **THEN** `.agents/skills/ocr/SKILL.md` exists
- **AND** its frontmatter is identical to the frontmatter of the packaged OCR `SKILL.md` (including `name: ocr` and `description`)
- **AND** its body carries the OCR marker line and references `.ocr/skills/SKILL.md` at the repository root as the skill to read and follow
- **AND** the full skill is installed to `.ocr/skills/` and the full commands to `.ocr/commands/`

#### Scenario: No commands for the universal target

- **GIVEN** user runs `ocr init --tools agents`
- **WHEN** installation completes
- **THEN** no command reference files are written under `.agents/`
- **AND** the "Next steps" output does not advertise `/ocr:review`

#### Scenario: Universal target not selected

- **GIVEN** user runs `ocr init --tools claude`
- **WHEN** installation completes
- **THEN** no `.agents/skills/ocr/SKILL.md` is created

#### Scenario: Pointer refreshed on update

- **GIVEN** `agents` is a configured tool and the packaged `SKILL.md` frontmatter has changed (e.g. a new `metadata.version`)
- **WHEN** user runs `ocr update`
- **THEN** `.agents/skills/ocr/SKILL.md` is regenerated with the new frontmatter
- **AND** `ocr update --dry-run` lists `.agents/skills/ocr/SKILL.md` among the files it would update

#### Scenario: Foreign SKILL.md is preserved

- **GIVEN** `.agents/skills/ocr/SKILL.md` exists without the OCR marker line
- **WHEN** user runs `ocr init --tools agents` or `ocr update`
- **THEN** the file is left unchanged
- **AND** the CLI prints a warning naming the file

#### Scenario: Skills root pre-selects the target

- **GIVEN** the project already contains a `.agents/skills/` directory
- **WHEN** user runs `ocr init` interactively
- **THEN** "Universal (.agents)" is pre-selected in the tool checkbox

#### Scenario: Bare .agents directory does not pre-select the target

- **GIVEN** the project contains a `.agents/` directory but no `.agents/skills/`
- **WHEN** user runs `ocr init` interactively
- **THEN** "Universal (.agents)" is not pre-selected

#### Scenario: Legacy update never adopts the target from directories alone

- **GIVEN** no tools are saved in the CLI config and `.agents/skills/` exists without an OCR-managed pointer
- **WHEN** user runs `ocr update`
- **THEN** no `.agents/skills/ocr/SKILL.md` is written

#### Scenario: Deselected target leaves a stale pointer

- **GIVEN** `.agents/skills/ocr/SKILL.md` is an OCR-managed pointer and `agents` is not among the selected tools
- **WHEN** user runs `ocr init` or `ocr update`
- **THEN** the pointer is not deleted
- **AND** the CLI prints a warning naming the stale pointer

## MODIFIED Requirements

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
| Universal (.agents) | `.agents` |
| Windsurf | `.windsurf` |

#### Scenario: List available tools

- **GIVEN** user runs `ocr init --help`
- **WHEN** help is displayed
- **THEN** all supported tool IDs are listed in the `--tools` option description

#### Scenario: Universal target included in all

- **GIVEN** user runs `ocr init --tools all`
- **WHEN** the command executes
- **THEN** the `agents` target is installed along with every other supported tool

### Requirement: Tool-Specific Command Installation

The CLI SHALL install commands using the appropriate naming convention for each AI tool. Every registry entry SHALL declare its kind explicitly: a host declares its commands directory together with its naming strategy, and a discovery target (such as `agents`) declares no commands and SHALL receive no command reference files.

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

#### Scenario: Discovery target without commands

- **GIVEN** user runs `ocr init --tools agents`
- **WHEN** installation completes
- **THEN** no tool-specific command reference files are written
- **AND** `.ocr/commands/` is still populated with the full commands

### Requirement: Host Capability Query Command

The CLI SHALL provide `ocr host capabilities` so the review skill can determine, at runtime, how to run Phase 4 on its host. The command SHALL report, per tool, whether the host can spawn sub-agents (`subagentSpawn`) and vary the model per task (`perTaskModel`), plus the implied Phase-4 strategy. A host that does not declare capabilities SHALL resolve to the conservative default (no sub-agent spawn, no per-task model), so the skill never assumes a Claude-style Task tool exists.

#### Scenario: Query a single host as JSON

- **WHEN** a user or the skill runs `ocr host capabilities --tool gemini --json`
- **THEN** the output SHALL be a JSON object including `subagentSpawn: false`, `perTaskModel: false`, and `phase4: "sequential"`

#### Scenario: Capable host reports parallel strategy

- **WHEN** `ocr host capabilities --tool claude --json` is run
- **THEN** the output SHALL include `subagentSpawn: true` and `phase4: "parallel-subagents"`

#### Scenario: Every supported tool resolves to a complete descriptor

- **WHEN** `ocr host capabilities --json` is run with no `--tool`
- **THEN** every supported host tool SHALL appear with boolean `subagentSpawn` and `perTaskModel` values — no host is omitted or left undefined
- **AND** discovery targets that are not hosts (such as `agents`) SHALL NOT appear

#### Scenario: Discovery target queried directly

- **WHEN** `ocr host capabilities --tool agents --json` is run
- **THEN** the command SHALL exit zero with the conservative default (`subagentSpawn: false`, `perTaskModel: false`)

#### Scenario: Unknown tool id is rejected

- **WHEN** `ocr host capabilities --tool nonsense` is run
- **THEN** the command SHALL exit non-zero with an error listing the valid tool ids
