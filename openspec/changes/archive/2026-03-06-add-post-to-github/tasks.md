## 1. Server: Post Handler

- [x] 1.1 Create `post-handler.ts` Socket.IO handler module with `registerPostHandlers()` function
- [x] 1.2 Implement `post:check-gh` event: validate session, check `gh auth status`, find PR via `gh pr list --head`
- [x] 1.3 Implement branch resolution logic for slash-prefixed branches (e.g. `feat-foo` tries `feat/foo`)
- [x] 1.4 Implement `post:generate` event: read `final.md` + reviewer outputs, build prompt, spawn Claude CLI with `--output-format stream-json`
- [x] 1.5 Parse NDJSON stream from Claude CLI: emit `post:token` for text deltas, `post:status` for tool use and thinking events
- [x] 1.6 Implement `post:cancel` event: kill active Claude process via SIGTERM, emit `post:cancelled`
- [x] 1.7 Implement `post:save` event: write `final-human.md` to session round directory
- [x] 1.8 Implement `post:submit` event: write content to temp file, run `gh pr comment --body-file`, extract comment URL from output
- [x] 1.9 Implement `cleanupAllPostGenerations()` for server shutdown
- [x] 1.10 Track active generation processes with Map keyed by `sessionId-roundNumber` for cancellation

## 2. Server: Prompt Module

- [x] 2.1 Create `prompts/human-review.ts` with `buildHumanReviewPrompt()` function
- [x] 2.2 Implement Google code review guidelines for tone (comment on code not developer, explain why, label severity)
- [x] 2.3 Implement anti-AI writing instructions (sentence variety, word choice, structure disruption, natural imperfections)
- [x] 2.4 Implement content rules (preserve all findings, include file paths and line numbers, consolidate duplicates, strip meta-commentary)
- [x] 2.5 Implement absolute don'ts (no mention of multiple reviewers, AI, agents, or tools)

## 3. Server: Filesystem Sync

- [x] 3.1 Add `final-human` to `ArtifactType` union in `filesystem-sync.ts`
- [x] 3.2 Add `final-human.md` detection in round directory scanning logic
- [x] 3.3 Add `final-human.md` incremental sync via chokidar file path matching
- [x] 3.4 Add `final-human` to `VALID_ARTIFACT_TYPES` set in `artifacts.ts` route

## 4. Client: Hook

- [x] 4.1 Create `use-post-review.ts` hook with `PostReviewStep` state machine (idle, checking, ready, generating, preview, posting, posted, error)
- [x] 4.2 Implement Socket.IO event listeners: `post:gh-result`, `post:token`, `post:status`, `post:done`, `post:cancelled`, `post:error`, `post:save-result`, `post:submit-result`
- [x] 4.3 Implement streaming content accumulation with ref for performance
- [x] 4.4 Expose actions: `checkGitHub`, `generate`, `cancelGeneration`, `saveDraft`, `submitToGitHub`, `reset`

## 5. Client: Dialog

- [x] 5.1 Create `post-review-dialog.tsx` multi-step modal component
- [x] 5.2 Implement "checking" step: spinner while verifying gh auth and PR detection
- [x] 5.3 Implement "ready" step: two-option choice (Post Team Review, Generate Human Review)
- [x] 5.4 Implement "generating" step: live streaming markdown preview with tool status bar
- [x] 5.5 Implement "preview" step: edit/preview tabs (textarea + markdown preview toggle), save draft button
- [x] 5.6 Implement "posting" step: progress indicator during GitHub submission
- [x] 5.7 Implement "posted" step: success message with clickable comment URL
- [x] 5.8 Implement "error" step: error message with retry option

## 6. Client: Integration

- [x] 6.1 Add `PostReviewStep` type to `shared/types.ts`
- [x] 6.2 Add `PostCheckResult` interface to `client/lib/api-types.ts`
- [x] 6.3 Add "Post to GitHub" button on `round-page.tsx`
- [x] 6.4 Fetch `final-human` artifact on round page to detect existing human review drafts
