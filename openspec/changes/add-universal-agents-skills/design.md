# Design: Universal `.agents` skill target

## Context

`installForTool()` (`packages/cli/src/lib/installer.ts`) does three things per selected tool:

1. copies the full skill to `.ocr/skills/`, preserving `config.yaml` and user reviewers;
2. copies full commands to `.ocr/commands/`;
3. writes thin command reference files into `<tool>.commandsDir`. Each one is a frontmatter `description` plus "Execute this command by reading and following: `.ocr/commands/<name>.md`".

Nothing lands in any skills discovery directory. The `skillsDir` field on every registry entry is never read.

## Prior Art: OpenSpec's `agents` target

OpenSpec (Fission-AI/OpenSpec), which this repository already uses for its own specs, ships the same kind of vendor-neutral target. Its [Supported Tools](https://github.com/Fission-AI/OpenSpec/blob/main/docs/supported-tools.md) doc lists **"Shared `.agents` skills" (tool ID `agents`)**, which writes `.agents/skills/openspec-*/SKILL.md`. The doc describes it as "the vendor-neutral option: it writes skills to `.agents/skills/`, the shared root many agent tools read", recommended for "several agents on one repo, all reading `.agents/skills`" and for tools that are not listed yet but read that root.

Points where this change deliberately matches OpenSpec:

- **Same tool ID, `agents`.** Users of both CLIs can pass `--tools agents` to either one.
- **Skills only.** OpenSpec: "No command adapter exists, so no `opsx-*` command files are written". This matches D1 below.
- **Opt-in selection**, like any other tool, and included in `--tools all`.

Points where OpenSpec behaves differently, and how this change treats each one:

| OpenSpec behaviour | This change |
|---|---|
| Auto-offers `agents` only once `.agents/skills/` exists. "A bare `.agents/` is not enough, since tools use that root for rules and subagent definitions too." | Pre-selects on `configDir: ".agents"`, so a bare `.agents/` is enough (see Open Questions). |
| "No `AGENTS.md` is created or edited" for this target. | `AGENTS.md` is still written, because the OCR injector always writes it for every selection (existing *Instruction File Injection* requirement). Not changed here. |
| Writes the full skill content per workflow (`openspec-*` dirs). | Writes one thin pointer (`ocr/SKILL.md`) to `.ocr/skills/SKILL.md` (D2), keeping user reviewers in a single place. |
| Codex and Zed Agent also target `.agents/skills/`. OpenSpec keeps a single Codex-led tree and records ownership in a `.openspec-target` marker. | Not needed today. OCR's Codex entry writes commands to `.codex/commands`, and no other OCR target writes to `.agents/skills/`, so there is only one writer. Revisit if Codex/Zed ever move to `.agents/skills/`. |
| Manages only its own `openspec-*` directories and leaves anything else under `.agents/skills/` alone. | Same principle: OCR writes and overwrites only `.agents/skills/ocr/`. |

Note: `.agents` (plural) is distinct from `.agent` (singular), which Antigravity uses. OpenSpec calls this out explicitly.

## Goals / Non-Goals

- **Goal:** an agent that discovers skills from `.agents/skills/` finds and can activate the `ocr` skill after `ocr init --tools agents`.
- **Goal:** keep a single source of truth for the skill body in `.ocr/skills/`.
- **Non-goal:** installing skills into per-vendor directories (`.claude/skills`, `.cursor/skills`, …). This change removes the field that implied it instead.
- **Non-goal:** a vendor-neutral commands directory. No such convention exists, so `agents` installs no commands.

## Decisions

### D1. Model `.agents` as a registry entry (tool id `agents`), not an always-on side effect

It is opt-in through the same selection UX as every other target: it appears in the checkbox, works with `--tools agents` / `all`, is saved via `setConfiguredToolIds`, and is refreshed by `ocr update` through the existing configured-tools path. No new CLI flag is needed.

Consequence: `AIToolConfig` must allow an entry with no commands.
- `commandsDir?: string` and `commandStrategy?: CommandStrategy` become optional.
- `installCommandsForTool` is skipped when `commandsDir` is absent. `.ocr/commands/` is still populated, because other selected tools and the skill reference it.
- `update.ts#detectConfiguredTools` and the dry-run listing skip entries without `commandsDir`. For `agents` they check the pointer file instead.
- `configDir: ".agents"` drives `detectInstalledTools`, so an existing `.agents/` directory pre-selects the target in the prompt.

`agents` declares no `instructionFiles` (`AGENTS.md` is already universal) and no `vendorBinary`.

### D2. Thin pointer, not a full copy

`.agents/skills/ocr/SKILL.md` is generated as follows:

```markdown
---
<source SKILL.md frontmatter, copied verbatim>
---

# OCR: Code Review

This skill is managed by Open Code Review.

**Execute this skill by reading and following:** `.ocr/skills/SKILL.md`
```

- Copying the frontmatter verbatim keeps `name: ocr` (it matches the parent directory name, as the Agent Skills spec requires), `description` (used for activation), and `metadata.version` (already synced by `nx release`) automatically aligned with the source.
- The skill's references and assets address `.ocr/...` paths, and user-customised reviewers live in `.ocr/skills/references/reviewers/`. A full copy would duplicate the skill and drift on reviewer customisations. The pointer avoids both.
- The pointer is regenerated on every `init` / `update`. It is an OCR-managed file and is overwritten unconditionally, like the command reference files.

### D3. Replace the dead `skillsDir` with a consumed `skillPointerDir`

Remove `skillsDir` from the type and all 14 entries. Add an optional `skillPointerDir?: string`, set only on `agents` (`".agents/skills"`). When it is present, the installer writes `<skillPointerDir>/ocr/SKILL.md`. The new name says what the field does and avoids resurrecting the old "full skill per vendor" implication.

### D4. Exclude non-host targets from `ocr host capabilities`

`host.ts` lists capabilities for every `AI_TOOLS` entry. `agents` is not a host, so the listing filters it out. A direct `ocr host capabilities agents` query keeps returning the conservative default from `hostCapabilitiesFor`, unchanged.

## Risks / Trade-offs

- **Double discovery:** a host that reads both `.agents/skills/` and its own instruction file may see OCR twice, once through the pointer skill and once through the `AGENTS.md` managed block. Both lead to the same `.ocr/skills/SKILL.md`, so the effect is redundant context, not conflicting behaviour.
- **Pointer without `.ocr/`:** if a user deletes `.ocr/` but keeps `.agents/`, the pointer dangles. The skill's existing setup guard (`.ocr/skills/SKILL.md` instructs to run `ocr init`) does not apply, because the target file is missing. The pointer body therefore also says to run `ocr init` if the referenced file does not exist.
- **Optional `commandsDir`:** every reader must handle `undefined`. TypeScript strict mode surfaces all call sites (3 today: `installer.ts`, `update.ts` ×2).

## Migration

None. Existing installs are untouched until the user selects `agents`. Removing `skillsDir` is internal to `packages/cli`.

## Open Questions

- **Detection trigger:** should pre-selection follow OpenSpec and require `.agents/skills/` rather than a bare `.agents/`? A bare `.agents/` may hold only rules or subagent definitions. Aligning would mean detecting by the `.agents/skills/` directory instead of `configDir`.
