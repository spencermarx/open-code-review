# Design: Agent Sessions and Team-Level Model Selection

## Context

OCR sits *above* an agentic CLI (Claude Code, OpenCode, Gemini CLI, …). The CLI does the actual model orchestration — including, on capable hosts, spawning per-task subagents with per-task model overrides. OCR contributes a code-review specification, a state machine, an artifact filesystem, and a dashboard.

Three pressures push us toward a single change:

1. **Issue #27** wants different reviewers to run on different models. The reporter's proposed implementation moves Phase 4 fan-out into a command-runner orchestrator we own. That solves the feature but expands OCR into a process manager — a role that overlaps with where every host CLI is heading (better self-orchestration). We declined that direction.
2. **Resume / handoff** is a recurring product gap. Adapters already capture vendor session IDs; `command-runner.ts` discards them for workflow runs. Surfacing them in our own ID space is the unlock for both in-dashboard "Continue" and terminal handoff.
3. **Stale state** in `wrkbelt`'s `.ocr/data/` (zombie WAL, ghost active sessions, no terminal markers) demonstrates that sessions today have no liveness signal beyond "did someone explicitly call `ocr state close`."

The unifying observation: all three want the same primitive — a journal of every agent-CLI process the AI is currently running on behalf of a review, owned by OCR, written by the AI, and queryable for resume/liveness/audit. We commit to that primitive once and the three features become small additions on top.

## Goals

- Surface the missing primitive as a first-class capability (`agent_sessions`).
- Express per-instance model selection in `default_team` without breaking existing single-number entries.
- Keep OCR out of process management: the AI orchestrates, OCR journals.
- Make resume work uniformly across vendors via OCR-owned IDs, with a vendor-native bypass for power users.
- Eliminate the structural class of stale state demonstrated in `wrkbelt`.

## Non-Goals

- A Phase 4 process orchestrator owned by OCR.
- A vendor-translation layer for model identifiers (Claude vs OpenCode).
- Coining model aliases (`fast`/`balanced`/`strong`) shipped by OCR.
- Surfacing vendor session IDs in the standard UI (only in the explicit vendor-native handoff mode).
- Synthesis-time awareness of per-reviewer models.

## Decisions

### Decision 1 — Introduce `agent_sessions` as a journal, not a registry

`agent_sessions` is written *because the AI told us*, not because we're observing processes. The AI calls a small CLI surface (`ocr session start-instance`, `bind-vendor-id`, `beat`, `end-instance`) at lifecycle moments. We never spawn, fork, or watch a process to populate this table.

Why: keeps OCR's lane narrow. The AI already knows what it's doing; we just record it. If we instead inspected stdout to derive lifecycle signals, we would (a) duplicate the AI's knowledge with our own inference, and (b) couple our correctness to fragile parsing of vendor output formats.

### Decision 2 — Heartbeat-based liveness; sweep at exactly two trigger points

A session is alive iff `last_heartbeat_at > now() - threshold`. Threshold defaults to 60 seconds (`runtime.agent_heartbeat_seconds`). Sweeps run on:

- `ocr dashboard` startup, and
- any new agent-session creation.

No background timer. No setInterval. The two triggers are sufficient to keep the journal eventually consistent, and pushing the sweep onto natural lifecycle moments avoids a class of "is the timer running?" bugs.

The 60s default is tight: Claude Code and OpenCode emit NDJSON events frequently during a review, so heartbeats can be bumped opportunistically. Tight thresholds catch crashes faster; loose ones reduce false orphans. A user who has long-running reviewers (e.g. a security agent doing static analysis) can extend the threshold via config.

### Decision 3 — `default_team` becomes three forms, normalized to one shape

Three YAML forms, picked unambiguously by YAML type:

```yaml
default_team:
  security: 1                                              # Form 1: shorthand
  quality: { count: 2, model: claude-haiku-4-5-20251001 }  # Form 2: object
  principal:                                               # Form 3: list of instances
    - { model: claude-opus-4-7 }
    - { model: claude-sonnet-4-6, name: "principal-balanced" }
```

All three reduce to a canonical `ReviewerInstance[]` at parse time. Every downstream consumer (the dashboard, the AI via `ocr team resolve`, the CLI command-runner) speaks only the canonical shape.

Why three forms (not one or two): Form 1 is the existing surface and removing it would be a breaking change. Form 2 is the natural answer to "I want N of these on the same model." Form 3 is the only way to express "two principals on different models" without coining a new persona, which would be the wrong abstraction (the persona is who the reviewer is; the model is how this *deployment* runs). The fringe case is ~2% of users, but the cost of supporting it is one extra array branch in the parser.

The boundary rule that keeps this from sprawling: **mixing within one persona key is rejected.** You cannot write `principal: { count: 2, instances: [...] }`. Pick one form; the form determines the count.

### Decision 4 — Models are vendor-native strings; aliases are user sugar

OCR ships zero entries in `models.aliases`. Configs reference whatever string the underlying CLI accepts (`claude-opus-4-7`, `anthropic/claude-sonnet-4-6-20250514`, …). When a vendor ships a new model, OCR ships nothing — the user can use it the moment their CLI supports it.

Adapters expose `listModels(): Promise<ModelDescriptor[]>`. Per-adapter fallback chain:

1. Native enumeration (`claude --list-models --json`, `opencode models --json`, …).
2. Bundled known-good list inside the adapter file (best-effort, may go stale, marked as such).
3. Free-text input — never gatekeep against the underlying CLI.

User-defined aliases (`models.aliases.workhorse: claude-sonnet-4-6`) are pure syntactic sugar that expands once at parse time. They exist for users who prefer brevity; OCR has no opinion about which models matter.

#### Alternatives considered

- **Logical aliases shipped by OCR** (`fast`/`balanced`/`strong`). Rejected: requires us to maintain a vendor-by-model mapping that goes stale every release. Externalizes a maintenance treadmill onto our team for ~zero user benefit over user-owned aliases.
- **Vendor-translation layer** that maps between Claude-style and OpenCode-style identifiers. Rejected: introduces "magic" middleware that ages badly, and silently masks the real fact that configs are vendor-scoped. The honest answer is to surface the mismatch when it matters (dashboard team panel highlights it) and let the user pick a replacement.

### Decision 5 — Phase 4 stays AI-orchestrated; OCR provides data and journal hooks

Phase 4 instructions in `workflow.md` and `SKILL.md` change to:

1. Call `ocr team resolve --json` to get the resolved `ReviewerInstance[]`.
2. For each instance, spawn a reviewer sub-agent using the host CLI's per-task primitive (Claude Code subagents, OpenCode `--agent`, etc.). Pass the instance's `model` if the host supports per-task model override.
3. **If the host CLI does not support per-task model override**, run all instances on the parent model and emit a structured warning (visible to the user via final output and `agent_sessions.notes`). Do not silently ignore configured models.
4. Call `ocr session start-instance` to journal each spawn, `ocr session bind-vendor-id` once the sub-agent emits a session id, `ocr session beat` between phases, `ocr session end-instance` on completion.

This is documentation, not code we own. We add no Phase 4 process management. Future hosts that ship per-task model primitives automatically light up the feature without OCR changing.

#### Alternatives considered

- **Move Phase 4 fan-out into `command-runner.ts`** (the proposal in Issue #27). Rejected: makes OCR a competing orchestrator to the AI CLI, fights the direction every host CLI is heading, and creates a divergent codepath for "Phase 4 reviewers" vs. all other AI invocations.
- **Best-effort stdout inference of subagent spawns** (so OCR can journal even without AI cooperation). Rejected: brittle, vendor-specific, and creates two sources of truth (what the AI says vs. what we infer). The journal must be authoritative; that means it's written by the AI explicitly.

### Decision 6 — IDs visible to users are OCR-owned; vendor IDs are bypass-only

The `agent_sessions.id` (a UUID) is the only identifier surfaced in the standard UX. The `ocr review --resume <id>` command takes the parent **workflow** session id (`sessions.id`), since users think in terms of "the review I was doing" rather than "agent process #3"; OCR resolves the latest agent_session under the hood.

The vendor session id appears in *exactly one* user-facing place: the "Pick up in terminal" panel's vendor-native bypass mode, where the user has explicitly opted into invoking the host CLI's own resume primitive (`claude --resume <vendor-id>`, `opencode run --session <vendor-id> --continue`). The bypass is clearly marked: "This bypasses OCR — your review state will not advance, but the conversation continues."

Why two modes in the handoff panel: there is a real workflow where a user wants to resume the *AI conversation* without continuing the *OCR review*. Forcing them through `ocr review --resume` would re-enter our review state machine; sometimes the user just wants the agent's chat back. The bypass exists for them.

### Decision 7 — Dashboard team panel is opt-in for "save as default"

The team panel composes a team for a single review. A checkbox at the bottom — "Save as default for this workspace" — when checked, persists the composition back to `.ocr/config.yaml > default_team` via a new `ocr team set --stdin` command. When unchecked, the override is session-only and passed to `ocr review` as `--team`.

Default is unchecked. This protects users from one-off overrides clobbering carefully tuned disk configs, and matches the precedent of how `count` overrides work today (per-run, not per-edit).

### Decision 8 — sql.js stays; WAL hygiene is best-effort against external native clients

OCR uses **sql.js (WASM, in-memory)** as its SQLite engine. This is a load-bearing fact for the rest of this decision and was under-acknowledged in earlier drafts of this design.

What this means concretely:

- **`PRAGMA journal_mode = WAL` is a no-op for sql.js itself.** sql.js loads the entire database into memory and re-serializes it to disk via `db.export()` + atomic file rename (`saveDatabase` in `packages/cli/src/lib/db/index.ts`). There is no on-disk WAL produced by OCR's own writes.
- **The Wrkbelt-class stale `.db-wal` was created by an external native client** — most likely the `sqlite3` CLI, a database GUI, or an older OCR build using a native driver. It is a real symptom, but it lives outside sql.js's view of the world.
- **`BEGIN IMMEDIATE` against sql.js is theater.** sql.js is single-threaded per process; transactions don't cross process boundaries. The actual concurrency story between the CLI and dashboard processes is **merge-before-write** (load disk → modify in memory → atomic rename), implemented today via `DbSyncWatcher` and the save hooks in `packages/dashboard/src/server/db.ts`.

So this change does **two** things, honestly scoped to sql.js's reality:

1. **WAL hygiene as a best-effort, external-client cleanup.** On dashboard startup, before sql.js opens the DB file, OCR probes for the native `sqlite3` binary on PATH; if present, it shells out to `sqlite3 <db-path> "PRAGMA wal_checkpoint(TRUNCATE);"`. If the binary is absent, the step is skipped. The spec scenario remains "the system SHALL execute `PRAGMA wal_checkpoint(TRUNCATE)`" because that is the contract; the implementation is the only honest path to delivering it from a sql.js host.
2. **Concurrency stays on the existing merge-before-write rails.** `BEGIN IMMEDIATE` + retry-on-busy is **not** added in this change. It would be no-op code that gestures at correctness without delivering it. The spec was tightened accordingly: instead of mandating BEGIN IMMEDIATE, it mandates that concurrent writers SHALL serialize via the established merge-before-write pattern, and SHALL adopt `BEGIN IMMEDIATE` if and when OCR migrates to a native SQLite driver.

We are *not* migrating sql.js to better-sqlite3 in this change. That migration would unlock real WAL semantics, real `BEGIN IMMEDIATE` semantics, and structurally simpler concurrency — but it carries its own scope (native binaries, Electron-style packaging concerns, schema-revalidation pass) and is tracked separately. Decision 8 of this proposal is deliberately compatible with that future migration: every requirement we adopt today reads correctly under either engine.

#### Alternatives considered

- **Add `BEGIN IMMEDIATE` and retry-on-busy now anyway.** Rejected: writes correct-looking code that does nothing under sql.js, lulling future contributors into thinking concurrency is handled when it isn't. If a contributor later reaches a real race, they'll find a wrapper that "should have" prevented it and lose hours debugging.
- **Migrate to better-sqlite3 in this change.** Rejected: meaningfully expands scope, introduces native build dependencies, and is orthogonal to the per-instance-model and resume features that motivate the change. Tracked separately.
- **Embed a native sqlite3 in the OCR distribution.** Rejected: heavier than calling out to whichever `sqlite3` the user already has. Best-effort shellout fits OCR's lane.

## Risks and Trade-offs

- **Risk**: Hosts that don't support per-task model override give users an inconsistent experience — configured models are honored on Claude Code but not on OpenCode (today). Mitigation: structured warnings in `agent_sessions.notes` and a dashboard-visible "limitation" banner; explicit documentation that this is host-dependent. Trade-off accepted: the alternative is OCR doing per-task spawning itself, which we declined for stronger architectural reasons.
- **Risk**: The 60s heartbeat threshold may be too tight for hosts that don't emit events frequently. Mitigation: configurable via `runtime.agent_heartbeat_seconds`. We will validate against actual event cadences in CI.
- **Risk**: Three-form schema is more surface area for the parser than one form. Mitigation: the parser is a single small file (`team-config.ts`) with property-based tests; mixing forms within a key is hard-rejected at parse time.
- **Risk**: Surfacing vendor session ids in vendor-native bypass mode might confuse users into using them in OCR-mediated commands. Mitigation: the OCR-mediated command takes the *workflow* id (visible in the dashboard URL), and the bypass mode is explicitly labeled.
- **Trade-off**: We commit to documenting Phase 4 host-CLI capability requirements (per-task model support) rather than abstracting them away. This shifts cognitive load to users on hosts without per-task models, but preserves OCR's lane.

## Migration

No data migration is required.

- Existing `.ocr/config.yaml` files with `default_team: { principal: 2 }`-style entries continue to work — the new parser produces identical resolved compositions for shorthand entries.
- The `agent_sessions` table is added via a new migration; schema_version increments. The migration runs idempotently the first time any consumer opens the DB after upgrade.
- The existing `sessions` table is unchanged; `resolveActiveSession()` continues to work. `agent_sessions` rows reference `sessions.id` via FK with `ON DELETE RESTRICT` to protect the audit trail.
- Reviewer markdown files are unchanged. No frontmatter is introduced.
- Existing CLI commands behave identically. New commands are additive.
- The dashboard's existing routes are unchanged; new routes are additive. Old clients without the new components continue to render existing pages.

## Open Questions

These are the decisions to confirm during implementation. Each has a recommended default that does not block the proposal.

1. **Heartbeat threshold default** — recommended 60s, configurable. Confirm against observed event cadence on slow models.
2. **Bundled model lists in adapters** — recommended yes, marked best-effort. Some teams may prefer "no bundled fallback, fail loudly if `listModels` returns nothing." Final call deferred to implementation review.
3. **PATH detection for the host CLI in the handoff panel** — recommended best-effort `which`-style probe with cached result. Some platforms (Windows) may need different probes; the panel should degrade gracefully when detection is impossible.
4. **`ocr team set` write strategy** — recommended: round-trip through a YAML AST that preserves user comments, falling back to a structured rewrite if AST round-trip is unavailable. Final call depends on the YAML library chosen during implementation.
