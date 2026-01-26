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
  "session_id": "2026-01-26-main",
  "branch": "main",
  "started_at": "2026-01-26T17:00:00Z",
  "current_phase": "reviews",
  "phase_number": 4,
  "completed_phases": ["context", "requirements", "analysis"],
  "reviewers": {
    "assigned": ["principal-1", "principal-2", "quality-1", "quality-2"],
    "complete": ["principal-1"]
  },
  "updated_at": "2026-01-26T17:05:00Z"
}
```

## Phase Transitions

The Tech Lead MUST update `state.json` at each phase boundary:

| Phase | When to Update |
|-------|---------------|
| context | After writing `discovered-standards.md` |
| requirements | After writing `requirements.md` (if any) |
| analysis | After writing `context.md` with guidance |
| reviews | After spawning each reviewer (update `reviewers.complete`) |
| discourse | After writing `discourse.md` |
| synthesis | After writing `final.md` |
| complete | After presenting to user |

## Writing State

When transitioning phases:

```bash
# Create or update state.json
cat > .ocr/sessions/{id}/state.json << 'EOF'
{
  "session_id": "{id}",
  "current_phase": "reviews",
  "phase_number": 4,
  "completed_phases": ["context", "requirements", "analysis"],
  "reviewers": {
    "assigned": ["principal-1", "principal-2", "quality-1", "quality-2"],
    "complete": []
  },
  "updated_at": "2026-01-26T17:05:00Z"
}
EOF
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
