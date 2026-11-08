> Tasks are intentionally unchecked — this change is proposed, not yet built.
> Chunked to ≤2h each; ordered by dependency. Test tasks are called out inline per
> the repo's testing conventions. Concept 2 (the adapter model) is the foundation
> every later stage instantiates.

## 1. Canonical context (`AGENTS.md`)

- [x] 1.1 Move Code Conventions + Release Process out of `CLAUDE.md` into `AGENTS.md` (preserve the existing OpenSpec + OCR managed blocks; fix the cross-reference so it points at `AGENTS.md`)
- [x] 1.2 `CLAUDE.md` becomes a thin **`@AGENTS.md` import pointer** (+ any Claude-only reserved note *after* the import line); `.windsurfrules`/`GEMINI.md`/copilot are generated **full content** (no `@`-import there)
- [x] 1.3 `doctor` guardrail: **fail hard** (not a warning) if the `@AGENTS.md` import line is missing or unresolvable in `CLAUDE.md` (so a future edit can't silently suppress `AGENTS.md`)
- [x] 1.4 Test: round-trip — edit `AGENTS.md`, regenerate, assert the `CLAUDE.md` import resolves and `.windsurfrules`/`GEMINI.md` match; a hand-edit of a generated file is detected as drift

## 2. Scaffold `tools/harness/` (decoupled, non-published)

- [x] 2.1 New `tools/harness/` mirroring `.github/scripts/` shape: `package.json` (`private: true`, `type: module`), a `tsconfig.json`, and an entry to `.nxignore` (non-nx, CI typechecks/tests directly); add a root `sync-harness` script (`node --import tsx tools/harness/index.ts`)
- [x] 2.2 `tools/harness/adapter.ts`: the `HarnessAdapter` interface — `{ id, reserved[], project(src): NativeArtifact[] }` + a `writeGenerated(path, content)` helper (banner-stamped, LF, idempotent)
- [x] 2.3 Default renderer (`renderer.ts`): a pointer/passthrough fallback for any surface a harness can't render natively — emits a valid, *reported* projection, never a silent omission or broken file
- [x] 2.4 `tools/harness/adapters/{claude.ts,opencode.ts}`: start as valid-but-minimal adapters (read `AI_TOOLS` in `packages/cli/src/lib/config.ts` as a *reference* for native conventions — **no import** into `tools/harness`; fill in stages 3–6)
- [x] 2.5 Test: each adapter `project`s to a parseable artifact; the default renderer produces a valid pointer for an unhandled surface; `project` twice → no diff; assert `release.projects` (nx.json) matches no `tools/**` path (decoupling guard)

## 3. Single canonical MCP source

- [x] 3.1 New repo-root `mcp-servers.json` as the single source of truth for the current `.mcp.json` servers (`claude-flow`, `ruflo`), with transport/`disabled` fields
- [x] 3.2 `tools/harness/mcp.ts`: Claude adapter → `.mcp.json` `mcpServers`; OpenCode adapter → `opencode.json` `mcp.servers` (`args`→`command`, `env`→`environment`, `autoStart:false`→`disabled:true`, `url`→`type:"remote"`; Claude remote needs explicit `type: http|sse|ws`)
- [x] 3.3 Banner both generated targets; wire into `sync`
- [x] 3.4 Test: both outputs parse, are semantically equal, and preserve current `.mcp.json` byte-for-byte on first run (regression guard)

## 4. OpenCode config surface

- [x] 4.1 `tools/harness/opencode.ts`: generate `opencode.json` = generated keys (`$schema`, `instructions: ["AGENTS.md", …]`, `mcp`, `agents`, `commands`, `skills`) **merged** with a hand-authored `.opencode/opencode.reserved.jsonc` (`permissions`/`policies`/`plugins`/`model`/`default_agent`)
- [x] 4.2 Command projection: `.opencode/commands/ocr/*` **pointer files** referencing `.ocr/commands/*.md`; verify `/ocr/review`, `/ocr/map` resolve (note slash-vs-colon vs Claude's `/ocr:review`)
- [x] 4.3 Skill projection: explicit `skills: [".claude/skills"]` (deterministic); mirror the OCR skill to `.opencode/skills/ocr/` as generated content (not OpenCode-discoverable); assert skill IDs match `^[a-z0-9]+(-[a-z0-9]+)*$`
- [x] 4.4 Test: generated `opencode.json` validates against `https://opencode.ai/config.json`; reserved keys survive the merge; `.opencode/commands/ocr/*` + `.opencode/skills/ocr/SKILL.md` exist and point at the right central paths

## 5. Agent bridge (Claude → OpenCode)

- [x] 5.1 `tools/harness/agent-bridge.ts` (inside the OpenCode adapter): convert `.claude/agents/**/*.md` → `.opencode/agents/**/*.md` (`mode`, `model`→`provider/model#variant`, body→`system`); ignore Claude-only fields (`capabilities`, `priority`, `hooks`)
- [x] 5.2 **Permissions (critical):** map Claude `tools` → explicit OpenCode `permissions` (allow listed, **deny the rest**); empty/absent `tools` → explicit least-privilege block, **never** the inherited `*:* allow` default
- [x] 5.3 **Identity:** map Claude `name` → OpenCode filename; default to a curated allowlist of OCR-invoked agents, `--all` for the full catalog
- [x] 5.4 Test: `tools:[Read,Grep]` → `permissions` denying `edit`/`shell`/`subagent`; empty `tools` → non-empty least-privilege block (**no** `*:* allow`); unknown frontmatter ignored without error

## 6. Sync + drift guard

- [x] 6.1 `tools/harness/index.ts`: full sync orchestrator that runs all enabled projectors over all canonical sources; deterministic + idempotent; supports `--check` (fail on stale) and `--dry-run` (show expected diffs without writing); proper error handling with exit codes; discrete projector loop via `isReservedMatch()` guard
- [x] 6.2 `tools/harness/doctor.ts`: expanded to all 6 checks — `checkImport()` (CLAUDE.md @AGENTS.md), `checkMcpSync()` (.mcp.json/.opencode-mcp.json ↔ mcp-servers.json), `checkAgentFreshness()` (.opencode/{agents,commands,skills} present + recent), `checkSkillIds()` (^[a-z0-9]+(-[a-z0-9]+)*$ validation), `checkAgentPermissions()` (non-empty permissions block), `checkReservedUntouched()` (report drift, never delete); exit 0 = clean, exit 1 = drift
- [x] 6.3 Blocking CI freshness gate: `sync-check` npm script chains `npx ocr update` then `ocr doctor --check`; exits 1 on any stale projection or drift; stdout shows summary lines per projector, stderr reserved for errors only

## 7. Documentation + reserved-file contract

- [x] 7.1 "Harness Compatibility" section in `AGENTS.md` (or `HARNESS.md`): the three-concept model, the shared-vs-reserved split, and the "extend once" workflow (author a canonical source → all harnesses re-render; add a harness = one adapter)
- [x] 7.2 Update `plugin-distribution` "Platform Compatibility Matrix" to add an OpenCode column (show both `/ocr/review` and `/ocr:review` per command)
- [x] 7.3 Update `packages/agents/README.md` + root `README.md` with the dual-harness workflow, `sync-harness`, and the `tools/harness/` home (and why it's decoupled from the published library)

## 8. Spec

- [x] 8.1 `cross-harness-sync` capability delta: canonical context source, harness-adapter model (shared-vs-reserved, new-harness = one adapter, safe default), **decoupled non-published tooling (`tools/harness/`)**, MCP single source, agent bridge, command/skill projection, reserved files, deterministic generation + drift detection
- [x] 8.2 `context-discovery`: "AGENTS.md Is Canonical For Shared Context"
- [x] 8.3 `slash-commands`: "OpenCode Command Namespacing"
- [x] 8.4 Run `openspec validate add-cross-harness-sync --strict` and resolve all issues
