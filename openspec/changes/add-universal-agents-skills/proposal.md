# Change: Install the OCR skill into the universal `.agents/skills/` directory

## Why

The OCR skill (`packages/agents/skills/ocr/SKILL.md`) is already authored in the Agent Skills format (`name`, `description`, `license`, `compatibility`, `metadata` frontmatter), but `ocr init` never puts it anywhere an agent auto-discovers skills. Today the full skill is copied only to `.ocr/skills/`, and discovery depends entirely on the instruction-file pointer that the injector writes into `AGENTS.md` / `CLAUDE.md`. Agents that scan the vendor-neutral `.agents/skills/` directory find nothing.

There is established prior art. OpenSpec, already used by this repository, ships a vendor-neutral **"Shared `.agents` skills"** target with tool ID `agents`. It writes `.agents/skills/openspec-*/SKILL.md` and generates no commands ([OpenSpec Supported Tools](https://github.com/Fission-AI/OpenSpec/blob/main/docs/supported-tools.md)). This change adopts the same tool ID and the same skills-only shape. `design.md` compares the two in detail.

The tool registry also carries a dead field: every `AIToolConfig` declares a `skillsDir` (`.claude/skills`, `.cursor/skills`, …), but no code reads it, so it misleadingly suggests that per-tool skill installation exists.

## What Changes

- Add a new selectable install target, **Universal (.agents)**, with tool id `agents`, to the `AI_TOOLS` registry. It shows up in the `ocr init` checkbox prompt and is accepted by `--tools agents` / `--tools all`.
- When `agents` is selected, `ocr init` (and `ocr update`) writes a **thin skill pointer** to `.agents/skills/ocr/SKILL.md`. It carries the source `SKILL.md` frontmatter verbatim, an OCR marker line, and a body that tells the agent to read and follow `.ocr/skills/SKILL.md` at the repository root. The full skill stays only in `.ocr/skills/`, the same pattern the command reference files use. A `SKILL.md` at that path without the marker is never overwritten.
- The `agents` target installs **no commands**. `AIToolConfig` becomes a discriminated union: hosts (`kind: "host"`) carry `commands: { dir, strategy }`; discovery targets (`kind: "discovery"`) carry `skillPointerDir` and no commands. Command installation, update detection, and update dry-run output follow `kind`.
- `init` pre-selects `agents` only when `.agents/skills/` exists (as OpenSpec does); legacy `ocr update` never adopts it from directories alone. A pointer left behind after deselecting `agents` is reported, not deleted.
- The `agents` target declares no extra instruction file. It relies on the universal `AGENTS.md` that the injector already always writes.
- The `agents` target is not an agentic host, so it is excluded from the `ocr host capabilities` listing (the *Host Capability Query Command* requirement now says "every supported host tool").
- **Cleanup:** remove the unused `skillsDir` field from `AIToolConfig` and from every registry entry. The new target uses a distinct, actually-consumed field (`skillPointerDir`) on the discovery variant.

## Impact

- Affected specs: `cli` (Supported AI Tools, Tool-Specific Command Installation, Host Capability Query Command, new Universal Agent Skill Pointer requirement)
- Affected code:
  - `packages/cli/src/lib/config.ts`: `AIToolId`, `AIToolConfig`, `AI_TOOLS`
  - `packages/cli/src/lib/installer.ts`: skill-pointer writer, host-only command refs, detection, update resolution, stale-pointer lookup
  - `packages/cli/src/commands/init.ts`: `--tools` help, next steps, stale-pointer warning
  - `packages/cli/src/commands/update.ts`: tool resolution, dry-run listing, stale-pointer warning
  - `packages/cli/src/commands/host.ts`: exclude non-host targets
  - tests: `config.test.ts`, `installer.test.ts`, and `cli-e2e/src/cli-commands.test.ts`
- Not affected: the skill sources in `packages/agents/` (the pointer is generated from them), and the injector (`AGENTS.md` is already universal).
- Backward compatibility: purely additive for users. Existing installs are unaffected until someone selects `agents`. `skillsDir` is internal (not exported to other packages), so removing it is not a public API break.
