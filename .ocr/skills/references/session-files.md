# Session File Manifest

> **This is the authoritative reference for session file naming.** All other documentation should reference this file for file names and structure.

## Session Directory Structure

Every OCR session creates files in `.ocr/sessions/{session-id}/`:

```
.ocr/sessions/{YYYY-MM-DD}-{branch}/
├── state.json              # Session state (REQUIRED)
├── discovered-standards.md # Merged project context
├── requirements.md         # User-provided requirements (if any)
├── context.md              # Change summary and Tech Lead guidance
├── reviews/                # Individual reviewer outputs
│   ├── principal-1.md
│   ├── principal-2.md
│   ├── quality-1.md
│   ├── quality-2.md
│   ├── security-1.md       # (if security reviewer assigned)
│   ├── testing-1.md        # (if testing reviewer assigned)
│   └── {reviewer}-{n}.md   # (additional assigned custom reviewers)
├── discourse.md            # Cross-reviewer discussion
└── final.md                # Synthesized final review
```

## File Specifications

### Required Files

| File | Phase Created | Description | Used By |
|------|---------------|-------------|---------|
| `state.json` | 1 | Session state for progress tracking | CLI, resume logic |
| `discovered-standards.md` | 1 | Merged project context from config + references | All reviewers |
| `context.md` | 2 | Change summary, diff analysis, Tech Lead guidance | All reviewers |
| `reviews/{type}-{n}.md` | 4 | Individual reviewer outputs | Discourse, Synthesis |
| `discourse.md` | 6 | Cross-reviewer discussion results | Synthesis |
| `final.md` | 7 | Synthesized final review | Show, Post commands |

### Optional Files

| File | When Created | Description |
|------|--------------|-------------|
| `requirements.md` | Phase 1 | User-provided requirements, specs, or acceptance criteria |

## Reviewer File Naming

**Pattern**: `{reviewer-type}-{instance}.md`

- `{reviewer-type}`: One of `principal`, `quality`, `security`, `testing`, or custom reviewer name
- `{instance}`: Sequential number starting at 1

**Examples**:
```
reviews/principal-1.md
reviews/principal-2.md
reviews/quality-1.md
reviews/quality-2.md
reviews/security-1.md
reviews/testing-1.md
reviews/performance-1.md   # Custom reviewer
```

**Rules**:
- Always lowercase
- Use hyphens, not underscores
- Instance numbers are sequential per reviewer type
- Custom reviewers follow the same `{name}-{n}.md` pattern

## Phase-to-File Mapping

| Phase | Phase Name | Files to Create/Update |
|-------|------------|------------------------|
| 1 | Context Discovery | `state.json`, `discovered-standards.md`, `requirements.md` (if provided) |
| 2 | Change Analysis | `context.md`, update `state.json` |
| 3 | Tech Lead Analysis | Update `context.md` with guidance, update `state.json` |
| 4 | Parallel Reviews | `reviews/{type}-{n}.md` for each reviewer, update `state.json` |
| 5 | Aggregation | (Inline analysis), update `state.json` |
| 6 | Discourse | `discourse.md`, update `state.json` |
| 7 | Synthesis | `final.md`, update `state.json` |
| 8 | Presentation | Set `state.json` status to `"closed"` |

## State Transitions and File Validation

When updating `state.json`, verify the corresponding file exists:

| completed_phases includes | Verify file exists |
|---------------------------|-------------------|
| `"context"` | `discovered-standards.md` |
| `"requirements"` | `context.md` |
| `"analysis"` | `context.md` (with Tech Lead guidance) |
| `"reviews"` | At least 2 files in `reviews/` |
| `"discourse"` | `discourse.md` |
| `"synthesis"` | `final.md` |

## Session ID Format

**Pattern**: `{YYYY-MM-DD}-{branch-name}`

- Date in ISO format (YYYY-MM-DD)
- Branch name with `/` replaced by `-`

**Examples**:
```
2026-01-27-main
2026-01-27-feat-add-auth
2026-01-27-fix-bug-123
```

**Generation**:
```bash
SESSION_ID="$(date +%Y-%m-%d)-$(git branch --show-current | tr '/' '-')"
```

## File Content Requirements

### state.json

```json
{
  "session_id": "{session-id}",
  "branch": "{branch-name}",
  "status": "active",
  "current_phase": "{phase-name}",
  "phase_number": 1,
  "completed_phases": [],
  "reviewers": {
    "assigned": ["principal-1", "principal-2", "quality-1", "quality-2"],
    "complete": []
  },
  "started_at": "{ISO-8601-timestamp}",
  "updated_at": "{ISO-8601-timestamp}"
}
```

See `references/session-state.md` for complete state management details.

### Reviewer Files

Each `reviews/{type}-{n}.md` must include:
- Summary section
- Findings with severity, location, and suggestions
- What's Working Well section
- Questions for Other Reviewers section

See `references/reviewer-task.md` for complete output format.

### final.md

Must include:
- Verdict (APPROVE / REQUEST CHANGES / NEEDS DISCUSSION)
- Blockers section (if any)
- Suggestions section
- Requirements Assessment (if requirements provided)
- Clarifying Questions section
- Individual Reviews table with file references

See `references/synthesis.md` for complete template.

## CLI Dependencies

The `ocr progress` CLI depends on these exact file names:

| CLI Feature | Files Read |
|-------------|-----------|
| Session detection | `state.json` |
| Phase tracking | `state.json` → `completed_phases` |
| Reviewer progress | `reviews/*.md` file existence |
| Elapsed time | `state.json` → `started_at` |

**IMPORTANT**: Non-standard file names will break progress tracking.
