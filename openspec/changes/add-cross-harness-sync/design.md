## Context

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
  shape (`command` + `args` + `autoStart`); OpenCode needs `opencode.json` →
  `mcp.servers` (`type` + `command` array + `environment` + `disabled`).
- **Sub-agents are Claude-only.** `.claude/agents/**` uses rich Claude-only
  frontmatter OpenCode can't read.

The project *already* commits to a single-source-of-truth + projection model for
OCR **assets**: `packages/agents/` (source) → `ocr update` → `.ocr/` (central
runtime) → pointer files in tool dirs (`installCommandsForTool` in
`installer.ts`) + managed-block injection (`injector.ts`). This change adds the
**cross-harness** layer that the asset pipeline doesn't cover (context, MCP,
agents, commands, skills → OpenCode + Claude config), built as a clean,
extensible adapter model.

**All behavioral claims below were verified against primary docs** (OpenCode V2
`opencode.ai/v2/docs/*`; Claude Code `code.claude.com/docs/en/*`) via a research
subagent. Citations are in `verification.md`.

### Native conventions (verified)

| Surface | Claude Code (native) | OpenCode V2 (native) | Shared today? |
|---|---|---|---|
| Context | `CLAUDE.md` (+ `.claude/CLAUDE.md`, `CLAUDE.local.md`, global `~/.claude/CLAUDE.md`); **also `AGENTS.md` since v2.1.277, but *suppressed* by a coexisting `CLAUDE.md`** | `AGENTS.md` **only** — no `CLAUDE.md` fallback | **Divergent** — each harness ignores the other's file by default |
| Sub-agents | `.claude/agents/**/*.md` — identity = **`name` frontmatter**, nested dirs organizational; fields `name`,`description`,`tools`,`disallowedTools`,`model`,`color`,`maxTurns`,… | `.opencode/agents/**/*.md` — identity = **path**; fields `description`,`mode`,`model`,`permissions`,`color`,`steps`,`hidden`; body = `system` | **No** — different frontmatter + identity |
| Commands | `.claude/commands/**/*.md` → nested = **colon** (`/frontend:component`); `$ARGUMENTS`/`$ARGUMENTS[n]` | `.opencode/commands/**/*.md` → nested = **slash** (`/team/review`); `$ARGUMENTS`/`$1`/`$2` | **No** — OpenCode doesn't discover `.claude/commands`; nesting differs |
| Skills | `.claude/skills/<id>/SKILL.md` (Agent Skills standard) | `.opencode/skills/<id>/SKILL.md` **+ auto-discovers `.claude/skills` & `.agents/skills`** | **Yes** — but Claude-only frontmatter isn't honored |
| `@`-include | **Yes** — `@path` in `CLAUDE.md` is harness-resolved (4-hop depth) | **No** — no in-file include | **No** — asymmetric |
| MCP | `.mcp.json` → flat top-level `mcpServers` `{command,args,env,…}` | `opencode.json` → `mcp.servers` `{type,command[],environment,disabled}` | **No** — incompatible shapes |
| Permissions | `.claude/settings.json` `permissions` (`allow`/`ask`/`deny`); order deny→ask→allow | `opencode.json` `permissions` (ordered `{action,resource,effect}`); **empty ⇒ `*:* allow` (full access)** | **No** — different shape + default |

**Verified facts that shape the design:**
- A coexisting `CLAUDE.md` **suppresses** `AGENTS.md` for Claude by default
  (`claude-md-or-agents-md`). To make Claude consume the canonical `AGENTS.md`,
  `CLAUDE.md` must **`@AGENTS.md`-import it**. We use the import (robust, no
  settings change).
- A custom OpenCode subagent with empty/absent `permissions` inherits `*:* allow`
  (full tool access), and a subagent's permissions are *not* a subset of its
  parent's. So a Claude subagent's `tools` allowlist must be translated into
  **explicit OpenCode `permissions`** (deny the non-listed), or the agent gets
  full access.
- A Claude skill's `allowed-tools` is **not** interpreted by OpenCode even though
  `.claude/skills` is auto-discovered. `disable-model-invocation` *is* honored by
  both.
- Command nesting differs: the same command resolves to **`/ocr/review`** in
  OpenCode (slash) and **`/ocr:review`** in Claude (colon). Pointer *content* is
  shared; only the invocation namespace differs.
- Agent identity differs: Claude identifies by the `name` frontmatter field;
  OpenCode by **path**. The converter maps `name` → the OpenCode filename.

### Existing tooling architecture (grounds the tooling-home decision)

The repo has **three tiers** of tooling:

| Tier | Location | Published? | Nx? | Role |
|---|---|---|---|---|
| **Consumer CLI** | `packages/cli` (`@open-code-review/cli`, the `ocr` bin) + `packages/agents` (assets) | ✅ | app | Installs OCR into a *user's* harness. `installer.ts`/`injector.ts` read `@open-code-review/agents` → write pointer files + managed blocks. `AI_TOOLS` registry (`config.ts`) already lists `opencode`. |
| **Repo-maintenance tooling** | `.github/scripts/` (`private: true`, `type: module`, in `.nxignore`, CI typechecks/tests directly) | ❌ | non-nx | CI helper logic. The repo's *established* pattern for non-published, non-nx tooling. |
| **App dev tooling** | `packages/dashboard/scripts/dev.ts` (`dashboard` excluded via `!packages/dashboard`) | ❌ | app | Per-app dev helpers. |

The existing SOT→projection machinery (`installer.ts`/`injector.ts`/`config.ts`)
is **consumer-facing** — it installs OCR into a *user's* repo. The cross-harness
sync is **repo-maintenance** — it regenerates *this repo's own* harness config.
Folding it into `packages/cli` would ship maintainer logic to consumers. So the
new tooling belongs in the **non-published repo-maintenance tier** and is
**self-contained** (it does *not* import from `packages/cli`).

## The model: three concepts, nothing else

The objective is a **clean architecture for the harness-specific reserved files
that control structural context**, supporting Claude + OpenCode conventions today
and **extensible to any harness as one strategy/adapter** — *as simply and
robustly as possible*. Three concepts:

### 1. Canonical source (single source of truth)

The shared structural context, authored once at the repo level:

- **`AGENTS.md`** (repo root) — universal instructions. OpenCode reads it
  directly; Claude imports it via `@AGENTS.md` in `CLAUDE.md`.
- **`mcp-servers.json`** (repo root) — the canonical MCP server list (the source
  both `.mcp.json` and OpenCode's `mcp` block are generated from).
- **`.claude/agents/**`** — the agent source of truth (Claude identity).
  OpenCode agents are *adapted* from it (see #3, the bridge).
- **`.claude/commands/**`** + OCR commands (`packages/agents/commands/` →
  `.ocr/commands/`) — command sources.
- **`.claude/skills/**`** — the claude-flow skill library (Agent Skills standard).

OCR **assets** (`packages/agents/**` → `.ocr/`) are already handled by the
*existing* published CLI (`ocr update`); the harness-sync tool does **not**
re-touch that pipeline.

### 2. `HarnessProjector` (the projection strategy)

One small module per harness — the *only* place harness-specific knowledge lives:

```ts
interface HarnessProjector {
  id: string;                    // "claude" | "opencode" | "cursor" | …
  reserved: string[];            // files this harness OWNS — sync never clobbers
  project(src): NativeArtifact[]; // render canonical source → this harness's native files
}
```

- **Claude** owns: `CLAUDE.md` (`@AGENTS.md` pointer), `.mcp.json`,
  `.claude/agents/**`, `.claude/commands/**`, `.claude/skills/**`; **reserved**
  (never clobbered): `.claude/settings.json` (hooks/statusLine/`claudeFlow`/
  attribution/env), `.claude/settings.local.json` (gitignored),
  `.claude/helpers/**`, `.claude-plugin/**`.
- **OpenCode** owns: `opencode.json` (generated keys),
  `.opencode/agents/**`, `.opencode/commands/**`, `.opencode/skills/**`; reads
  `AGENTS.md` directly; reuses `.claude/skills` (native discovery); **reserved**:
  `opencode.json` reserved keys (`permissions`/`policies`/`plugins`/`model`/
  `default_agent`, via a hand-authored reserved input) + `.opencode/plugins/**`.

**The whole extensibility story is: add a harness = one projector + register.** Every
existing canonical source projects through its `project()` immediately. A **default
pointer/passthrough renderer** covers any surface a harness can't render natively,
so an unhandled surface degrades to a *valid, reported* projection instead of a
silent omission or a broken file — the same "unknowns degrade gracefully and say
so" philosophy as `add-host-capability-model`. This is deliberately **not** a
global 6-type registry: the projector's `project()` already handles all of its own
files, so a separate extension-type system is unnecessary machinery.

**Return semantics:** each `project(src)` call returns the *complete* set of artifacts
for that one source; sync iterates all sources × all projectors. Deletion is additive
only (doctor reports orphan projections on stale removes). The `reserved[]` list is
checked before every write: if a path is reserved, the projector skips it without error.

### 3. `sync` + `doctor`

- **`sync`** runs every enabled projector's `project()` over the canonical sources,
  **deterministically** and **idempotently**. Generated files are banner-stamped;
  re-running yields no diff.
- **`doctor`** verifies each *generated* file matches its canonical source and
  reports drift — it **never deletes** user-owned files. Checks: the `CLAUDE.md`
  `@AGENTS.md` import is present and resolves; `.mcp.json` + `opencode.json` `mcp`
  match `mcp-servers.json`; `.opencode/*` is present and non-stale; every
  generated OpenCode agent has a non-empty `permissions` block; reserved files are
  untouched. Internal checks are discrete functions (`checkImport`, `checkMcpSync`,
  `checkAgentPermissions`, `checkReservedUntouched`) run by a single orchestrator;
  the CI gate is a thin wrapper around doctor's exit code.

**CLI Contract:** `sync [--dry-run]` projects all sources, returns 0 if in-sync;
`doctor` runs all checks and returns 0 (clean) or 1 (drift reported to stderr);
`sync --check` runs sync then doctor, returning 1 on any stale projection. stdout
shows summary lines per projector; stderr is for errors only. All operations are
idempotent — no state file needed beyond generated outputs.

**Default renderer shape:** for an unsupported surface, the projector emits a
`.README` companion with short markdown: `<!-- auto-generated: this harness does not
support <surface> -->` plus a link to the canonical source. Non-destructive,
discoverable, never overwrites user content.

### The one split everything hangs on — shared vs reserved

- **Shared** (one source → N projections): context (`AGENTS.md`), MCP
  (`mcp-servers.json`), agents (`.claude/agents`), commands, skills.
- **Reserved** (harness-native, hand-owned, *never clobbered*): Claude
  `.claude/settings.json` (hooks/statusLine/`claudeFlow`/attribution/env),
  `settings.local.json`, `.claude-plugin/**`; OpenCode `opencode.json` reserved
  keys (`permissions`/`policies`/`plugins`/`model`/`default_agent`) +
  `.opencode/plugins/**`. **Permissions/hooks stay hand-owned per harness for
  now** — a shared cross-harness policy layer is *deferred* (see Non-Goals).
  "Reserved" ≠ "can't extend"; it means the harness owns the native file.

## Tooling home (the decoupling constraint)

The sync/doctor tooling lives in **`tools/harness/`**, a new top-level directory
that **mirrors the repo's existing `.github/scripts/` shape**:

- `package.json`: `private: true`, `type: module` (only, for Node type-stripping).
- **Non-nx**: added to `.nxignore` with a comment (like `.github/scripts`); CI
  typechecks and tests it *directly*, not through the nx graph.
- **Structurally outside the pnpm workspace** (`packages/*`) **and the release set**
  (`release.projects` globs `packages/*` minus `dashboard`/`shared/*`/`*-e2e`), so
  it **can never be published** — no `nx.json` exclusion to remove.
- **Self-contained**: it does *not* import from `packages/cli`. Harness-specific
  knowledge lives in `tools/harness/adapters/{claude,opencode}.ts`; a tiny
  `writeGenerated()` helper and a `HarnessProjector` interface are local.

Run via `tsx` (already a root devDep): `pnpm --filter`-free, e.g.
`node --import tsx tools/harness/sync.ts` / a root script
`"sync-harness": "node --import tsx tools/harness/index.ts"`.

**Why not `packages/cli`:** that package is *published* (`@open-code-review/cli`);
folding repo-maintenance logic in would ship it to every consumer. **Why not
`packages/harness-sync/`:** decoupling there is *conventional* (a `!` exclusion
someone could remove); `tools/` is *structural* (outside the glob entirely).

## Decisions

### D1 — `AGENTS.md` is the canonical context source; `CLAUDE.md` is a pointer; others are generated

- **`CLAUDE.md` → `@AGENTS.md` pointer** (Claude resolves the import into context;
  required because a coexisting `CLAUDE.md` otherwise *suppresses* `AGENTS.md`). A
  Claude-only reserved note, if any, is appended *after* the import line.
- **`.windsurfrules` / `GEMINI.md` / `.github/copilot-instructions.md` → generated
  full content** (no `@`-import in those harnesses), as `injector.ts` already does
  for `.windsurfrules`.
- **OpenCode → reads `AGENTS.md` directly**; `opencode.json`
  `instructions: ["AGENTS.md", …]` makes the discovery explicit and deterministic.

Because `CLAUDE.md` is a pointer, "single source of truth" holds at the byte level
for the Claude side: exactly one authored context file (`AGENTS.md`).

### D2 — One canonical MCP definition, two generated targets

`mcp-servers.json` (repo root) is the single source of truth
(name, transport, command/args, env, `disabled`). The **Claude** projector generates
`.mcp.json` (`{ mcpServers: { <name>: { command, args, env } } }`); the **OpenCode**
projector generates the `opencode.json` `mcp.servers` block
(`{ <name>: { type, command[], environment, disabled } }`). Mapping: `args` →
appended to `command`; `env` → `environment`; `autoStart: false` → `disabled: true`;
a `url` selects `type: "remote"` (Claude's remote needs explicit
`type: http|sse|ws`). Both targets carry a generated-file banner. This removes the
`.mcp.json`/`opencode.json` drift vector entirely.

### D3 — Agent bridge: generated content, with explicit permission mapping (no symlink)

The **OpenCode** adapter converts `.claude/agents/**/*.md` →
`.opencode/agents/**/*.md`:

- **Identity:** Claude's `name` frontmatter → the OpenCode filename (path *is* the
  OpenCode identity; nested dirs are organizational for Claude but ID-significant
  for OpenCode).
- **Permissions (critical):** Claude `tools: [Read, Grep, …]` → OpenCode
  `permissions` that `allow` the listed actions and **explicitly `deny` the rest**
  (`edit`, `shell`, `subagent`, …). Empty/absent `tools` → an explicit
  least-privilege block, **never** the inherited `*:* allow`. `doctor` asserts
  every generated agent has a non-empty `permissions` block.
- `model` → `provider/model#variant`; `maxTurns` ≈ `steps`; Claude-only
  `capabilities`/`priority`/`hooks` ignored; body preserved as OpenCode `system`.
- **Curation:** default list is *all agents from `.claude/agents/**`* (conservative —
  no agent loses permissions); `--all` flag has no effect initially. Curators can
  narrow to a subset by editing the generated list; every agent always gets an
  explicit non-empty `permissions` block (never the inherited `*:* allow`).
- **Direction:** Claude → OpenCode only (Claude's rich frontmatter is the source
  and where edits happen).

### D4 — Commands: project pointer files; document the namespace divergence

The **OpenCode** adapter projects `.opencode/commands/ocr/*` **pointer files**
referencing `.ocr/commands/*.md` (OpenCode is already in `AI_TOOLS`), and mirrors
non-OCR `.claude/commands/**` to `.opencode/commands/**`. The two share
`$ARGUMENTS` syntax; harness-only frontmatter is ignored by the other harness.
**Documented divergence:** the same command resolves to **`/ocr/review`** in
OpenCode and **`/ocr:review`** in Claude; the `plugin-distribution` matrix shows
both names.

### D5 — Skills: rely on native discovery; mirror the OCR skill

- The claude-flow **skill library** (`.claude/skills/**`) is auto-discovered by
  OpenCode; an explicit `skills: [".claude/skills"]` in `opencode.json` makes it
  deterministic.
- The **OCR skill** (`.ocr/skills/`) is *not* discovered, so the OpenCode adapter
  mirrors it to `.opencode/skills/ocr/` as **generated content**.
- Skill-level `allowed-tools` is *not* honored by OpenCode; such gating is
  expressed in OpenCode permissions (or dropped with a documented note).
  `disable-model-invocation` is honored by both.

### D6 — Reserved files are explicitly *not* projected

Each harness's genuinely native, hand-owned files stay untouched. For OpenCode,
`opencode.json` holds *both* generated keys (`mcp`, `instructions`, `agents`,
`commands`, `skills`) and reserved keys; the reserved keys live in a **separate
hand-authored input** (`.opencode/opencode.reserved.jsonc`) that the generator
*deep-merges* into the generated `opencode.json` (reserved wins on conflict, never
drops a key from either side), so the generator is deterministic and non-destructive.

### D7 — Determinism contract

Generated output is reproducible byte-for-byte (git-tracked, CI-checkable):
fixed templates, **no wall-clock in committed output**, stable key ordering, **LF
line endings** (`.gitattributes` for generated paths), and **idempotency** (re-run
= no diff; a **blocking** `--check` freshness gate **fails the build** on any diff —
decided blocking from day one, not a warn-then-block transition).

## Risks / Trade-offs

- **Permission regression in the agent bridge** (D3) — *verified critical:*
  OpenCode's permissive default means a converter that omits `permissions` grants
  full access. Mitigation: emit explicit deny rules + `doctor` asserts non-empty
  `permissions`. No raw symlink.
- **`CLAUDE.md` `@`-import fragility** (D1) — import is 4-hop max. Mitigation:
  `AGENTS.md` is same-dir (always true in-repo); the cross-harness doctor check
  **fails hard** if the `@AGENTS.md` import line is missing or unresolvable — a
  guardrail so a future edit can't silently suppress `AGENTS.md` (decided as a hard
  requirement, not a warning).
- **Command namespace divergence** (D4) — `/ocr/review` vs `/ocr:review`.
  Mitigation: document both in the matrix; keep pointer content shared.
- **Generator clobbers reserved config** (D6) — reserved keys are a separate
  merged input; `.claude/settings.json` is outside the generated set.
- **OpenCode frontmatter evolution** → pin the V2 shapes to the docs;
  `--dry-run` shows the diff before it lands.
- **Two MCP schemas** (D2) → one source + generator; tests assert both parse, are
  semantically equal, and preserve current `.mcp.json` on first run.
- **Tooling-home drift** — `tools/harness/` could accidentally be added to the
  release set. Mitigation: it's *structurally* outside `packages/*` (the release
  glob), so no `nx.json` change can include it; a CI assertion that
  `release.projects` matches no `tools/**` path guards it.

## Deferred (kept out of scope on purpose)

- **Cross-harness permission/hook translation (a shared `policies.json`).**
  Permissions/hooks stay **reserved and hand-owned per harness** for now. A shared
  intent layer that projects to both native shapes is tracked as a follow-up if
  parity is actually needed — it adds an axis of moving parts we don't yet need.
- **Neutral agent IR.** True symmetry (author an agent once, generate *both*
  `.claude/agents` and `.opencode/agents`) is the long-run goal. We ship the
  **projector** (OpenCode projected *from* Claude) now; the IR is a follow-up.
- **Global extension-type registry + "completeness engine."** The projector's
  `project()` already covers its surfaces, and `doctor` already verifies
  generated-vs-source. A separate type registry and a completeness engine are
  unnecessary machinery; `doctor` drift detection is sufficient.

## Migration Plan

All additive; Claude Code keeps working throughout. No user-data migration
(`.ocr/config.yaml`, reviewer personas, sessions, `.claude/settings.local.json`
untouched).

1. **Canonicalize context.** Move Code Conventions + Release Process into
   `AGENTS.md`; make `CLAUDE.md` a `@AGENTS.md` pointer; regenerate `.windsurfrules`
   as full content.
2. **Scaffold `tools/harness/`** (projector interface + Claude/OpenCode projectors +
   default renderer + `writeGenerated`), decoupled from `packages/cli`.
3. **MCP canonical.** Add `mcp-servers.json`; generate `.mcp.json` (preserve
   current content) + `opencode.json` `mcp` block.
4. **OpenCode config + surfaces.** Generate `opencode.json` (merged canonical +
   reserved) + `.opencode/{agents,commands,skills}`.
5. **Agent bridge** with explicit permissions (never the permissive default).
6. **`sync` + `doctor`** and a **blocking** CI freshness gate (`sync --check`).
7. **Docs + compatibility matrix.** `AGENTS.md` "Harness Compatibility" section,
   `plugin-distribution` OpenCode column (both command names), READMEs.

## Decisions (Locked)

All five resolved to the recommended option **except #4**, which is **blocking from
day one** (not a warn-then-block transition):

1. **`CLAUDE.md` form → `@AGENTS.md` pointer.** A one-line import; Claude pulls
   `AGENTS.md` into context. True single source, cross-platform, no settings
   change. (No full duplicate — that would reintroduce a second authored context
   file.)
2. **Agent catalog scope → curated allowlist by default, `--all` opt-in.** Project
   only the agents OCR's workflow actually invokes; `--all` mirrors the full
   `.claude/agents/**` catalog for those who want it.
3. **OpenCode reserved input → separate `.opencode/opencode.reserved.jsonc`.**
   Hand-authored reserved keys the generator *merges* into `opencode.json`; keeps
   the generator non-destructive. (Not a managed block inside one `opencode.json`.)
4. **CI gate → blocking `sync --check`.** A stale or incomplete projection **fails
   the build** from the start — the hard guarantee, not a doctor-only warning.
5. **`@AGENTS.md` guardrail → hard requirement.** The cross-harness doctor check
   **fails** if the import line is missing or unresolvable, so a future `CLAUDE.md`
   edit can't silently suppress `AGENTS.md`. (Not a warning.)
