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

## State File Format

```json
{
  "session_id": "{session-id}",
  "branch": "{branch-name}",
  "status": "active",
  "started_at": "{ISO-8601-TIMESTAMP}",
  "current_phase": "reviews",
  "phase_number": 4,
  "completed_phases": ["context", "requirements", "analysis"],
  "reviewers": {
    "assigned": ["principal-1", "principal-2", "quality-1", "quality-2"],
    "complete": ["principal-1"]
  },
  "updated_at": "{ISO-8601-TIMESTAMP}"
}
```

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

| Phase | When to Update | File Created |
|-------|---------------|--------------|
| context | After writing project standards | `discovered-standards.md` |
| requirements | After writing change summary | `context.md`, `requirements.md` (if provided) |
| analysis | After adding Tech Lead guidance | Update `context.md` |
| reviews | After each reviewer completes | `reviews/{type}-{n}.md` |
| discourse | After cross-reviewer discussion | `discourse.md` |
| synthesis | After final review | `final.md` |
| complete | After presenting to user | Set `status: "closed"` |

## Writing State

**CRITICAL**: Always generate timestamps dynamically using the current UTC time in ISO 8601 format.

### Generating Timestamps

```bash
# macOS/Linux
date -u +"%Y-%m-%dT%H:%M:%SZ"
# Output: 2026-01-27T09:45:00Z

# Windows (PowerShell)
Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ" -AsUTC

# Node.js / JavaScript
new Date().toISOString()
```

When creating a new session (Phase 1 start):

```json
{
  "session_id": "{session-id}",
  "status": "active",
  "current_phase": "context",
  "phase_number": 1,
  "completed_phases": [],
  "started_at": "{CURRENT_ISO_TIMESTAMP}",
  "updated_at": "{CURRENT_ISO_TIMESTAMP}"
}
```

When transitioning phases (preserve `started_at`, update `updated_at`):

```json
{
  "session_id": "{session-id}",
  "status": "active",
  "current_phase": "reviews",
  "phase_number": 4,
  "completed_phases": ["context", "requirements", "analysis"],
  "reviewers": {
    "assigned": ["principal-1", "principal-2", "quality-1", "quality-2"],
    "complete": []
  },
  "started_at": "{PRESERVE_ORIGINAL}",
  "updated_at": "{CURRENT_ISO_TIMESTAMP}"
}
```

When closing a session (Phase 8 complete):

```json
{
  "session_id": "{session-id}",
  "status": "closed",
  "current_phase": "complete",
  "phase_number": 8,
  "completed_phases": ["context", "requirements", "analysis", "reviews", "aggregation", "discourse", "synthesis"],
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

The `state.json` file is **required** for progress tracking. The CLI does NOT fall back to file existence checks. If `state.json` is missing or invalid, the progress command will show "Waiting for session..."

This ensures a single, dependable source of truth for session state.
