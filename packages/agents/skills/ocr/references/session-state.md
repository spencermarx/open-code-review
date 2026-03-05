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

In addition to the session state, SQLite tracks an **orchestration events timeline** in the `orchestration_events` table. Each `ocr state transition` call automatically logs an event, providing a complete history of phase transitions with timestamps. This enables:
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
1. Session created via `ocr state init` → `status: "active"`
2. Review in progress → `status: "active"`, `current_phase` updates via `ocr state transition`
3. Phase 8 complete → `ocr state close` sets `status: "closed"`, `current_phase: "complete"`

The `ocr progress` command only auto-detects sessions with `status: "active"`. Closed sessions are accessible via `/ocr-history` and `/ocr-show`.

## CLI Commands for State Management

Agents MUST use these CLI commands to manage session state. **Do NOT write state files directly.**

### `ocr state init` — Create a new session

```bash
ocr state init \
  --session-id "{session-id}" \
  --branch "{branch}" \
  --workflow-type review \
  --session-dir ".ocr/sessions/{session-id}"
```

Creates the session record in SQLite.

### `ocr state transition` — Update phase at each boundary

```bash
ocr state transition \
  --phase "{phase-name}" \
  --phase-number {N}
```

For review workflows with multiple rounds:
```bash
ocr state transition \
  --phase "{phase-name}" \
  --phase-number {N} \
  --current-round {round-number}
```

For map workflows:
```bash
ocr state transition \
  --phase "{phase-name}" \
  --phase-number {N} \
  --current-map-run {run-number}
```

Updates the session in SQLite and logs an orchestration event.

### `ocr state close` — Close the session

```bash
ocr state close
```

Sets `status: "closed"` and `current_phase: "complete"` in SQLite.

### `ocr state show` — Read current session state

```bash
ocr state show
```

Outputs the current session state from SQLite. Use this to inspect current session state.

### `ocr state sync` — Rebuild from filesystem

```bash
ocr state sync
```

Scans filesystem session directories and backfills any missing sessions into SQLite.

## Phase Transitions

> **See `references/session-files.md` for the authoritative file manifest.**

The Tech Lead MUST call `ocr state transition` at each phase boundary:

### Review Phases

| Phase | When to Transition | File Created |
|-------|-------------------|--------------|
| context | After writing project standards | `discovered-standards.md` |
| change-context | After writing change summary | `context.md`, `requirements.md` (if provided) |
| analysis | After adding Tech Lead guidance | Update `context.md` |
| reviews | After each reviewer completes | `rounds/round-{n}/reviews/{type}-{n}.md` |
| discourse | After cross-reviewer discussion | `rounds/round-{n}/discourse.md` |
| synthesis | After final review | `rounds/round-{n}/final.md` |
| complete | After presenting to user | Call `ocr state close` |

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
ocr state init \
  --session-id "{session-id}" \
  --branch "{branch}" \
  --workflow-type review \
  --session-dir ".ocr/sessions/{session-id}"
```

When transitioning phases:

```bash
ocr state transition --phase "reviews" --phase-number 4 --current-round 1
```

When starting a map workflow:

```bash
ocr state init \
  --session-id "{session-id}" \
  --branch "{branch}" \
  --workflow-type map \
  --session-dir ".ocr/sessions/{session-id}"

ocr state transition --phase "map-context" --phase-number 1 --current-map-run 1
```

When closing a session (Phase 8 complete):

```bash
ocr state close
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
