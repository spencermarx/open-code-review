## ADDED Requirements

### Requirement: AGENTS.md Is Canonical For Shared Context

When discovering and merging context, `AGENTS.md` SHALL be treated as the canonical
source of truth for shared project instructions. Any native instruction file a
specific harness reads (`CLAUDE.md`, `.windsurfrules`, `GEMINI.md`,
`.github/copilot-instructions.md`) SHALL be a generated projection of `AGENTS.md`,
and discovery SHALL NOT assume a harness reads a file another harness ignores.

#### Scenario: OpenCode does not inherit CLAUDE.md

- **GIVEN** a project has both `AGENTS.md` and `CLAUDE.md`
- **WHEN** OpenCode performs context discovery
- **THEN** OpenCode SHALL read `AGENTS.md` and SHALL NOT read `CLAUDE.md`
- **AND** any shared content SHALL be present in `AGENTS.md` so OpenCode does not
  miss it

#### Scenario: Projection keeps every harness current

- **GIVEN** shared context was updated in `AGENTS.md`
- **WHEN** the harness sync runs
- **THEN** each native instruction file SHALL be regenerated from `AGENTS.md`
- **AND** the `cross-harness` doctor check SHALL report any projection that no longer
  matches `AGENTS.md`

#### Scenario: Claude reaches canonical context despite its own file

- **GIVEN** a coexisting `CLAUDE.md` would suppress `AGENTS.md` under Claude's
  default `claude-md-or-agents-md` mode
- **WHEN** `CLAUDE.md` is generated as an `@AGENTS.md` import pointer
- **THEN** Claude Code SHALL import `AGENTS.md` content into context
- **AND** discovery SHALL NOT assume `CLAUDE.md` and `AGENTS.md` are read
  interchangeably — they are distinct files reconciled by the projection
