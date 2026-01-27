# Design: Round-First Session Architecture

## Context

OCR stores review artifacts in `.ocr/sessions/{date}-{branch}/`. The current design places individual reviewer outputs in a flat `reviews/` directory, with `discourse.md` and `final.md` at the session root. A recent change added optional round-based nesting (`reviews/round-{n}/`) with fallback to flat structure for backwards compatibility.

**Problem**: This hybrid approach creates complexity:
- CLI must check for rounds, then fall back to flat structure
- `discourse.md` and `final.md` don't belong to any specific round
- Re-review on same day/branch has undefined behavior (overwrite vs counter)

**Stakeholders**: AI agents (reviewers, Tech Lead), CLI progress command, `/ocr-show`, `/ocr-post`

## Goals / Non-Goals

### Goals
- Simplify session structure with a single, consistent pattern
- Make multi-round reviews first-class
- Preserve history across review rounds
- Enable comparing feedback evolution across rounds

### Non-Goals
- Migrate existing sessions (users can re-run reviews)
- Support viewing previous round artifacts via commands (future enhancement)
- Cross-round diff analysis (future enhancement)

## Decisions

### Decision 1: Always use round directories

**What**: Every session uses `rounds/round-{n}/` structure. No flat fallback.

**Why**: Eliminates conditional logic in all consumers. Single code path is easier to maintain and test.

**Alternatives considered**:
- Keep flat with optional rounds — Rejected: Adds complexity, ambiguous semantics
- Auto-migrate on access — Rejected: Complexity, potential data loss

### Decision 2: Move discourse and final into round directories

**What**: Each round has its own `discourse.md` and `final.md` inside `rounds/round-{n}/`.

**Why**: These artifacts are outputs of a specific review round. Keeping them at session root is semantically incorrect when multiple rounds exist.

**Trade-off**: `/ocr-show` and `/ocr-post` must now know the current round. Mitigation: Read `current_round` from `state.json`.

### Decision 3: Keep shared context at session root

**What**: `discovered-standards.md`, `requirements.md`, and `context.md` remain at session root.

**Why**: These describe the *change being reviewed*, not feedback on it. They're inputs to all rounds, not outputs of any round.

### Decision 4: Use `rounds/` parent directory

**What**: Round directories live under `rounds/` (e.g., `rounds/round-1/`) not directly in session root.

**Why**: 
- Cleaner separation between shared context and round-specific artifacts
- Easier to enumerate rounds (`ls rounds/`)
- Avoids polluting session root with many `round-{n}` directories

### Decision 5: Minimal state.json with filesystem-derived round data

**What**: `state.json` includes only `current_round` as a hint. Round metadata (completion, reviewers) is derived from filesystem.

```json
{
  "current_round": 1
}
```

**Why**: 
- Filesystem is the source of truth for what exists
- Round completion determined by `final.md` presence
- Reviewers determined by listing `rounds/round-{n}/reviews/`
- Avoids dual-source divergence (Martin Fowler's Single Source of Truth)
- Simpler schema, less to keep in sync

## Final Directory Structure

```
.ocr/sessions/{YYYY-MM-DD}-{branch}/
├── state.json                      # Session state (REQUIRED)
├── discovered-standards.md         # Merged project context
├── requirements.md                 # User-provided requirements (if any)
├── context.md                      # Change summary + Tech Lead guidance
└── rounds/
    ├── round-1/
    │   ├── reviews/
    │   │   ├── principal-1.md
    │   │   ├── principal-2.md
    │   │   ├── quality-1.md
    │   │   └── quality-2.md
    │   ├── discourse.md
    │   └── final.md
    └── round-2/
        ├── reviews/
        │   └── ...
        ├── discourse.md
        └── final.md
```

## state.json Schema (Minimal)

```json
{
  "session_id": "{YYYY-MM-DD}-{branch}",
  "status": "active",
  "current_phase": "{phase-name}",
  "phase_number": 4,
  "current_round": 1,
  "started_at": "{ISO-8601-timestamp}",
  "updated_at": "{ISO-8601-timestamp}"
}
```

**Derived from filesystem** (not stored in state.json):
- Round count: `ls rounds/`
- Round completion: `existsSync(rounds/round-{n}/final.md)`
- Reviewers in round: `ls rounds/round-{n}/reviews/`
- Discourse complete: `existsSync(rounds/round-{n}/discourse.md)`

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Breaking change for existing sessions | Sessions are ephemeral, not version-tracked. Users discard old sessions. |
| Deeper nesting makes paths longer | Acceptable trade-off for clarity; use variables in docs |

## Migration Plan

**Direct cutover — no backward compatibility or migration.**

Sessions are ephemeral and not version-tracked. When users upgrade:
1. New sessions use the new `rounds/` architecture
2. Old sessions (if any) can be manually deleted
3. No fallback logic in CLI or agents
4. Single code path everywhere

## Agentic AI: Round Resolution Algorithm

**Critical for agent implementation.** This algorithm MUST be added to `workflow.md`:

```
Round Resolution (Phase 0):

1. Compute SESSION_DIR = ".ocr/sessions/{YYYY-MM-DD}-{branch}"
2. If SESSION_DIR doesn't exist → Create it, set current_round = 1
3. If SESSION_DIR/rounds/ doesn't exist → Create it, set current_round = 1
4. Enumerate rounds: N = count of round-* directories in SESSION_DIR/rounds/
   - If N == 0 → Create rounds/round-1/, set current_round = 1
   - If N > 0:
     - Check if rounds/round-{N}/final.md exists
     - If exists (round complete) → Create rounds/round-{N+1}/, set current_round = N+1
     - If not exists (round in progress) → Resume round-{N}, set current_round = N
5. Update state.json with current_round
6. All phase outputs go to rounds/round-{current_round}/
```

**Path Construction Pattern** (for agent instructions):

```bash
SESSION_DIR=".ocr/sessions/${YYYY-MM-DD}-${branch}"
ROUND_DIR="${SESSION_DIR}/rounds/round-${current_round}"
REVIEWS_DIR="${ROUND_DIR}/reviews"

# Phase 4 outputs
"${REVIEWS_DIR}/principal-1.md"
"${REVIEWS_DIR}/principal-2.md"

# Phase 6 output
"${ROUND_DIR}/discourse.md"

# Phase 7 output
"${ROUND_DIR}/final.md"
```

## CLI: Implementation Notes

The CLI (`progress.ts`) must:

1. **Remove fallback logic** — No checking flat `reviews/` directory
2. **Remove `rounds[]` array parsing** — Derive from filesystem
3. **Enumerate rounds directory** — `readdirSync(join(sessionPath, 'rounds'))`
4. **Check completion via filesystem** — `existsSync(join(roundDir, 'final.md'))`

```typescript
// Simplified round detection
function getCurrentRound(sessionPath: string): number {
  const roundsDir = join(sessionPath, 'rounds');
  if (!existsSync(roundsDir)) return 1;
  
  const rounds = readdirSync(roundsDir)
    .filter(d => d.match(/^round-\d+$/))
    .map(d => parseInt(d.replace('round-', '')))
    .sort((a, b) => b - a);
  
  return rounds[0] ?? 1;
}

function isRoundComplete(sessionPath: string, round: number): boolean {
  return existsSync(join(sessionPath, 'rounds', `round-${round}`, 'final.md'));
}
```

## State Management Philosophy

### The Dual-Source Problem

A `state.json` that duplicates filesystem structure creates divergence risk. Following Martin Fowler's **Single Source of Truth** principle, we treat:

- **Filesystem** → Source of truth for *what exists*
- **state.json** → Cache for *workflow progress* (cannot be derived from filesystem)

### What state.json Tracks (Non-Derivable)

| Field | Why Needed |
|-------|------------|
| `current_phase` | Workflow position within active round |
| `phase_number` | Numeric progress (1-8) |
| `started_at` | Session start timestamp |
| `updated_at` | Last activity timestamp |
| `current_round` | Hint for active round (reconcilable) |

### What We Derive from Filesystem

| Information | Derivation |
|-------------|------------|
| Round count | Count `rounds/round-*/` directories |
| Round completion | `final.md` exists in round directory |
| Reviewers in round | Files in `rounds/round-{n}/reviews/` |
| Discourse complete | `discourse.md` exists in round directory |

### Reconciliation Rules

On **read** (CLI, commands):

1. If `state.json` missing → Reconstruct from filesystem scan
2. If `state.json.current_round` references non-existent round → Use highest existing round
3. If round has `final.md` but state says incomplete → Trust filesystem (round is complete)
4. If state says "reviews" phase but `reviews/` empty → Session is in error state, report gracefully

On **write** (AI agent):

1. Create round directory structure before writing review files
2. Update `state.json` after each phase completes
3. Write `final.md` last — serves as completion marker

### Edge Case Handling

| Edge Case | Behavior |
|-----------|----------|
| User deletes `round-2/` directory | Detect on read, adjust `current_round` to highest existing |
| User creates empty `round-3/` manually | Treat as incomplete round, start reviews phase |
| `state.json` missing entirely | Reconstruct: scan rounds, infer completion from `final.md` presence |
| `state.json` corrupt (invalid JSON) | Log warning, reconstruct from filesystem |
| `final.md` exists but state says in-progress | Trust filesystem, mark round complete |
| Agent crashes mid-round | Next read detects partial state, can resume or restart |

### Why NOT Per-Round state.json?

**Considered**: `rounds/round-{n}/state.json` for each round.

**Rejected**:
1. **Cross-round decisions** need session-level view (which round to start next)
2. **Redundant** — round completion already signaled by `final.md` presence
3. **No unique information** — nothing round-specific that filesystem doesn't express
4. **Aggregation complexity** — CLI would need to merge multiple state files

The only non-derivable information is **current phase within an incomplete round**. That's inherently session-level.

### Minimal state.json Schema

```json
{
  "session_id": "{YYYY-MM-DD}-{branch}",
  "current_round": 1,
  "current_phase": "reviews",
  "phase_number": 4,
  "started_at": "{ISO-8601}",
  "updated_at": "{ISO-8601}"
}
```

Note: `rounds[]` array removed. Round metadata is derived from filesystem.

## Open Questions

None — design refined with state management philosophy.
