## ADDED Requirements

### Requirement: Universal Agent Skill Pointer

The CLI SHALL support a vendor-neutral install target `agents` that writes `.agents/skills/ocr/SKILL.md`: a pointer skill carrying the packaged `SKILL.md` frontmatter verbatim, whose body defers to `.ocr/skills/SKILL.md`. The full skill SHALL remain only in `.ocr/skills/`.

#### Scenario: Pointer skill written on init

- **GIVEN** user runs `ocr init --tools agents`
- **WHEN** installation completes
- **THEN** `.agents/skills/ocr/SKILL.md` exists
- **AND** its frontmatter is identical to the frontmatter of the packaged OCR `SKILL.md` (including `name: ocr` and `description`)
- **AND** its body references `.ocr/skills/SKILL.md` as the skill to read and follow
- **AND** the full skill is installed to `.ocr/skills/` and the full commands to `.ocr/commands/`

#### Scenario: No commands for the universal target

- **GIVEN** user runs `ocr init --tools agents`
- **WHEN** installation completes
- **THEN** no command reference files are written under `.agents/`

#### Scenario: Universal target not selected

- **GIVEN** user runs `ocr init --tools claude`
- **WHEN** installation completes
- **THEN** no `.agents/skills/ocr/SKILL.md` is created

#### Scenario: Pointer refreshed on update

- **GIVEN** `agents` is a configured tool and the packaged `SKILL.md` frontmatter has changed (e.g. a new `metadata.version`)
- **WHEN** user runs `ocr update`
- **THEN** `.agents/skills/ocr/SKILL.md` is regenerated with the new frontmatter

#### Scenario: Existing .agents directory pre-selects the target

- **GIVEN** the project already contains a `.agents/` directory
- **WHEN** user runs `ocr init` interactively
- **THEN** "Universal (.agents)" is pre-selected in the tool checkbox

#### Scenario: Universal target is not a host

- **WHEN** user runs `ocr host capabilities` without a host argument
- **THEN** the `agents` target is not listed

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

The CLI SHALL install commands using the appropriate naming convention for each AI tool. A tool that declares no commands directory SHALL receive no command reference files.

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

#### Scenario: Tool without a commands directory

- **GIVEN** user runs `ocr init --tools agents`
- **WHEN** installation completes
- **THEN** no tool-specific command reference files are written
- **AND** `.ocr/commands/` is still populated with the full commands
