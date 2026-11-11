# Review Handoff — Cross-Harness Sync Design

## Context: What we're trying to do

Make the **open-code-review** repo's OWN agent configuration a **Single Source of Truth** consumed by both **Claude Code** and **OpenCode V2**, projected per harness through a clean, extensible, minimal **harness-adapter** model.

Hard constraints from the user:
1. **No filesystem symlinks** (OS-agnostic, deterministic).
2. The sync/doctor tooling must be **decoupled** from the published OCR library (`@open-code-review/cli` + `@open-code-review/agents`, the `release.projects` set in `nx.json`) — it lives in a new top-level `tools/harness/` structurally outside the pnpm workspace, self-contained (does NOT import from `packages/cli`).
3. A shared cross-harness permission/hook policy layer (`policies.json`), a neutral agent IR, and a "completeness engine" are all **DEFERRED** (permissions/hooks stay hand-owned per harness for now).

## What's been done so far

### OpenSpec change `add-cross-harness-sync` — authored, passes `openspec validate --strict`

**Architecture = THREE concepts:**
1. **CANONICAL SOURCE (SOT):** `AGENTS.md` (context; OpenCode reads it directly, Claude reaches via `@AGENTS.md` import), `mcp-servers.json` (repo-root MCP SOT), `.claude/agents/**` (agent SOT), `.claude/commands/**` + OCR commands.
2. **HarnessAdapter** strategy `{ id, reserved[], project(src) -> native artifacts }` — Claude adapter + OpenCode adapter + a default pointer/passthrough renderer; "add a harness = one adapter".
3. **`sync` + `doctor`** (deterministic, idempotent, drift-reporting, never deletes user files).

**The one split everything hangs on:** SHARED surfaces (context, MCP, agents, commands, skills → projected from one source) vs RESERVED surfaces (harness-native, hand-owned, NEVER clobbered: Claude `.claude/settings.json`/`.claude-plugin/**`; OpenCode `opencode.json` reserved keys via a hand-authored `.opencode/opencode.reserved.jsonc` the generator merges).

### Five decisions are LOCKED (all to recommended option, except #4 which is blocking from day one):
1. **`CLAUDE.md` = `@AGENTS.md` pointer** (not a full duplicate)
2. **Curated agent allowlist by default**, `--all` opt-in
3. **Separate `.opencode/opencode.reserved.jsonc`** reserved input merged by the generator
4. **BLOCKING `sync --check` CI gate from day one** (not a warn-then-block transition)
5. **`doctor` HARD-FAILS** if the `@AGENTS.md` import is missing/unresolvable (not a warning)

### Verified facts (from primary docs, in `verification.md`)
- OpenCode reads `AGENTS.md` only (no `CLAUDE.md` fallback).
- A coexisting `CLAUDE.md` **suppresses** `AGENTS.md` for Claude by default (`claude-md-or-agents-md`), so the `@`-import is **REQUIRED**.
- OpenCode subagent with empty `permissions` defaults to `*:* allow` (full access); a subagent's perms are NOT a subset of its parent's, so the agent bridge MUST emit explicit deny-rules.
- Claude skill `allowed-tools` is NOT honored by OpenCode.
- Command nesting differs (`/ocr/review` slash in OpenCode vs `/ocr:review` colon in Claude).
- Agent identity differs (Claude = `name` frontmatter, OpenCode = path).

## Files to read (in order of priority)

**Plan (subject under review):**
- `openspec/changes/add-cross-harness-sync/proposal.md`
- `openspec/changes/add-cross-harness-sync/design.md`
- `openspec/changes/add-cross-harness-sync/tasks.md`
- `openspec/changes/add-cross-harness-sync/verification.md`
- `openspec/changes/add-cross-harness-sync/specs/cross-harness-sync/spec.md`
- `openspec/changes/add-cross-harness-sync/specs/context-discovery/spec.md`
- `openspec/changes/add-cross-harness-sync/specs/slash-commands/spec.md`

**OCR review mechanism + personas:**
- `.ocr/skills/SKILL.md` (Tech Lead role, 8-phase workflow, reviewer team)
- `.ocr/skills/references/workflow.md` (the 8-phase process)
- `.ocr/skills/references/reviewers/architect.md` (lead architect persona)
- `.ocr/skills/references/reviewers/martin-fowler.md`

**Corroboration sources:**
- `CLAUDE.md`, `AGENTS.md`, `.windsurfrules`, `.mcp.json` (current divergent files)
- `nx.json` (release.projects), `pnpm-workspace.yaml`, `package.json`
- `.github/scripts/package.json` + `.github/scripts/` (existing non-published pattern the plan mirrors)
- `.nxignore`
- `packages/cli/src/lib/config.ts` (AI_TOOLS registry), `installer.ts`, `injector.ts`
- `.claude/agents/**` (agent SOT)

## Your task: TIGHT 2-REVIEWER OCR LOOP

This is a **design review** of the plan (no code implemented yet). Reviewers evaluate architecture, evolution-readiness, internal consistency, spec delta correctness/completeness, and task ordering feasibility.

### Reviewers
- **Lead Architect** = `architect` persona (boundaries, coupling/cohesion, contracts/interfaces, integration patterns, evolutionary architecture, drift)
- **Martin Fowler** = `martin-fowler` persona (code smells, refactoring, patterns-vs-over-engineering, evolutionary design)

### Loop procedure (tight and bounded — cap at 2 rounds)
1. **Round N:** Each of the 2 reviewers reviews the CURRENT state of the plan. Write focused findings tagged `critical` / `important` / `consideration`, each with a location (file + section/line), evidence, and concrete minimal suggestion.
2. **Synthesize** the two into one prioritized list: dedupe overlaps, mark genuine disagreements explicitly, assign verdict (APPROVE / APPROVE WITH CHANGES / CHANGES REQUESTED).
3. **Address:** For each finding you judge VALID + LOW-RISK + clearly supported, make a SURGICAL revision to the plan docs. Do NOT unilaterally change the architecture or the 5 locked decisions — record those as "NEEDS USER DECISION" with rationale. After every revision, run `openspec validate add-cross-harness-sync --strict` and it MUST stay green.
4. **Repeat** from step 1 as a new round ONLY IF prior synthesis left new critical/important findings unaddressed. STOP when: (a) both report no new critical/important findings (APPROVE / APPROVE WITH CHANGES), OR (b) 2 rounds completed. Whichever first.

### Output location
Write under `openspec/changes/add-cross-harness-sync/review/`:
- `round-{1,2}/architect.md`, `martin-fowler.md`, `synthesis.md`
- `SUMMARY.md` — the final report: overall verdict; prioritized findings table (severity, location, source-reviewer, status: addressed/declined/needs-user-decision); "what was changed and why" list; items deferred to user; final line confirming `openspec validate --strict` passes.

### Hard constraints
- Do NOT commit, `git add`, or archive the change. Leave everything untracked.
- Do NOT change the 5 locked decisions or the 3-concept architecture unilaterally.
- Preserve: decoupling constraint, no-symlinks rule, shared-vs-reserved split.
- Keep every doc edit surgical; keep `openspec validate --strict` green.
