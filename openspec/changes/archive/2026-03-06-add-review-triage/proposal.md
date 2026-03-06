# Change: Add Round-Level Review Triage

## Why

The Reviews page shows a flat list of review rounds with no way to track progress. Developers need to triage rounds the same way they triage individual findings -- mark them as "in progress", "changes made", etc. The codebase already has a well-established pattern for finding-level triage (`user_finding_progress`). This change mirrors that pattern one level up and redesigns the Reviews page into a filterable, sortable table.

## What Changes

- **New `user_round_progress` table** -- SQLite migration v3 adding per-round triage status tracking, following the exact `user_finding_progress` pattern (upsert, cascade delete, unique constraint)
- **New REST endpoints** -- `PATCH /api/rounds/:id/progress` and `DELETE /api/rounds/:id/progress` for status mutations
- **Enriched review endpoints** -- `/api/reviews`, `/api/sessions/:id/rounds`, and `/api/sessions/:id/rounds/:round` now include `progress` field
- **Reviews page redesign** -- Full rewrite from card list to filterable/sortable table with inline status dropdowns, actionable-first default view, status/verdict filters
- **Session tabs enhancement** -- Review tab shows triage status badges next to each round
- **Extracted SortableHeader** -- Generic shared component extracted from findings-table for reuse
- **New `RoundTriage` type** -- Shared type: `needs_review | in_progress | changes_made | acknowledged | dismissed`

## Impact

- Affected specs: `dashboard` (new review triage requirement), `cli` (no changes -- CLI doesn't surface round triage)
- Affected code: `packages/dashboard/src/shared/types.ts`, `packages/dashboard/src/server/db.ts`, `packages/dashboard/src/server/routes/progress.ts`, `packages/dashboard/src/server/routes/reviews.ts`, `packages/dashboard/src/server/index.ts`, `packages/dashboard/src/client/` (api-types, status-badge, sortable-header, findings-table, use-reviews, reviews-page, session-tabs)
- No breaking changes
