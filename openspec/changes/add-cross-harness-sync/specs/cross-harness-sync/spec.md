## ADDED Requirements

### Requirement: Single Canonical Context Source

The repository SHALL maintain `AGENTS.md` as the single source of truth for shared
project instructions (code conventions, release process, and tool managed blocks).
Because OpenCode reads `AGENTS.md` only (no `CLAUDE.md` fallback) and a coexisting
`CLAUDE.md` otherwise *suppresses* `AGENTS.md` for Claude, `CLAUDE.md` SHALL be a
thin `@AGENTS.md` **import pointer** that Claude resolves into context; the other
native instruction files (`.windsurfrules`, `GEMINI.md`,
`.github/copilot-instructions.md`) SHALL be generated full content of `AGENTS.md`
(no `@`-import in those harnesses). None SHALL be hand-edited. No filesystem symlink
SHALL be used.

#### Scenario: OpenCode reads the canonical context

- **GIVEN** `AGENTS.md` contains the code conventions and release process
- **WHEN** OpenCode loads project instructions
- **THEN** OpenCode SHALL read `AGENTS.md` and receive the conventions and release
  process
- **AND** OpenCode SHALL NOT require `CLAUDE.md` to obtain that content

#### Scenario: Claude Code reaches the canonical context via import

- **GIVEN** a coexisting `CLAUDE.md` would otherwise suppress `AGENTS.md`
- **WHEN** `CLAUDE.md` is generated as `@AGENTS.md` (+ any reserved note after the
  import)
- **THEN** Claude Code SHALL import `AGENTS.md` content into context
- **AND** the `cross-harness` doctor check SHALL **fail hard** (not merely warn) if
  the `@AGENTS.md` import line is missing or unresolvable, so a future edit can't
  silently suppress `AGENTS.md`

#### Scenario: Pointer is cross-platform and deterministic

- **GIVEN** the projection is a `@AGENTS.md` import, not a filesystem symlink
- **WHEN** the repo is checked out on any platform
- **THEN** the pointer SHALL resolve identically without `core.symlinks` support

### Requirement: Harness-Adapter Extension Model

The cross-harness sync SHALL be built on a `HarnessAdapter` strategy: one small
module per harness with `{ id, reserved[], project(src) → native artifacts }`, the
*only* place harness-specific knowledge lives. Adding a new harness SHALL require
only one `HarnessAdapter` plus registration, and every existing canonical source
SHALL then project through it. For any surface an adapter cannot render natively, a
**default pointer/passthrough renderer** SHALL produce a valid, *reported*
projection rather than a silent omission or a broken file. An adapter's
`reserved[]` lists the harness-native files the sync SHALL **never clobber**.

#### Scenario: New harness is one adapter

- **GIVEN** a new `HarnessAdapter` is registered
- **WHEN** the sync runs
- **THEN** every existing canonical source SHALL project to that harness through its
  `project` method, with no per-surface code change

#### Scenario: Unhandled surface degrades safely

- **GIVEN** a surface no enabled adapter renders natively
- **WHEN** the sync runs
- **THEN** the default renderer SHALL emit a valid pointer/passthrough artifact
- **AND** the doctor check SHALL report the degraded projection, not swallow it

#### Scenario: Reserved files are never clobbered

- **GIVEN** an adapter declares `.claude/settings.json` (Claude) or
  `opencode.json` reserved keys + `.opencode/plugins/**` (OpenCode) in `reserved[]`
- **WHEN** the sync runs
- **THEN** those files SHALL remain unchanged by the sync

### Requirement: Decoupled, Non-Published Tooling

The sync and doctor tooling SHALL live in a dedicated, **non-published** repository
location (`tools/harness/`) that is structurally outside the pnpm workspace and the
release set (`nx.json` `release.projects`, which globs `packages/*`). The tooling
SHALL NOT import from the published CLI package (`packages/cli`), so repository
maintenance logic is never shipped to consumers of `@open-code-review/cli` or
`@open-code-review/agents`.

#### Scenario: Tooling is not in the release set

- **GIVEN** the sync/doctor tooling lives under `tools/harness/`
- **WHEN** the release set is computed from `nx.json` `release.projects`
- **THEN** no `tools/**` path SHALL match the release set

#### Scenario: Tooling is self-contained

- **GIVEN** the tooling under `tools/harness/`
- **WHEN** its modules are resolved
- **THEN** none SHALL import from `packages/cli` or any published package's
  runtime source (native conventions are *referenced*, not imported)

### Requirement: Single Source For MCP Servers

MCP servers SHALL be defined once in a canonical source (`mcp-servers.json` at the
repo root) and SHALL be generated to both the Claude shape (`.mcp.json` →
`mcpServers`) and the OpenCode shape (`opencode.json` → `mcp.servers`). Neither
generated target SHALL be hand-edited.

#### Scenario: Generated targets stay in agreement

- **GIVEN** `mcp-servers.json` defines a server `claude-flow`
- **WHEN** the sync runs
- **THEN** `.mcp.json` and the `opencode.json` `mcp` block SHALL both describe
  `claude-flow`
- **AND** both targets SHALL carry a generated-file banner

#### Scenario: Field translation is correct

- **GIVEN** a canonical server has `args`, `env`, and `autoStart: false`
- **WHEN** the OpenCode target is generated
- **THEN** `args` SHALL append to `command`, `env` SHALL map to `environment`
- **AND** `autoStart: false` SHALL map to `disabled: true`

### Requirement: Sub-Agent Bridge From Claude To OpenCode

The OpenCode adapter SHALL project sub-agents from `.claude/agents/**/*.md` to
`.opencode/agents/**/*.md` by converting frontmatter. Claude `tools` SHALL be
translated into explicit OpenCode `permissions` rules (allow the listed `action`s
and **explicitly deny the rest**), because an OpenCode subagent with an
empty/absent `permissions` set inherits the permissive base policy `*:* allow`
(full access) and a subagent's permissions are not a subset of its parent's. Claude
agent identity (the `name` frontmatter field) SHALL map to the OpenCode agent
filename, since OpenCode identity is the path. No directory symlink SHALL be used.

#### Scenario: Restricted agent keeps its restrictions

- **GIVEN** a Claude agent declares `tools: [Read, Grep]`
- **WHEN** it is projected to OpenCode
- **THEN** the generated OpenCode agent SHALL include `permissions` that deny
  `edit`, `shell`, and `subagent`
- **AND** the agent SHALL NOT fall back to the `*:* allow` default

#### Scenario: Unrestricted agent gets an explicit least-privilege block

- **GIVEN** a Claude agent declares no `tools`
- **WHEN** it is projected to OpenCode
- **THEN** the generated agent SHALL receive an explicit, non-empty `permissions`
  block (least privilege), not the inherited `*:* allow`

#### Scenario: Unknown frontmatter is ignored

- **GIVEN** a Claude agent has Claude-only frontmatter (`capabilities`, `priority`,
  `hooks`)
- **WHEN** it is projected to OpenCode
- **THEN** the conversion SHALL ignore those fields without error
- **AND** the agent body SHALL become the OpenCode `system` prompt

### Requirement: Command And Skill Projection

The OpenCode adapter SHALL project command pointer files to
`.opencode/commands/ocr/*` (referencing `.ocr/commands/*.md`) and SHALL mirror the
OCR skill to `.opencode/skills/ocr/` (it lives only in `.ocr/skills/`, which
OpenCode does *not* discover); a non-stale `.opencode/` tree SHALL let OpenCode
resolve the OCR commands and skill. The same command SHALL resolve to
`/ocr/review` in OpenCode (slash nesting) and `/ocr:review` in Claude Code (colon
nesting); pointer *content* SHALL be shared, only the invocation namespace differs,
and the compatibility matrix SHALL list both names.

#### Scenario: OpenCode resolves the OCR command

- **GIVEN** a sync has run for `opencode`
- **WHEN** OpenCode is started in the project
- **THEN** `.opencode/commands/ocr/review.md` SHALL exist and point at
  `.ocr/commands/review.md`
- **AND** invoking `/ocr/review` in OpenCode SHALL run the same workflow as
  `/ocr:review` in Claude Code

#### Scenario: OCR skill is discoverable by OpenCode

- **GIVEN** the OCR skill exists only in `.ocr/skills/SKILL.md`
- **WHEN** a sync runs for `opencode`
- **THEN** `.opencode/skills/ocr/SKILL.md` SHALL exist
- **AND** OpenCode SHALL be able to load the `ocr` skill by ID

### Requirement: Harness Reserved Files Are Not Shared

Each harness's genuinely harness-specific files SHALL remain hand-owned and SHALL NOT
be projected from a shared source. Claude reserved files include
`.claude/settings.json` (hooks, statusLine, claudeFlow, attribution, env),
`.claude/settings.local.json`, `.claude/helpers/**`, and `.claude-plugin/**`;
OpenCode reserved files include `opencode.json` `permissions`/`policies`/`plugins`/
`default_agent`/`model` (held in a hand-authored input the generator merges) and
`.opencode/plugins/**`. Cross-harness permission/hook translation is **out of
scope** (deferred): permissions/hooks stay hand-owned per harness.

#### Scenario: Reserved files are not overwritten by sync

- **GIVEN** a user has hand-edited `.claude/settings.json` hooks
- **WHEN** the sync runs
- **THEN** the sync SHALL NOT overwrite `.claude/settings.json`
- **AND** the sync SHALL NOT generate an equivalent OpenCode lifecycle plugin unless
  explicitly requested

### Requirement: Deterministic Generation And Drift Detection

Generated projections SHALL be byte-identical across runs and platforms: fixed
templates, no wall-clock in committed output, stable key ordering, and LF line
endings. Running the sync twice SHALL produce no diff. The `cross-harness` doctor
check SHALL report drift between canonical sources and their projections
(instruction files vs `AGENTS.md`, `.mcp.json` + `opencode.json` vs
`mcp-servers.json`, presence/staleness of `.opencode/{agents,commands,skills}`, and
that every generated OpenCode agent has a non-empty `permissions` block), SHALL NOT
delete user-owned files, and a CI freshness gate (`sync --check`) SHALL **fail the
build** on any stale or incomplete projection (blocking, on by default).

#### Scenario: Re-running the sync is a no-op

- **GIVEN** a clean, in-sync tree
- **WHEN** the sync is run a second time
- **THEN** no generated file SHALL change

#### Scenario: Stale projection is reported

- **GIVEN** `AGENTS.md` changed but `CLAUDE.md` was not regenerated
- **WHEN** the doctor check runs
- **THEN** it SHALL report `CLAUDE.md` as stale
- **AND** it SHALL NOT modify or delete `CLAUDE.md`

#### Scenario: Stale projection blocks CI

- **GIVEN** a canonical source changed without a regeneration
- **WHEN** the CI freshness gate (`sync --check`) runs
- **THEN** it SHALL fail the build (blocking, on by default), naming the stale file
