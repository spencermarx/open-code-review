# enhance-reviewer-selection — Design

## Decision 1: Focus Area Tags in Prompt Viewer (not tooltip)

**Options considered**:
- (A) Tooltip on the "+N" badge in `ReviewerCard`
- (B) Full tag list in the `PromptViewerSheet` dialog header

**Chosen**: **(B) — Tags in Prompt Viewer header**

**Rationale**: The "View Prompt" dialog is already the natural overflow destination for reviewer details. Adding tags between the description and markdown content is zero new UI patterns — it uses the same tag pill style already in `ReviewerCard`. Tooltips on small "+N" badges are clumsy on mobile and hard to discover.

The card's "+N" badge now acts as a visual hint that more detail is available via "View Prompt", which is the intended exploration path anyway.

## Decision 2: Ephemeral Reviewer UX — Separate `--reviewer` Flag

**Options considered**:
- (A) Embed descriptions inline in `--team` value: `--team principal:2,ephemeral:"focus on auth":1`
- (B) Separate `--reviewer` flag: `--team principal:2 --reviewer "Focus on error handling"`
- (C) JSON payload for complex reviewer configs

**Chosen**: **(B) — Separate `--reviewer` flag**

**Rationale**: Keeps the `--team` format clean (ID:count pairs only). `--reviewer` can be repeated for multiple ephemeral reviewers:

```
ocr review --team principal:2 --reviewer "Focus on error handling" --reviewer "Review as junior dev"
```

This is natural to type, easy to parse, and the orchestrator treats each `--reviewer` value as one ephemeral reviewer (redundancy 1 by default — ephemeral reviewers don't need redundancy since they're inherently unique).

## Decision 3: Ephemeral Reviewer in Dashboard UI

**Design**: Add an "Add description..." button in the `ReviewerDialog` footer area (next to the selected count). Clicking it opens an inline textarea. Each added description appears as a special chip in the selection area with a distinct visual (dashed border, pen icon, different color).

**State flow**:
- `ReviewerSelection` type gains an optional `description?: string` field
- When `description` is present, the selection represents an ephemeral reviewer (no `id` needed from the library)
- `buildCommandString()` serializes ephemeral entries as `--reviewer "..."` flags
- `parseCommandString()` reconstructs ephemeral entries from `--reviewer` flags

**Ephemeral chips in `ReviewerDefaults`**: Display as slightly different chips (italic text, pen icon instead of reviewer icon) to visually distinguish them from library reviewers.

## Decision 4: Orchestrator Handling of Ephemeral Reviewers

The Tech Lead already has the capability to spawn reviewers with natural language direction. Ephemeral reviewers formalize this:

1. For each `--reviewer` value, the Tech Lead generates a focused review prompt based on the description
2. The ephemeral reviewer is spawned as a regular Task with a synthesized persona (the description becomes the reviewer's identity and focus)
3. Output file naming: `ephemeral-{n}.md` (e.g., `ephemeral-1.md`, `ephemeral-2.md`)
4. Ephemeral reviewers participate in discourse and synthesis like any other reviewer

**No persistence**: Ephemeral reviewers exist only for the current review session. They are not written to `reviewers-meta.json` or the reviewers directory.

## Decision 5: Source of Truth for AI Skill Files

All AI skill files (`review.md`, `workflow.md`, `reviewer-task.md`, `session-files.md`) are authored in `packages/agents/`. The `.ocr/` directory is the installed copy, synced via `nx run cli:update`.

**Touchpoints for ephemeral reviewers in `packages/agents/`**:

| File | Change |
|------|--------|
| `commands/review.md` | Document `--reviewer` flag in Arguments section |
| `skills/ocr/references/workflow.md` | Phase 3: `--reviewer` parsing alongside `--team`; Phase 4: ephemeral spawning rules |
| `skills/ocr/references/reviewer-task.md` | Ephemeral variant section — description-as-persona, same output format |
| `skills/ocr/references/session-files.md` | Add `ephemeral-{n}.md` to file naming and directory examples |
