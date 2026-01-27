# Change: Refactor to Round-First Session Architecture

## Why

The current session architecture has a flat `reviews/` directory with an optional round-based structure added as a fallback. This creates:
1. **Unnecessary complexity** in the CLI progress tracking (must check for round directories, then fall back to flat)
2. **Inconsistent artifact placement** — `discourse.md` and `final.md` sit at session root but logically belong to a specific review round
3. **Ambiguous re-review behavior** — same-day reviews either overwrite or append counter, neither is ideal

A round-first architecture simplifies all consumers and makes multi-round reviews a first-class concept.

## What Changes

- **BREAKING**: Session directory structure changes to always use `round-{n}/` directories
- **BREAKING**: `discourse.md` and `final.md` move inside round directories
- `state.json` schema gains `current_round` field; round metadata derived from filesystem
- Progress CLI simplified (no fallback logic)
- All documentation updated to reflect new structure
- `/ocr-show` and `/ocr-post` commands read from `round-{n}/final.md`

## New Session Structure

```
.ocr/sessions/{YYYY-MM-DD}-{branch}/
├── state.json                      # Session state (REQUIRED)
├── discovered-standards.md         # Merged project context (shared across rounds)
├── requirements.md                 # User-provided requirements (shared, if any)
├── context.md                      # Change summary + Tech Lead guidance (shared)
└── rounds/
    ├── round-1/
    │   ├── reviews/
    │   │   ├── principal-1.md
    │   │   ├── principal-2.md
    │   │   ├── quality-1.md
    │   │   └── quality-2.md
    │   ├── discourse.md            # Round 1 discourse
    │   └── final.md                # Round 1 synthesis
    └── round-2/                    # Created on re-review
        ├── reviews/
        │   └── ...
        ├── discourse.md
        └── final.md
```

## Design Rationale

1. **Shared context, per-round feedback** — `discovered-standards.md`, `requirements.md`, and `context.md` describe the *change being reviewed*, which doesn't change between rounds. Reviews, discourse, and synthesis are *feedback on that change*, which varies per round.

2. **Deterministic round creation** — First review creates `round-1/`. Subsequent `/ocr-review` on same session creates `round-{n+1}/`. No ambiguity.

3. **History preservation** — Previous rounds are never overwritten. Users can compare feedback evolution across rounds.

4. **Simplified consumers** — CLI reads `rounds/round-{current_round}/reviews/*.md`. Commands read `rounds/round-{current_round}/final.md`. Single code path, no fallback logic.

5. **Direct cutover** — Sessions are ephemeral and not version-tracked. No backward compatibility or migration needed. Old sessions can be discarded.

## Impact

- **Affected specs**: `session-management`
- **Affected code**:
  - `packages/cli/src/commands/progress.ts` — Simplified round detection
  - `packages/agents/skills/ocr/references/session-files.md` — New structure
  - `packages/agents/skills/ocr/references/workflow.md` — Phase outputs
  - `packages/agents/skills/ocr/references/session-state.md` — State schema
  - `packages/agents/skills/ocr/references/discourse.md` — Output paths
  - `packages/agents/skills/ocr/references/synthesis.md` — Output paths
  - `packages/agents/commands/review.md` — Artifact paths
  - `packages/agents/commands/show.md` — Read path
  - `packages/agents/commands/post.md` — Read path
  - `README.md` — Session storage section
