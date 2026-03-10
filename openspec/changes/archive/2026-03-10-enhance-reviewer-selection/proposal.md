# enhance-reviewer-selection

## Summary

Two improvements to the reviewer selection experience:

1. **Focus area tag visibility**: The Team page's `ReviewerCard` truncates focus areas to 4 tags with a "+N" badge, but there's no way to see the hidden ones. Surface the full list in the `PromptViewerSheet` dialog header so clicking "View Prompt" reveals all tags.

2. **Ephemeral reviewer descriptions**: Users can add custom one-off reviewer descriptions when configuring a review. These don't persist — they're described inline at review-config time and passed to the orchestrator. This completes a three-mode reviewer model:
   - **Library reviewers** — persisted templates selected from the reviewer library
   - **Custom persistent reviewers** — created via `/ocr:create-reviewer`, saved to disk
   - **Ephemeral reviewers** — described inline per-review, not saved

## Motivation

Focus area tags help users quickly assess a reviewer's coverage. Truncating to 4 without any overflow mechanism creates a dead end — the "+2" badge promises more information but delivers none.

Ephemeral reviewers address a real workflow gap: users often want a specific review lens ("focus on error handling in the auth flow", "review as a junior developer would") without the overhead of creating and maintaining a persistent reviewer. The orchestrator already supports natural language direction — ephemeral reviewers formalize this into the `--team` interface.

## Scope

- **Dashboard**: `PromptViewerSheet`, `ReviewerDialog`, `ReviewerDefaults`, `CommandPalette`
- **CLI flag**: Extend `--team` serialization with `--reviewer` flag for inline descriptions
- **AI workflow**: Update `workflow.md` to document how the Tech Lead handles ephemeral descriptions
- **AI command**: Update `review.md` to document `--reviewer` parameter

## Affected Specs

- `reviewer-management` (modified — tag visibility)
- `review-orchestration` (modified — ephemeral reviewer spawning)
- `dashboard` (modified — ephemeral UI in command palette)
