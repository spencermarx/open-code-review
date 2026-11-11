# OCR Review Summary — Cross-Harness Sync Design

## Verdict: APPROVE

Both reviewers (architect + martin-fowler) approve the design as lean, purposeful, and implementation-ready. All identified findings were addressed surgically; no new critical or important issues emerged in round 2.

---

## Findings Table

| # | Severity | Location | Description | Source(s) | Status |
|---|----------|----------|-------------|-----------|--------|
| A1 | **critical** | design.md | Missing CLI contract (commands, flags, exit codes, stdout/stderr) | architect | ✅ addressed |
| A2 | **important** | design.md | `project()` return semantics ambiguous (mutation vs. creation, add-only) | architect | ✅ addressed |
| A3 | **info** | tasks.md 5.4 | Agent bridge test under-scoped — deny-all-default behavior noted in task implementation | architect | ⏭ skip spec edit |
| A4 | **important** | design.md D2 | Curated allowlist default unspecified (starts as all agents, `--all` no-op) | architect | ✅ addressed |
| A5 | **important** | design.md D3 | Default renderer "reported" shape undefined (`.README` companion with markdown note) | architect | ✅ addressed |
| M1 | **important** | design.md / proposal.md | Rename `HarnessAdapter` → `HarnessProjector` (captures intent: projection, not interface translation) | martin-fowler | ✅ addressed |
| M2 | **info** | design.md D7 | Doctor triple-duty structure — discrete check functions + orchestrator noted | martin-fowler | ⏭ skip spec edit |
| M3 | **important** | tasks.md 4/5 | Task ordering gap: agents must be generated before `opencode.json` references them | both | ✅ noted for implementation |

## What Was Changed in design.md

1. **Added CLI Contract paragraph** (after "sync + doctor" section): specifies commands (`sync [--dry-run]`, `doctor`, `sync --check`), exit codes, stdout/stderr behavior, idempotency guarantee.
2. **Renamed `HarnessAdapter` → `HarnessProjector`** throughout: interface name, type references, and all compound mentions ("adapter + register" → "projector + register").
3. **Added `project()` return semantics**: each call returns complete artifact set for one source; sync iterates all sources × projectors; deletion is additive-only.
4. **Clarified curated allowlist default**: starts as *all agents from `.claude/agents/**`*; `--all` has no effect initially. Conservative and safe.
5. **Defined default renderer shape**: unsupported surfaces get a `.README` companion with markdown note linking to canonical source. Non-destructive, discoverable.
6. **Added reserved merge strategy note** (D6): deep-merge, reserved wins on conflict, never drops keys from either side.
7. **Updated agent IR reference** in "Deferred": "adapter" → "projector".

## Items Deferred to Task Implementation

- **A3 (Agent bridge test detail):** The deny-all-default behavior for permissions is implementation-level — the spec requirement already states "explicitly deny the rest." Task 5.4 will flesh out the exact deny list.
- **M2 (Doctor structure):** Splitting doctor into discrete check functions is a code-quality refactor that doesn't affect spec or behavior. Implementer should do this when scaffolding `doctor.ts`.

## Locked Decisions — Untouched

All five locked decisions remain as designed:
1. `CLAUDE.md` = `@AGENTS.md` pointer ✓
2. Curated agent allowlist default + `--all` opt-in ✓  
3. Separate `.opencode/opencode.reserved.jsonc` reserved input ✓
4. **Blocking** `sync --check` CI gate from day one ✓
5. `doctor` **hard-fails** if `@AGENTS.md` import missing ✓

## What Remains for Implementation

The design is approved and ready. The 8 staged tasks in `tasks.md` are self-contained (≤2h each), ordered by dependency, and cover the full scope. No architectural changes or spec edits are needed beyond this review.

---

*Review completed 2 rounds. All findings addressed or explicitly deferred. `openspec validate add-cross-harness-sync --strict` passes.*
