# Session State Management

## Overview

OCR uses a **state file** approach for reliable progress tracking. The orchestrating agent writes to `.ocr/sessions/{id}/state.json` at each phase transition.

## Cross-Mode Compatibility

Sessions are **always** stored in the project's `.ocr/sessions/` directory, regardless of installation mode:

| Mode | Skills Location | Sessions Location |
|------|-----------------|-------------------|
| **CLI** | `.ocr/skills/` | `.ocr/sessions/` |
| **Plugin** | Plugin cache | `.ocr/sessions/` |

This means:
- The `ocr progress` CLI works identically in both modes
- Running `npx @open-code-review/cli progress` from any project picks up the session state
- No configuration needed — the CLI always looks in `.ocr/sessions/`

## State File Format (Minimal Schema)

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

**Minimal by design**: Round and map run metadata is derived from the filesystem, not stored in state.json.

**Field descriptions**:
- `workflow_type`: Current workflow type (`"review"` or `"map"`) — enables `ocr progress` to track correct workflow
- `started_at`: When the session was created (first `/ocr-review` or `/ocr-map`)
- `round_started_at`: When the current review round began (set when starting round ≥ 1)
- `map_started_at`: When the current map run began (set when starting a map run)
- `current_map_run`: Current map run number (only present during map workflow)
- `updated_at`: Last modification time (updated at every phase transition)

**CRITICAL for timing**: When starting a NEW workflow type in an existing session (e.g., starting `/ocr-map` after `/ocr-review`), you MUST set the workflow-specific start time (`map_started_at` or `round_started_at`) to the current timestamp. This ensures `ocr progress` shows accurate elapsed time for each workflow.

**Derived from filesystem** (not stored):
- Round count: enumerate `rounds/round-*/` directories
- Round completion: check for `final.md` in round directory
- Reviewers in round: list files in `rounds/round-{n}/reviews/`
- Discourse complete: check for `discourse.md` in round directory
- Map run count: enumerate `map/runs/run-*/` directories
- Map run completion: check for `map.md` in run directory

**IMPORTANT**: Timestamps MUST be generated dynamically using the current time in ISO 8601 format (e.g., `new Date().toISOString()` → `"2026-01-27T09:45:00.000Z"`). Do NOT copy example timestamps.

## Session Status

The `status` field controls session visibility:

| Status | Meaning | Progress CLI | Agent Resume |
|--------|---------|--------------|---------------|
| `active` | In progress | Shows in auto-detect | Can resume |
| `closed` | Complete and dismissed | Skipped | Cannot resume |

**Lifecycle:**
1. Session created → `status: "active"`
2. Review in progress → `status: "active"`, `current_phase` updates
3. Phase 8 complete → `status: "closed"`, `current_phase: "complete"`

The `ocr progress` command only auto-detects sessions with `status: "active"`. Closed sessions are accessible via `/ocr-history` and `/ocr-show`.

## Phase Transitions

> **See `references/session-files.md` for the authoritative file manifest.**

The Tech Lead MUST update `state.json` at each phase boundary:

### Review Phases

| Phase | When to Update | File Created |
|-------|---------------|--------------|
| context | After writing project standards | `discovered-standards.md` |
| change-context | After writing change summary | `context.md`, `requirements.md` (if provided) |
| analysis | After adding Tech Lead guidance | Update `context.md` |
| reviews | After each reviewer completes | `rounds/round-{n}/reviews/{type}-{n}.md` |
| discourse | After cross-reviewer discussion | `rounds/round-{n}/discourse.md` |
| synthesis | After final review | `rounds/round-{n}/final.md` |
| complete | After presenting to user | Set `status: "closed"` |

### Map Phases

| Phase | When to Update | File Created |
|-------|---------------|--------------|
| map-context | After writing project standards | `discovered-standards.md` (shared) |
| topology | After topology analysis | `map/runs/run-{n}/topology.md` |
| flow-analysis | After flow analysis | `map/runs/run-{n}/flow-analysis.md` |
| requirements-mapping | After requirements mapping | `map/runs/run-{n}/requirements-mapping.md` |
| synthesis | After map generation | `map/runs/run-{n}/map.md` |
| complete | After presenting map | Keep `status: "active"` (session continues) |

## Writing State

**CRITICAL**: Always generate timestamps using a **tool call** — never construct them manually.

### Generating Timestamps

> ⚠️ **NEVER** write timestamps manually (e.g., `"2026-01-29T22:00:00Z"`). Always use a tool call to get the current time. Manual timestamps risk timezone errors, typos, and incorrect elapsed time display.

**Required approach**: Use `run_command` tool to execute:

```bash
# macOS/Linux — USE THIS
date -u +"%Y-%m-%dT%H:%M:%SZ"
# Output: 2026-01-27T09:45:00Z
```

**Example tool call** (do this before writing state.json):
```
run_command: date -u +"%Y-%m-%dT%H:%M:%SZ"
```

Then use the **exact output** as the timestamp value in state.json.

**Why this matters**: The `ocr progress` command calculates elapsed time from these timestamps. If a timestamp is incorrect (wrong timezone, future time, etc.), the progress display will show wrong/counting-down times.

When creating a new session (Phase 1 start):

```json
{
  "session_id": "{session-id}",
  "status": "active",
  "current_phase": "context",
  "phase_number": 1,
  "current_round": 1,
  "started_at": "{CURRENT_ISO_TIMESTAMP}",
  "updated_at": "{CURRENT_ISO_TIMESTAMP}"
}
```

When transitioning phases (preserve `started_at`, update `updated_at`):

```json
{
  "session_id": "{session-id}",
  "workflow_type": "review",
  "status": "active",
  "current_phase": "reviews",
  "phase_number": 4,
  "current_round": 1,
  "started_at": "{PRESERVE_ORIGINAL}",
  "round_started_at": "{PRESERVE_ORIGINAL}",
  "updated_at": "{CURRENT_ISO_TIMESTAMP}"
}
```

When starting a map workflow (new map run or first map in session):

```json
{
  "session_id": "{session-id}",
  "workflow_type": "map",
  "status": "active",
  "current_phase": "map-context",
  "phase_number": 1,
  "current_map_run": 1,
  "started_at": "{PRESERVE_ORIGINAL_OR_SET_IF_NEW}",
  "map_started_at": "{CURRENT_ISO_TIMESTAMP}",
  "updated_at": "{CURRENT_ISO_TIMESTAMP}"
}
```

**CRITICAL**: Always set `map_started_at` to `{CURRENT_ISO_TIMESTAMP}` when starting a new map run. This ensures accurate elapsed time tracking even if the session had a prior review workflow.

When closing a session (Phase 8 complete):

```json
{
  "session_id": "{session-id}",
  "status": "closed",
  "current_phase": "complete",
  "phase_number": 8,
  "current_round": 1,
  "started_at": "{PRESERVE_ORIGINAL}",
  "updated_at": "{CURRENT_ISO_TIMESTAMP}"
}
```

## Benefits

1. **Explicit state** — No inference required
2. **Atomic updates** — Single file write
3. **Rich metadata** — Reviewer assignments, timestamps
4. **Debuggable** — Human-readable JSON
5. **CLI-friendly** — Easy to parse programmatically

## Important

The `state.json` file is the **primary** source for workflow progress. However, with the round-first architecture:

- **Filesystem is truth for round data**: Round count, completion, and reviewers are derived from `rounds/` directory structure
- **state.json is truth for workflow state**: `current_phase`, `phase_number`, `status`, timestamps
- **Reconciliation**: If state.json and filesystem disagree, the CLI reconciles by trusting the filesystem for round data

If `state.json` is missing entirely, the CLI will show "Waiting for session..." until the orchestrating agent creates `state.json`. Future versions may implement filesystem reconstruction to derive:
1. Round count from `rounds/round-*/` directories
2. Round completion from `final.md` presence
3. Approximate phase from file existence
