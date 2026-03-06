## 1. Shared Type

- [x] 1.1 Add `RoundTriage` type to `src/shared/types.ts`

## 2. Server: Schema and Helpers

- [x] 2.1 Add `RoundProgressRow` type to `src/server/db.ts`
- [x] 2.2 Add migration v3: `user_round_progress` table with `UNIQUE(round_id)` constraint
- [x] 2.3 Add `getRoundById()` helper
- [x] 2.4 Add `getRoundProgress()` helper using `resultToRow` pattern
- [x] 2.5 Add `upsertRoundProgress()` helper using `INSERT ... ON CONFLICT ... DO UPDATE`
- [x] 2.6 Add `deleteRoundProgress()` helper

## 3. Server: Endpoints

- [x] 3.1 Add `PATCH /api/rounds/:id/progress` endpoint to `src/server/routes/progress.ts`
- [x] 3.2 Add `DELETE /api/rounds/:id/progress` endpoint
- [x] 3.3 Enrich `GET /api/reviews` with `progress` field in `src/server/index.ts`
- [x] 3.4 Enrich `GET /:id/rounds` and `GET /:id/rounds/:round` in `src/server/routes/reviews.ts`

## 4. Client: Types and Components

- [x] 4.1 Add `RoundProgress` interface and re-export `RoundTriage` in `src/client/lib/api-types.ts`
- [x] 4.2 Add round triage variants to `StatusBadge` in `src/client/components/ui/status-badge.tsx`
- [x] 4.3 Extract `SortableHeader` into `src/client/components/ui/sortable-header.tsx`
- [x] 4.4 Update `findings-table.tsx` to import shared `SortableHeader`

## 5. Client: Hooks and Page

- [x] 5.1 Add `useAllReviews()` and `useUpdateRoundStatus()` hooks to `src/client/features/reviews/hooks/use-reviews.ts`
- [x] 5.2 Rewrite `reviews-page.tsx` as filterable/sortable table with actionable-first default
- [x] 5.3 Add triage status badges to session tabs `ReviewTabContent`

## 6. Verification

- [x] 6.1 TypeScript compilation clean (`npx tsc --noEmit`)
- [x] 6.2 All 39 tests pass (`npx nx test dashboard`)
