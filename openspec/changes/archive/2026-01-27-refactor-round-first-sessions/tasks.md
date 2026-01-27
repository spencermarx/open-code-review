# Tasks: Round-First Session Architecture

> **Direct cutover** — No backward compatibility. No fallback to flat `reviews/`. Sessions are ephemeral.

## 1. Update Authoritative Manifest (`session-files.md`)
- [x] 1.1 Move `discourse.md` and `final.md` into `rounds/round-{n}/` in directory tree
- [x] 1.2 Update state.json schema: add `current_round`, remove `rounds[]` array
- [x] 1.3 Update phase-to-file mapping table for round paths
- [x] 1.4 Update CLI dependencies section for round-aware paths
- [x] 1.5 Update round behavior section (discourse/final per-round)
- [x] 1.6 Update state transitions table with round paths

## 2. Update Workflow Documentation (`workflow.md`)
- [x] 2.1 Add Round Resolution Algorithm to Phase 0 (determine current/next round)
- [x] 2.2 Update Phase 0 `--fresh` to create `rounds/round-1/reviews/` not `reviews/`
- [x] 2.3 Update Phase 0 state verification table with round paths
- [x] 2.4 Update Phase 2 session directory creation (`rounds/round-1/reviews/`)
- [x] 2.5 Update Phase 2 checkpoint to reference `rounds/round-1/reviews/`
- [x] 2.6 Update Phase 4 save path to `rounds/round-{n}/reviews/{type}-{n}.md`
- [x] 2.7 Update Phase 4 checkpoint to reference round directory
- [x] 2.8 Update Phase 6 save path to `rounds/round-{n}/discourse.md`
- [x] 2.9 Update Phase 7 save path to `rounds/round-{n}/final.md`
- [x] 2.10 Update artifact checklist table with round paths
- [x] 2.11 Update quick reference table with round paths
- [x] 2.12 Update state.json examples with minimal schema (current_round, no rounds[])

## 3. Update Session State Documentation (`session-state.md`)
- [x] 3.1 Add `current_round` to state schema examples
- [x] 3.2 Remove `rounds[]` array from schema (derive from filesystem)
- [x] 3.3 Update phase transitions table with round paths
- [x] 3.4 Add note about filesystem-derived state for rounds

## 4. Update Discourse Reference (`discourse.md`)
- [x] 4.1 Update Step 1 paths to `rounds/round-{n}/reviews/`
- [x] 4.2 Update Step 5 save path to `rounds/round-{n}/discourse.md`

## 5. Update Synthesis Reference (`synthesis.md`)
- [x] 5.1 Update Step 1 gather paths to `rounds/round-{n}/reviews/`
- [x] 5.2 Update file reference examples to include round path

## 6. Update SKILL.md
- [x] 6.1 Update session storage table: `rounds/round-{n}/reviews/{type}-{n}.md`
- [x] 6.2 Update session storage table: `rounds/round-{n}/discourse.md`
- [x] 6.3 Update session storage table: `rounds/round-{n}/final.md`

## 7. Update Commands
- [x] 7.1 `review.md`: Update Phase 0 verification table with round paths
- [x] 7.2 `review.md`: Update artifact tree (discourse/final in round directory)
- [x] 7.3 `review.md`: Update checkpoint rules with round paths
- [x] 7.4 `show.md`: Read from `rounds/round-{current_round}/final.md`
- [x] 7.5 `post.md`: Read from `rounds/round-{current_round}/final.md`

## 8. Update Progress CLI (`progress.ts`)
- [x] 8.1 Change `reviewsDir` from `reviews/` to `rounds/round-{n}/reviews/`
- [x] 8.2 Remove fallback logic (lines 227-228) — single code path only
- [x] 8.3 Remove `rounds[]` array parsing from StateJson type
- [x] 8.4 Add round enumeration function (list `rounds/` directory)
- [x] 8.5 Derive round completion from `final.md` presence in round directory
- [x] 8.6 Update `final.md` path display to include round directory
- [x] 8.7 Handle missing/corrupt state.json by reconstructing from filesystem

## 9. Update CLI Guards (`guards.ts`)
- [x] 9.1 Change `ensureSessionDir` to create `rounds/round-1/reviews/` instead of `reviews/`

## 10. Update READMEs
- [x] 10.1 Update root `README.md` session storage section
- [x] 10.2 Sync `.ocr/` mirror files via `ocr update`

## 11. Validation
- [x] 11.1 Run `openspec validate refactor-round-first-sessions --strict`
- [x] 11.2 Manual test: Run `/ocr-review` and verify new structure created
- [x] 11.3 Manual test: Run `ocr progress` and verify round display
- [x] 11.4 Manual test: Run `/ocr-show` and verify reads from round directory
- [x] 11.5 Manual test: Run `/ocr-post` and verify reads from round directory
