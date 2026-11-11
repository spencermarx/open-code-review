## ADDED Requirements

### Requirement: OpenCode Command Namespacing

The harness sync SHALL project OCR slash commands to OpenCode using OpenCode's
command naming: a command file at `.opencode/commands/ocr/<name>.md` SHALL resolve
to the OpenCode command `ocr/<name>` (e.g. `/ocr/review`). Command content SHALL
use the shared `$ARGUMENTS` template syntax so the same source file serves both
Claude Code and OpenCode, and OpenCode-only frontmatter (`agent`, `model`,
`subagent`) SHALL be ignored by Claude Code without error.

#### Scenario: OCR command resolves under OpenCode

- **GIVEN** a pointer file `.opencode/commands/ocr/review.md` references
  `.ocr/commands/review.md`
- **WHEN** a user runs `/ocr/review` in OpenCode
- **THEN** OpenCode SHALL load the pointer and run the OCR review workflow
- **AND** the behavior SHALL match the Claude Code `/ocr:review` command

#### Scenario: Shared template syntax is compatible

- **GIVEN** an OCR command template uses `$ARGUMENTS`
- **WHEN** the same template is projected to both `.claude/commands/ocr/` and
  `.opencode/commands/ocr/`
- **THEN** both harnesses SHALL expand arguments correctly
- **AND** harness-only frontmatter fields SHALL be ignored by the other harness
