# Session File Manifest

> **This is the authoritative reference for session file naming.** All other documentation should reference this file for file names and structure.

## Session Directory Structure

Every OCR session creates files in `.ocr/sessions/{session-id}/`:

```
.ocr/sessions/{YYYY-MM-DD}-{branch}/
├── state.json              # Session state (REQUIRED)
├── discovered-standards.md # Merged project context (shared across rounds)
├── requirements.md         # User-provided requirements (if any, shared)
├── context.md              # Phase 2+3: Change summary + Tech Lead guidance (shared)
├── map/                    # Code Review Map artifacts (optional)
│   └── runs/
│       ├── run-1/          # First map generation
│       │   ├── topology.md         # File categorization and sections
│       │   ├── flow-analysis.md    # Dependency tracing results
│       │   ├── requirements-mapping.md  # Coverage matrix (if requirements)
│       │   └── map.md              # Final map output
│       └── run-2/          # Subsequent runs (created on re-map)
│           └── ...         # Same structure as run-1
└── rounds/                 # All round-specific artifacts
    ├── round-1/            # First review round
    │   ├── reviews/        # Individual reviewer outputs
    │   │   ├── principal-1.md
    │   │   ├── principal-2.md
    │   │   ├── quality-1.md
    │   │   ├── quality-2.md
    │   │   ├── security-1.md   # (if security reviewer assigned)
    │   │   ├── testing-1.md    # (if testing reviewer assigned)
    │   │   └── {type}-{n}.md   # (additional assigned custom reviewers)
    │   ├── discourse.md    # Cross-reviewer discussion for round 1
    │   └── final.md        # Synthesized final review for round 1
    └── round-2/            # Subsequent rounds (created on re-review)
        ├── reviews/
        │   └── ...         # Same structure as round-1
        ├── discourse.md
        └── final.md
```

## Review Rounds

OCR uses a **round-first architecture** where all round-specific artifacts live under `rounds/round-{n}/`. This makes multi-round reviews a first-class concept.

**Round behavior**:
- First `/ocr-review` creates `rounds/round-1/` with `reviews/`, `discourse.md`, `final.md`
- Subsequent `/ocr-review` on same day/branch creates `rounds/round-{n+1}/`
- Previous rounds are preserved (never overwritten)
- Each round has its own `discourse.md` and `final.md`
- `state.json` tracks `current_round`; round metadata derived from filesystem

**Shared vs per-round/run artifacts**:
| Shared (session root) | Per-round (`rounds/round-{n}/`) | Per-run (`map/runs/run-{n}/`) |
|----------------------|--------------------------------|-------------------------------|
| `state.json` | `reviews/*.md` | `topology.md` |
| `discovered-standards.md` | `discourse.md` | `flow-analysis.md` |
| `requirements.md` | `final.md` | `requirements-mapping.md` |
| `context.md` | | `map.md` |

**When to use multiple rounds**:
- Author addresses feedback and requests re-review
- Scope changes mid-review
- Different reviewer team composition needed

## Map Runs

OCR uses a **run-based architecture** for maps, parallel to review rounds.

**Run behavior**:
- First `/ocr-map` creates `map/runs/run-1/` with map artifacts
- Subsequent `/ocr-map` on same day/branch creates `map/runs/run-{n+1}/`
- Previous runs are preserved (never overwritten)
- Each run produces a complete `map.md`
- `state.json` tracks `current_map_run`; run metadata derived from filesystem

**Map artifacts per run**:
| File | Phase | Description |
|------|-------|-------------|
| `topology.md` | 2 | File categorization and section groupings |
| `flow-analysis.md` | 3 | Upstream/downstream dependency tracing |
| `requirements-mapping.md` | 4 | Requirements coverage matrix (if requirements provided) |
| `map.md` | 5 | Final synthesized Code Review Map |

**When to use multiple runs**:
- Changeset has evolved since last map
- Different requirements context needed
- Fresh analysis desired after code updates

## File Specifications

### Required Files

| File | Phase | Description | Used By |
|------|-------|-------------|---------|
| `state.json` | 1 | Session state for progress tracking | CLI, resume logic |
| `discovered-standards.md` | 1 | Merged project context from config + references | All reviewers |
| `context.md` | 2 | Change summary, diff analysis, Tech Lead guidance | All reviewers |
| `rounds/round-{n}/reviews/{type}-{n}.md` | 4 | Individual reviewer outputs | Discourse, Synthesis |
| `rounds/round-{n}/discourse.md` | 6 | Cross-reviewer discussion results | Synthesis |
| `rounds/round-{n}/final.md` | 7 | Synthesized final review | Show, Post commands |

### Optional Files

| File | When Created | Description |
|------|--------------|-------------|
| `requirements.md` | Phase 1 | User-provided requirements, specs, or acceptance criteria |

## Reviewer File Naming

**Pattern**: `{type}-{n}.md`

- `{type}`: One of `principal`, `quality`, `security`, `testing`, or custom reviewer name
- `{n}`: Sequential number starting at 1

**Examples** (for round 1):
```
rounds/round-1/reviews/principal-1.md
rounds/round-1/reviews/principal-2.md
rounds/round-1/reviews/quality-1.md
rounds/round-1/reviews/quality-2.md
rounds/round-1/reviews/security-1.md
rounds/round-1/reviews/testing-1.md
rounds/round-1/reviews/performance-1.md   # Custom reviewer
```

**Rules**:
- Always lowercase
- Use hyphens, not underscores
- Instance numbers are sequential per reviewer type
- Custom reviewers follow the same `{type}-{n}.md` pattern

## Phase-to-File Mapping

| Phase | Phase Name | Files to Create/Update |
|-------|------------|------------------------|
| 1 | Context Discovery | `state.json`, `discovered-standards.md`, `requirements.md` (if provided) |
| 2 | Change Analysis | `context.md`, update `state.json` |
| 3 | Tech Lead Analysis | Update `context.md` with guidance, update `state.json` |
| 4 | Parallel Reviews | `rounds/round-{n}/reviews/{type}-{n}.md` for each reviewer, update `state.json` |
| 5 | Aggregation | (Inline analysis), update `state.json` |
| 6 | Discourse | `rounds/round-{n}/discourse.md`, update `state.json` |
| 7 | Synthesis | `rounds/round-{n}/final.md`, update `state.json` |
| 8 | Presentation | Set `state.json` status to `"closed"` |

## State Transitions and File Validation

When updating `state.json`, verify the corresponding file exists:

| Phase | Verify file exists |
|---------------------------|-------------------|
| `"context"` | `discovered-standards.md` |
| `"change-context"` | `context.md` |
| `"analysis"` | `context.md` (with Tech Lead guidance) |
| `"reviews"` | At least 2 files in `rounds/round-{current_round}/reviews/` |
| `"discourse"` | `rounds/round-{current_round}/discourse.md` |
| `"synthesis"` | `rounds/round-{current_round}/final.md` |

## Session ID Format

**Pattern**: `{YYYY-MM-DD}-{branch-name}`

> **Shorthand**: In documentation, `{id}` and `{session-id}` are aliases for the full `{YYYY-MM-DD}-{branch-name}` format.

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

### state.json (Minimal Schema)

```json
{
  "session_id": "{session-id}",
  "status": "active",
  "current_phase": "{phase-name}",
  "phase_number": 4,
  "current_round": 1,
  "started_at": "{ISO-8601-timestamp}",
  "round_started_at": "{ISO-8601-timestamp}",
  "updated_at": "{ISO-8601-timestamp}"
}
```

> **Note**: `round_started_at` is set when starting a new round (> 1) for accurate per-round timing display.

**Derived from filesystem** (not stored in state.json):
- Round count: enumerate `rounds/round-*/` directories
- Round completion: check for `final.md` in round directory
- Reviewers in round: list files in `rounds/round-{n}/reviews/`
- Discourse complete: check for `discourse.md` in round directory

See `references/session-state.md` for complete state management details.

### Reviewer Files

Each `rounds/round-{n}/reviews/{type}-{n}.md` must include:
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

See `references/final-template.md` for complete template.

## CLI Dependencies

The `ocr progress` CLI depends on these exact file names:

| CLI Feature | Files Read |
|-------------|-----------|
| Session detection | `state.json` |
| Phase tracking | `state.json` → `current_phase` |
| Current round | `state.json` → `current_round` (reconciled with filesystem) |
| Reviewer progress | `rounds/round-{n}/reviews/*.md` file existence |
| Round completion | `rounds/round-{n}/final.md` existence |
| Elapsed time | `state.json` → `started_at` |

**Filesystem as truth**: The CLI derives round metadata from the filesystem, using `state.json` as a hint. If state.json is missing or inconsistent, the CLI reconstructs state by:
1. Enumerating `rounds/round-*/` to count rounds
2. Checking `final.md` presence to determine completion
3. Listing `reviews/*.md` to identify reviewers

**IMPORTANT**: Non-standard file names will break progress tracking.
