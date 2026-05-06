# Add Agent Sessions and Team-Level Model Selection

## Why

Three operational and product needs converge on one architectural seam — how OCR records and reasons about *what an AI is doing right now* on behalf of a review:

1. **Per-persona model selection (Issue [#27](https://github.com/spencermarx/open-code-review/issues/27))** — every reviewer in a review currently inherits the host AI CLI's single parent model. A "team of reviewers" product should let heavyweight personas (`principal`, `architect`) run on stronger models and lightweight ones run cheaper, without OCR coining its own model vocabulary or shipping a maintenance treadmill of model names.
2. **Resumable reviews** — when a review terminates (by intent or crash), there is no first-class way to pick it back up. Vendor session IDs are emitted by Claude Code and OpenCode and partially captured by adapters, but discarded for workflow runs. The dashboard cannot offer "continue this review" — neither in-app nor as a copyable terminal command.
3. **Stale session state** — exploration of a real downstream project (`wrkbelt`) found a 28-day-old zero-byte SQLite WAL file from a dangling transaction, a 41+ hour live dashboard process, and 60 historical sessions with no terminal markers distinguishing "completed" from "abandoned." Sessions are marked `active` indefinitely until someone explicitly calls `ocr state close`. There is no heartbeat, no orphan sweep, no WAL hygiene.

The unifying answer is a first-class **agent session journal** — a record, kept by OCR, of every agent-CLI process the AI claimed to start on behalf of a review: which vendor, which persona, which model, what vendor session ID, when it last reported being alive. Once that journal exists, per-instance model selection, resumability, and stale-state cleanup are all small features built on top.

## What Changes

### Architectural principle (load-bearing for everything below)

OCR provides specs, data, and an audit journal. **The AI CLI orchestrates itself.** OCR does not become a process manager — Phase 4 of the review workflow is not moved into a command-runner orchestrator. Instead, the AI calls a small set of OCR commands to declare what it is doing, and OCR journals it. Per-instance model selection is honored by the host CLI (e.g. via Claude Code's per-subagent model frontmatter); when a host doesn't support per-task model overrides, OCR surfaces the limitation rather than papering over it.

### Capabilities affected (spec deltas in this proposal)

- **`sqlite-state`** — adds the `agent_sessions` table, a startup liveness sweep, and best-effort WAL hygiene against external native clients (OCR's primary engine is sql.js, which does not produce its own WAL; the existing merge-before-write pattern remains the cross-process serialization mechanism).
- **`session-management`** — adds heartbeat-based agent-session liveness, sweep triggers, and orphan reclassification.
- **`reviewer-management`** — extends `default_team` from `Record<persona, count>` to a three-form schema (number / object / array of instances), preserving full backwards compatibility, and introduces per-instance addressability and model assignment.
- **`review-orchestration`** — modifies Phase 4 so the Tech Lead reads the resolved team via `ocr team resolve`, honors per-instance models when its host supports per-task override, journals each instance via `ocr session` subcommands, and surfaces a structured warning when its host cannot honor per-instance models.
- **`cli`** — adds `ocr team resolve|set`, `ocr models list`, and the `ocr session start-instance|bind-vendor-id|beat|end-instance|list` subcommand family.
- **`config`** — formalizes the three-form `default_team` schema, an optional `models.aliases` user-defined alias map (OCR ships zero entries), an optional `models.default`, and `runtime.agent_heartbeat_seconds`.
- **`dashboard`** — adds a Team Composition Panel for the New Review flow, a session-detail liveness header, an in-dashboard "Continue here" affordance, a "Pick up in terminal" handoff panel (OCR-mediated and vendor-native modes), and a reviewers-page "in default team" badge.

### Backwards compatibility

- **BREAKING: none.** Existing `default_team: { principal: 2 }` configs continue to work unchanged; the regex parser is replaced by a normalized parser that produces the same effective behavior for shorthand entries. Reviewer markdown files retain their pure-prose, no-frontmatter shape — model selection lives in `default_team`, not in persona definitions.
- The new `agent_sessions` table is additive. The existing `sessions` table is unchanged.
- Existing CLI commands are unchanged. New subcommands and flags are additive.
- The `--resume` and `--model` flags on the AI-CLI adapters already exist; this change wires them through workflow runs.

### Out of scope (deliberately deferred)

- A Phase 4 process orchestrator owned by OCR (the architectural shift Issue #27 proposed) — explicitly **not** taken.
- OCR-coined model aliases like `fast`/`balanced`/`strong` — not shipped; aliases are a user-only convenience.
- Vendor model-string translation between Claude-style and OpenCode-style identifiers — configs are vendor-scoped; mismatches are surfaced to the user.
- Per-instance system prompt addendums, per-instance tool allowlists, per-instance timeouts — the three-form schema is forward-compatible with these but they are not added now.
- Tier-based model defaults (e.g. "all `holistic` reviewers on a strong model") — tier remains cosmetic.
- Synthesis-time awareness of which reviewer ran on which model — not threaded into the synthesis prompt now.
- Migrating sql.js to better-sqlite3 — separate decision.

## Impact

### Affected code (new files)

- `packages/cli/src/lib/team-config.ts` — three-form parser, normalization seam, override resolver.
- `packages/cli/src/lib/agent-sessions.ts` — DB access, sweep logic, heartbeat helpers.
- `packages/cli/src/commands/team.ts` — `ocr team resolve` / `ocr team set`.
- `packages/cli/src/commands/models.ts` — `ocr models list`.
- `packages/cli/src/commands/session.ts` — `ocr session` subcommand family.
- `packages/dashboard/src/server/routes/team.ts`, `routes/agent-sessions.ts`, `routes/handoff.ts`.
- `packages/dashboard/src/client/features/commands/components/team-composition-panel.tsx`.
- `packages/dashboard/src/client/features/sessions/components/{liveness-header,resume-card,terminal-handoff-panel}.tsx`.

### Affected code (existing files modified)

- `packages/cli/src/lib/state/migrations.ts` — add `agent_sessions` migration.
- `packages/cli/src/lib/state/types.ts` — add `AgentSession`, `ReviewerInstance` types.
- `packages/cli/src/lib/installer.ts` — replace `default_team` regex with the new parser for `is_default` derivation.
- `packages/dashboard/src/server/services/ai-cli/{types,claude-adapter,opencode-adapter}.ts` — add `listModels`, pass `--model` through.
- `packages/dashboard/src/server/socket/command-runner.ts` — capture `session_id` events for workflow runs (currently dropped).
- `packages/dashboard/src/server/index.ts` — wire WAL checkpoint and orphan sweep on startup.
- `packages/agents/skills/ocr/references/workflow.md`, `packages/agents/skills/ocr/SKILL.md` — Phase 4 instruction update for `ocr team resolve` and `ocr session`.
- `packages/agents/skills/ocr/assets/config.yaml` — example showing three-form schema (commented).

### Cross-package impact

This change touches `packages/cli`, `packages/dashboard`, and `packages/agents`. It is the largest cross-package change since the SQLite migration. Sequencing (see `tasks.md`) ensures each phase is independently shippable.

### User-visible consequences

- A user can configure two `principal` reviewers on different models in `.ocr/config.yaml` and run a review where the configured models are honored (provided their host CLI supports per-task model override).
- A user can resume a stalled or completed review either inside the dashboard ("Continue here") or by copying a terminal command pair (`cd <dir>` + `ocr review --resume <id>`).
- The dashboard distinguishes Running / Stalled / Orphaned sessions instead of marking everything `active` until manually closed.
- A user can compose a per-run team — count and per-instance models — from the dashboard without editing YAML.
- Stale SQLite WALs are checkpointed on dashboard startup; the Wrkbelt-class symptom is structurally prevented.
