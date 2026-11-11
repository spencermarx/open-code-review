# Design: Universal `.agents` skill target

## Context

`installForTool()` (`packages/cli/src/lib/installer.ts`) does three things per selected tool:

1. copies the full skill to `.ocr/skills/`, preserving `config.yaml` and user reviewers;
2. copies full commands to `.ocr/commands/`;
3. writes thin command reference files into the tool's commands directory. Each one is a frontmatter `description` plus "Execute this command by reading and following: `.ocr/commands/<name>.md`".

Nothing lands in any skills discovery directory. The `skillsDir` field on every registry entry is never read.

## Prior Art: OpenSpec's `agents` target

OpenSpec (Fission-AI/OpenSpec), which this repository already uses for its own specs, ships the same kind of vendor-neutral target. Its [Supported Tools](https://github.com/Fission-AI/OpenSpec/blob/main/docs/supported-tools.md) doc lists **"Shared `.agents` skills" (tool ID `agents`)**, which writes `.agents/skills/openspec-*/SKILL.md`. The doc describes it as "the vendor-neutral option: it writes skills to `.agents/skills/`, the shared root many agent tools read", recommended for "several agents on one repo, all reading `.agents/skills`" and for tools that are not listed yet but read that root.

Points where this change deliberately matches OpenSpec:

- **Same tool ID, `agents`.** Users of both CLIs can pass `--tools agents` to either one.
- **Skills only.** OpenSpec: "No command adapter exists, so no `opsx-*` command files are written". This matches D1 below.
- **Opt-in selection**, like any other tool, and included in `--tools all`.
- **Detection by the skills root.** OpenSpec auto-offers `agents` only once `.agents/skills/` exists: "A bare `.agents/` is not enough, since tools use that root for rules and subagent definitions too." OCR pre-selects on the same rule (D5).

Points where OpenSpec behaves differently, and how this change treats each one:

| OpenSpec behaviour | This change |
|---|---|
| "No `AGENTS.md` is created or edited" for this target. | `AGENTS.md` is still written, because the OCR injector always writes it for every selection (existing *Instruction File Injection* requirement). Not changed here. |
| Writes the full skill content per workflow (`openspec-*` dirs). | Writes one thin pointer (`ocr/SKILL.md`) to `.ocr/skills/SKILL.md` (D2), keeping user reviewers in a single place. |
| Codex and Zed Agent also target `.agents/skills/`. OpenSpec keeps a single Codex-led tree and records ownership in a `.openspec-target` marker. | Not needed today. OCR's Codex entry writes commands to `.codex/commands`, and no other OCR target writes to `.agents/skills/`, so there is only one writer. Ownership is recorded per file by a marker line in the pointer itself (D2). Revisit if Codex/Zed ever move to `.agents/skills/`. |
| Manages only its own `openspec-*` directories and leaves anything else under `.agents/skills/` alone. | Same principle: OCR writes only `.agents/skills/ocr/SKILL.md`, and only when that file is absent or carries the OCR marker. |

Note: `.agents` (plural) is distinct from `.agent` (singular), which Antigravity uses. OpenSpec calls this out explicitly.

## Goals / Non-Goals

- **Goal:** an agent that discovers skills from `.agents/skills/` finds and can activate the `ocr` skill after `ocr init --tools agents`.
- **Goal:** keep a single source of truth for the skill body in `.ocr/skills/`.
- **Non-goal:** installing skills into per-vendor directories (`.claude/skills`, `.cursor/skills`, …). This change removes the field that implied it instead.
- **Non-goal:** a vendor-neutral commands directory. No such convention exists, so `agents` installs no commands.

## Decisions

### D1. Model `.agents` as a registry entry (tool id `agents`), not an always-on side effect

It is opt-in through the same selection UX as every other target: it appears in the checkbox, works with `--tools agents` / `all`, is saved via `setConfiguredToolIds`, and is refreshed by `ocr update` through the configured-tools path. No new CLI flag is needed.

`agents` declares no `instructionFiles` (`AGENTS.md` is already universal) and no `vendorBinary`. Because no slash commands are installed for it, `ocr init` replaces the "Run `/ocr:review`" next step with "ask your agent to review my changes" when only discovery targets were selected.

### D2. Thin pointer, not a full copy, owned by a marker line

`.agents/skills/ocr/SKILL.md` is generated as follows:

```markdown
---
<source SKILL.md frontmatter, copied verbatim>
---

# OCR: Code Review

This skill is managed by Open Code Review.

**Execute this skill by reading and following:** `.ocr/skills/SKILL.md` at the repository root (not relative to this skill's directory).

If `.ocr/skills/SKILL.md` does not exist at the repository root, OCR is not set up in this project — tell the user to run `ocr init`.
```

- Copying the frontmatter verbatim keeps `name: ocr` (it matches the parent directory name, as the Agent Skills spec requires), `description` (used for activation), and `metadata.version` (already synced by `nx release`) automatically aligned with the source.
- The body uses the frontmatter's line ending, so a CRLF checkout never produces a mixed CRLF/LF file.
- The path is anchored to the repository root explicitly: an agent reading a skill may otherwise resolve relative paths against the skill's own directory.
- The skill's references and assets address `.ocr/...` paths, and user-customised reviewers live in `.ocr/skills/references/reviewers/`. A full copy would duplicate the skill and drift on reviewer customisations. The pointer avoids both.
- **Ownership.** The line `This skill is managed by Open Code Review.` (`SKILL_POINTER_MARKER`, single-sourced in `config.ts`) marks the file as OCR's. The pointer is regenerated on every `init` / `update` when the file is absent or carries the marker. A `SKILL.md` at the same path without the marker belongs to someone else: it is left untouched, a warning is printed, and it never counts as an OCR install.
- The template lives in CLI TypeScript next to `generateCommandReference`, which already generates the command pointers the same way. Its only content is a path and the marker; the agent-facing skill itself stays in `packages/agents/`.

### D3. Make the host/discovery split explicit in the type

Remove `skillsDir` from the type and all 14 entries. `AIToolConfig` becomes a discriminated union on `kind`:

- `HostToolConfig` (`kind: "host"`) carries `commands: { dir, strategy }`. The directory and its naming strategy are one value, so neither can be set without the other, and readers switch exhaustively on `strategy` instead of defaulting silently.
- `DiscoveryToolConfig` (`kind: "discovery"`) carries `skillPointerDir` (`".agents/skills"` for `agents`) and no commands.

`isHostTool` reads `kind` instead of inferring host-ness from missing fields. `skillPointerPath(tool)` is the single place that builds `<skillPointerDir>/ocr/SKILL.md`. Command installation still populates `.ocr/commands/` for every tool, because other selected tools and the skill reference it, and writes reference files only for hosts.

### D4. Exclude discovery targets from the `ocr host capabilities` listing

`host.ts` listed capabilities for every `AI_TOOLS` entry. `agents` is not a host, so the listing now covers every host tool (`AI_TOOLS.filter(isHostTool)`), and the *Host Capability Query Command* requirement is modified to say "every supported host tool". A direct `ocr host capabilities --tool agents` query keeps returning the conservative default from `hostCapabilitiesFor`, unchanged.

### D5. Detection and update adoption

- **Interactive `init` pre-selection** follows OpenSpec: `agents` is pre-selected only when `.agents/skills/` exists. A bare `.agents/` may hold only rules or subagent definitions.
- **`ocr update`** writes without asking, so it is stricter. Saved tool ids from `init` win. Without them (legacy installs), it refreshes tools that already carry an OCR install — hosts with OCR command references, discovery targets with an OCR-managed pointer — plus hosts whose config directory exists. A discovery target is never adopted from directory presence alone (`resolveToolsToUpdate`).
- **Stale pointers.** When `agents` is deselected, an OCR-managed pointer it left behind is reported as a warning by `init` and `update`, never deleted, mirroring how stale instruction files are handled.

## Risks / Trade-offs

- **Double discovery:** a host that reads both `.agents/skills/` and its own instruction file may see OCR twice, once through the pointer skill and once through the `AGENTS.md` managed block. Both lead to the same `.ocr/skills/SKILL.md`, so the effect is redundant context, not conflicting behaviour.
- **Pointer without `.ocr/`:** if a user deletes `.ocr/` but keeps `.agents/`, the pointer dangles. The skill's existing setup guard (`.ocr/skills/SKILL.md` instructs to run `ocr init`) does not apply, because the target file is missing. The pointer body therefore also says to run `ocr init` if the referenced file does not exist.
- **Registry shape change:** every reader of `commandsDir` / `commandStrategy` moves to `kind` + `commands`. TypeScript strict mode surfaces all call sites; the type is internal to `packages/cli`.

## Migration

None. Existing installs are untouched until the user selects `agents`. Removing `skillsDir` and reshaping `AIToolConfig` are internal to `packages/cli`.
