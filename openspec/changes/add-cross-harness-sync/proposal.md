# Change: Cross-harness single source of truth (Claude Code + OpenCode)

> **Status: proposed (not yet implemented).** This change records the sanctioned
> architecture for making OCR's *own* agent configuration a **single source of
> truth** consumed by **both** Claude Code and OpenCode V2, projected per harness
> through a small **harness-adapter** model — generated content + pointer files,
> **no filesystem symlinks** (OS-agnostic, deterministic, git-friendly on every
> platform), plus each harness's reserved files — with the tooling **decoupled
> from the published OCR library**. Do not archive until implemented.

## Why

OCR's identity is "works across all AI CLIs," but the repository's *own* agent
configuration is **Claude-first and duplicated**, and it is **not yet OpenCode
ready**:

- **Three divergent context files.** `CLAUDE.md` carries Code Conventions +
  Release Process + the OpenSpec/OCR managed blocks; `AGENTS.md` carries only the
  OpenSpec/OCR managed blocks; `.windsurfrules` carries only the OCR block.
  **OpenCode V2 reads `AGENTS.md` only and ignores `CLAUDE.md`** — so every
  OpenCode user silently misses the Code Conventions and Release Process, the most
  consequential instructions in the repo.
- **No OpenCode configuration exists.** No `opencode.json`, no `.opencode/`, no
  OpenCode agents, no OpenCode MCP block.
- **MCP defined in one native shape.** `.mcp.json` uses Claude's `mcpServers`
  shape; OpenCode needs `opencode.json` → `mcp.servers`.
- **Sub-agents are Claude-only.** `.claude/agents/**` uses rich Claude-only
  frontmatter OpenCode can't read.

The project *already* commits to a single-source-of-truth + projection model for
OCR **assets** (`packages/agents/` → `ocr update` → `.ocr/` → pointer files +
managed-block injection). This change adds the **cross-harness** layer that the
asset pipeline doesn't cover, built as a clean, extensible adapter model so
**extending either harness — or adding a new one — is one uniform, simple, robust
step.**

## Design stance (the decision the change commits to)

**Three concepts, nothing else** — the simplest model that keeps both harnesses
complete *and* extensible:

1. **Canonical source (single source of truth).** `AGENTS.md` (context),
   `mcp-servers.json` (MCP), `.claude/agents/**` (agents), `.claude/commands/**`
   + OCR commands (commands), `.claude/skills/**` (skills) — authored once, repo-
   level.
2. **`HarnessAdapter` (the strategy/adapter).** One small module per harness — the
   *only* place harness-specific knowledge lives:
   `{ id, reserved[], project(src) → native files }`. **Adding a harness = one
   adapter + register**; every existing source projects through it immediately.
3. **`sync` + `doctor`.** `sync` runs every adapter's `project()` deterministically
   and idempotently; `doctor` verifies each generated file matches its source and
   reports drift (never deletes).

**Shared vs reserved (the split everything hangs on):** *shared* surfaces
(context, MCP, agents, commands, skills) are projected from one source; *reserved*
surfaces are harness-native and **never clobbered** — Claude
`.claude/settings.json`/`.claude-plugin/**`; OpenCode `opencode.json` reserved
keys + `.opencode/plugins/**`. **Permissions/hooks stay hand-owned per harness for
now** (a shared policy layer is deferred).

**Three projection kinds, by who consumes the file:**
- **Generated full content** (harness loads bytes, no include):
  `.windsurfrules`, `GEMINI.md`, `.github/copilot-instructions.md`, `opencode.json`,
  `.mcp.json`, `.opencode/{agents,commands,skills}/**`.
- **`@`-import pointer** (Claude resolves `@path`): `CLAUDE.md` → `@AGENTS.md`
  (required — a coexisting `CLAUDE.md` otherwise *suppresses* `AGENTS.md`).
- **Model-followed pointer** (the model reads + acts): `.opencode/commands/ocr/*`
  → `.ocr/commands/*`.

**Symlinks are rejected**: not OS-agnostic (Windows `core.symlinks=false`), not
deterministic, and Claude refuses to Edit/Write through them. The `@`-import
replaces them cross-platform.

**Tooling is decoupled from the published library.** The sync/doctor tooling lives
in a new top-level **`tools/harness/`** (mirroring the repo's existing
`.github/scripts/` shape: `private: true`, `type: module`, non-nx, CI-tested
directly) — **structurally outside the pnpm workspace and the release set**, so it
can never be published. It is **self-contained**: it does not import from
`packages/cli` (the published consumer CLI). See `design.md` "Tooling home."

## What Changes

- **Canonical context file.** Promote `AGENTS.md` to the single source of truth
  for shared project instructions. Move Code Conventions + Release Process out of
  `CLAUDE.md` into it. `CLAUDE.md` becomes a **`@AGENTS.md` pointer**;
  `.windsurfrules`, `GEMINI.md`, `.github/copilot-instructions.md` become
  **generated full content**; OpenCode reads `AGENTS.md` directly.
- **Harness-adapter layer (the headline).** A `tools/harness/` package with a
  `HarnessProjector` interface, a **Claude** projector and an **OpenCode** projector, and
  a **default pointer/passthrough renderer** so an unhandled surface degrades to a
  *valid, reported* projection. New harness = one adapter.
- **Single canonical MCP source.** Introduce repo-root `mcp-servers.json`; generate
  *both* `.mcp.json` (Claude) and the `opencode.json` `mcp` block from it.
- **Agent bridge.** The OpenCode adapter generates `.opencode/agents/**` from
  `.claude/agents/**` with **explicit `permissions`** (deny the non-listed; never
  the permissive `*:* allow` default) — no raw symlink.
- **Command + skill projection.** Project `.opencode/commands/ocr/*` pointer files
  and mirror the OCR skill to `.opencode/skills/ocr/`; add an explicit
  `skills: [".claude/skills"]` to `opencode.json` (deterministic discovery).
- **Reserved files stay reserved.** Claude `.claude/settings.json`/
  `.claude-plugin/**`; OpenCode `opencode.json` reserved keys (via a hand-authored
  `.opencode/opencode.reserved.jsonc` the generator merges) + `.opencode/plugins/**`.
- **Sync + drift guard.** `sync` (regenerate all projections idempotently +
  deterministically) and a `cross-harness` `doctor` check (drift between canonical
  sources and projections, reserved files untouched).

**Not breaking:** all changes are additive projections. Claude Code behavior is
unchanged (its files keep working; they additionally become generated where they
duplicate shared content). OpenCode goes from "unconfigured" to "fully
configured." No user-customized `.ocr/config.yaml` or reviewer is touched.

**Deferred (on purpose):** a shared cross-harness policy layer (`policies.json`),
a neutral agent IR, and a global extension-type / completeness engine — tracked as
follow-ups, not part of this change. See `design.md` "Deferred."

## Build Sequence (tasks.md)

Staged so each step is independently reviewable; see `design.md` for the three-
concept model, the shared-vs-reserved split, and the per-surface strategy.

## Impact

- Affected specs: **new** `cross-harness-sync` (the harness-adapter model +
  decoupled tooling + per-surface projections + reserved files + determinism),
  `context-discovery` (AGENTS.md is canonical), `slash-commands` (OpenCode
  namespacing), `plugin-distribution` (OpenCode added to the compatibility matrix).
- Affected code (when implemented): **new `tools/harness/`** (self-contained,
  non-published: `adapters/{claude,opencode}.ts`, `renderer.ts` default pointer,
  `mcp.ts`, `agent-bridge.ts`, `opencode.ts`, `sync.ts`, `doctor.ts`,
  `index.ts`), new canonical `mcp-servers.json` + `AGENTS.md` canonicalization,
  new generated `.opencode/**` + `opencode.json` + updated `CLAUDE.md`/
  `.windsurfrules`, `.nxignore` entry for `tools/harness`, and a root
  `sync-harness` script.
- Depends on: the existing `AI_TOOLS` registry (`packages/cli/src/lib/config.ts`,
  already lists `opencode`) as a *reference* for native conventions (not an import),
  and `add-host-capability-model` (OpenCode `supportsSubagentSpawn = true`).
- Decisions (locked — see `design.md` "Decisions (Locked)"): `CLAUDE.md` = `@AGENTS.md`
  pointer; curated agent allowlist (`--all` opt-in); separate
  `.opencode/opencode.reserved.jsonc` reserved input; **blocking** `sync --check`
  CI gate from day one; `doctor` **hard-fails** if the `@AGENTS.md` import is missing
  or unresolvable.
