# Session State Management

## Overview

OCR uses **SQLite** as the primary state store for reliable progress tracking. The database is located at `.ocr/data/ocr.db` and is managed through the `ocr state` CLI commands. Agents use these CLI commands at each phase transition instead of writing state files directly.

## Cross-Mode Compatibility

Sessions are **always** stored in the project's `.ocr/data/ocr.db` database and mirrored to `.ocr/sessions/`, regardless of installation mode:

| Mode | Skills Location | State Store | Sessions Mirror |
|------|-----------------|-------------|-----------------|
| **CLI** | `.ocr/skills/` | `.ocr/data/ocr.db` | `.ocr/sessions/` |
| **Plugin** | Plugin cache | `.ocr/data/ocr.db` | `.ocr/sessions/` |

This means:
- The `ocr progress` CLI works identically in both modes
- Running `npx @open-code-review/cli progress` from any project picks up the session state
- No configuration needed — the CLI always reads from `.ocr/data/ocr.db`

## State Data Model

The following fields are tracked per session in SQLite:

```json
{
  "session_id": "{session-id}",
  "workflow_type": "review",
  "status": "active",
  "current_phase": "reviews",
  "phase_number": 4,
  "current_round": 1,
  "current_map_run": 1,
  "started_at": "{ISO-8601-TIMESTAMP}",
  "round_started_at": "{ISO-8601-TIMESTAMP}",
  "map_started_at": "{ISO-8601-TIMESTAMP}",
  "updated_at": "{ISO-8601-TIMESTAMP}"
}
```

**Minimal by design**: Round and map run metadata is derived from the filesystem, not stored in the database.

**Field descriptions**:
- `workflow_type`: Current workflow type (`"review"` or `"map"`) — enables `ocr progress` to track correct workflow
- `started_at`: When the session was created (first `/ocr-review` or `/ocr-map`)
- `round_started_at`: When the current review round began (set when starting round ≥ 1)
- `map_started_at`: When the current map run began (set when starting a map run)
- `current_map_run`: Current map run number (only present during map workflow)
- `updated_at`: Last modification time (updated at every phase transition)

**Derived from filesystem** (not stored):
- Round count: enumerate `rounds/round-*/` directories
- Round completion: check for `final.md` in round directory
- Reviewers in round: list files in `rounds/round-{n}/reviews/`
- Discourse complete: check for `discourse.md` in round directory
- Map run count: enumerate `map/runs/run-*/` directories
- Map run completion: check for `map.md` in run directory

## Orchestration Events Table

In addition to the session state, SQLite tracks an **orchestration events timeline** in the `orchestration_events` table. Each `ocr state advance` call automatically logs an event, providing a complete history of phase transitions with timestamps. This enables:
- Post-session analytics (time spent per phase)
- Debugging stalled reviews
- Progress timeline reconstruction

Events are stored with the session ID, phase name, phase number, and timestamp.

## Session Status

The `status` field controls session visibility:

| Status | Meaning | Progress CLI | Agent Resume |
|--------|---------|--------------|---------------|
| `active` | In progress | Shows in auto-detect | Can resume |
| `closed` | Complete and dismissed | Skipped | Cannot resume |

**Lifecycle:**
1. Session created via `ocr state begin` → `status: "active"`
2. Review in progress → `status: "active"`, `current_phase` updates via `ocr state advance`
3. Phase 8 complete → `ocr state finish` sets `status: "closed"`, `current_phase: "complete"`

The `ocr progress` command only auto-detects sessions with `status: "active"`. Closed sessions are accessible via `/ocr-history` and `/ocr-show`.

## Agent-session journal: the `kind` field

Each journaled process (`ocr session list --json`, the dashboard's
`/api/agent-sessions`) carries a typed **`kind`** — branch on it instead of
parsing the `command` string to tell what a process is:

| `kind` | Meaning |
|--------|---------|
| `supervisor` | A workflow-owning process (a dashboard-spawned `review`/`map`). Its death cascade-closes its dependents. |
| `instance` | A reviewer instance journaled via `ocr session start-instance`. Never owns a workflow's lifecycle. |
| `utility` | A fire-and-forget command with no journaled heartbeat. |

## CLI Commands for State Management

Agents MUST use these CLI commands to manage session state. **Do NOT write state files directly.**

> **Note**: These commands require the OCR CLI. Install globally with `npm install -g @open-code-review/cli` or prefix with `npx @open-code-review/cli`.

## Atomic state API (preferred)

As of v2.0 the CLI exposes a small set of **atomic, invariant-checked** verbs.
Prefer these — they make correct state updates the default and make incorrect
ones impossible:

| Verb | Use it to | Guarantee |
|------|-----------|-----------|
| `ocr state begin` | start or resume a workflow | returns `{session_id, round, phase, completeness}` |
| `ocr state advance --phase <name>` | mark you've reached a phase | graph-validated; rejects illegal jumps; phase number derived |
| `ocr state complete-round --stdin` | finalize a review round | **one transaction**: writes meta + `round_completed` + advances + transitions to `complete`. Refuses unless you've reached `synthesis`. Idempotent. |
| `ocr state complete-map --stdin` | finalize a map run | map analogue |
| `ocr state finish [--abort]` | close the workflow | **refuses** unless the current round/run is complete; `--abort` records an abandoned session |
| `ocr state status --json` | ask "is it done? what's missing?" | machine-readable completeness + `next_action` |

**The CLI now enforces the lifecycle.** `ocr state finish` will *refuse*
(exit code 6) to close a workflow whose current round/run has no
`round_completed`/`map_completed`. This is by design — it makes the
"completed too soon" failure impossible. If you genuinely need to abandon a
workflow, use `ocr state finish --abort`.

**Exit codes** (branch on these instead of parsing messages): `0` ok ·
`2` usage · `3` ambiguous session · `4` not found · `5` illegal transition ·
`6` invariant unmet · `7` schema invalid · `8` busy (the DB was locked past
the bounded retry budget; wait ~250 ms and retry the same call).

On resume, run `ocr state status --json` first — it tells you exactly what's
missing and the next action, instead of inspecting the filesystem by hand.

v2.0.0 **retired** the `init` / `transition` / `round-complete` /
`map-complete` / `close` subcommands; use the atomic verbs documented below.
Calling a retired verb exits `2` with a pointer to its replacement.

### `ocr state begin` — Create or resume a session

```bash
ocr state begin \
  --session-id "{session-id}" \
  --branch "{branch}" \
  --workflow-type review \
  --session-dir ".ocr/sessions/{session-id}"
```

Creates (or resumes) the session record in SQLite and reports its round,
phase, and completeness. Superset of the legacy `init` (also wires up
dashboard linkage).

### `ocr state advance` — Update phase at each boundary

The phase number is **derived** from the phase, so you only pass `--phase`:

```bash
ocr state advance --phase "{phase-name}"
```

For review workflows with multiple rounds:
```bash
ocr state advance \
  --phase "{phase-name}" \
  --current-round {round-number}
```

For map workflows:
```bash
ocr state advance \
  --phase "{phase-name}" \
  --current-map-run {run-number}
```

Graph-validated (rejects illegal jumps); updates the session in SQLite and
logs an orchestration event.

### `ocr state finish` — Close the session (invariant-checked)

```bash
ocr state finish
```

Closes the workflow, but **refuses** (exit code 6) unless the current
round/run has a completed artifact. To abandon a workflow without finishing
it, pass `--abort` (records a distinct, non-success terminal):

```bash
ocr state finish --abort
```

> `ocr state close` was retired in v2.0.0 — `finish` replaces it.

### `ocr state show` — Read current session state

```bash
ocr state show
```

Outputs the current session state from SQLite. Use this to inspect current session state.

### `ocr state complete-round` — Sync structured round metrics

**Recommended: pipe structured data from stdin** (CLI writes the file + event):

```bash
cat <<'JSON' | ocr state complete-round --stdin
{ "schema_version": 1, "verdict": "APPROVE", "reviewers": [...] }
JSON
```

The `--stdin` flag makes the CLI the **sole writer** of `round-meta.json`. The CLI:
1. Validates the JSON schema
2. Writes `round-meta.json` to the correct session round directory
3. Derives counts from the findings array (never trusts self-reported counts)
4. Records a `round_completed` orchestration event in SQLite

The dashboard picks this up via `DbSyncWatcher` for real-time updates.

**Alternative: read from existing file** (for manual use or debugging):

```bash
ocr state complete-round --file "rounds/round-1/round-meta.json"
```

Optional flags (both modes):
```bash
--session-id "{session-id}"   # Auto-detects active session if omitted
--round 1                     # Auto-detects current round if omitted
```

### `ocr state complete-map` — Sync structured map metrics

**Recommended: pipe structured data from stdin** (CLI writes the file + event):

```bash
cat <<'JSON' | ocr state complete-map --stdin
{
  "schema_version": 1,
  "sections": [
    {
      "section_number": 1,
      "title": "Core Logic",
      "description": "Main business logic",
      "files": [
        { "file_path": "src/index.ts", "role": "Entry point", "lines_added": 10, "lines_deleted": 2 }
      ]
    }
  ],
  "dependencies": []
}
JSON
```

The `--stdin` flag makes the CLI the **sole writer** of `map-meta.json`. The CLI:
1. Validates the JSON schema
2. Writes `map-meta.json` to the correct session map run directory
3. Derives counts from the sections array (never trusts self-reported counts)
4. Records a `map_completed` orchestration event in SQLite

The dashboard picks this up via `DbSyncWatcher` for real-time updates.

**Alternative: read from existing file** (for manual use or debugging):

```bash
ocr state complete-map --file "map/runs/run-1/map-meta.json"
```

Optional flags (both modes):
```bash
--session-id "{session-id}"   # Auto-detects active session if omitted
--map-run 1                   # Auto-detects current map run if omitted
```

### `ocr state sync` — Rebuild from filesystem

```bash
ocr state sync
```

Scans filesystem session directories and backfills any missing sessions into SQLite.

## Phase Transitions

> **See `references/session-files.md` for the authoritative file manifest.**

The Tech Lead MUST call `ocr state advance` at each phase boundary:

### Review Phases

| Phase | When to Transition | File Created |
|-------|-------------------|--------------|
| context | After writing project standards | `discovered-standards.md` |
| change-context | After writing change summary | `context.md`, `requirements.md` (if provided) |
| analysis | After adding Tech Lead guidance | Update `context.md` |
| reviews | After each reviewer completes | `rounds/round-{n}/reviews/{type}-{n}.md` |
| discourse | After cross-reviewer discussion | `rounds/round-{n}/discourse.md` |
| synthesis | After final review | `rounds/round-{n}/final.md` |
| complete | After presenting to user | Call `ocr state finish` |

### Map Phases

| Phase | When to Transition | File Created |
|-------|-------------------|--------------|
| map-context | After writing project standards | `discovered-standards.md` (shared) |
| topology | After topology analysis | `map/runs/run-{n}/topology.md` |
| flow-analysis | After flow analysis | `map/runs/run-{n}/flow-analysis.md` |
| requirements-mapping | After requirements mapping | `map/runs/run-{n}/requirements-mapping.md` |
| synthesis | After map generation | `map/runs/run-{n}/map.md` |
| complete | After presenting map | Keep `status: "active"` (session continues) |

## State Transition Examples

When creating a new session (Phase 1 start):

```bash
ocr state begin \
  --session-id "{session-id}" \
  --branch "{branch}" \
  --workflow-type review \
  --session-dir ".ocr/sessions/{session-id}"
```

When transitioning phases:

```bash
ocr state advance --phase "reviews" --current-round 1
```

When starting a map workflow:

```bash
ocr state begin \
  --session-id "{session-id}" \
  --branch "{branch}" \
  --workflow-type map \
  --session-dir ".ocr/sessions/{session-id}"

ocr state advance --phase "map-context" --current-map-run 1
```

When closing a session (Phase 8 complete):

```bash
ocr state finish
```

## Benefits

1. **Explicit state** — No inference required
2. **Atomic updates** — SQLite transactions ensure consistency
3. **Rich metadata** — Reviewer assignments, timestamps, orchestration events
4. **Debuggable** — `ocr state show` for human-readable output
5. **CLI-friendly** — All state operations via `ocr state` commands
6. **Timeline tracking** — Orchestration events table records full phase history

## Important

SQLite (`.ocr/data/ocr.db`) is the **sole** source for workflow progress. With the round-first architecture:

- **SQLite is truth for workflow state**: `current_phase`, `phase_number`, `status`, timestamps
- **Filesystem is truth for round data**: Round count, completion, and reviewers are derived from `rounds/` directory structure
- **Reconciliation**: If SQLite and filesystem disagree, the CLI reconciles by trusting the filesystem for round data
