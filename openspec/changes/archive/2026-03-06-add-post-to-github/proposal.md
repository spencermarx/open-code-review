# Change: Add Post to GitHub with Human Review Translation

## Why

The `/ocr-post` slash command only works inside an AI assistant terminal, so dashboard users reviewing findings have no way to post directly from the UI. Additionally, the multi-reviewer synthesis reads like AI-generated content when posted raw to a PR -- a human review mode rewrites findings in a single human voice following Google's code review guidelines for tone.

## What Changes

- **New "Post to GitHub" capability on round page** -- Socket.IO-driven flow that checks `gh auth status`, discovers the PR for the current branch (with slash-prefix resolution for encoded branch names), and posts the review as a PR comment via `gh pr comment`
- **New "Human Review Translation" mode** -- Optional AI rewrite step that spawns Claude CLI with `--output-format stream-json`, streams tokens in real-time to the client, and produces a human-voice review indistinguishable from a real developer's PR comment
- **New human review prompt module** -- Prompt generator that follows Google's code review guidelines for tone, includes anti-AI writing instructions, preserves all substantive findings, and outputs GitHub-flavored markdown
- **Multi-step modal dialog** -- State-machine-driven dialog with steps: checking, ready (choose mode), generating (streaming markdown + tool status), preview (edit/preview tabs), posting, posted (success with comment URL), error
- **Draft persistence** -- Human reviews are saved as `final-human.md` in the session round directory and detected by FilesystemSync as a new artifact type
- **New `PostReviewStep` and `PostCheckResult` types** -- Shared type for the state machine and API contract

## Impact

- Affected specs: `dashboard` (new post-to-GitHub and human review requirements)
- Affected code: `packages/dashboard/src/server/socket/post-handler.ts`, `packages/dashboard/src/server/prompts/human-review.ts`, `packages/dashboard/src/client/features/reviews/hooks/use-post-review.ts`, `packages/dashboard/src/client/features/reviews/components/post-review-dialog.tsx`, `packages/dashboard/src/client/features/reviews/round-page.tsx`, `packages/dashboard/src/shared/types.ts`, `packages/dashboard/src/client/lib/api-types.ts`, `packages/dashboard/src/server/routes/artifacts.ts`, `packages/dashboard/src/server/services/filesystem-sync.ts`
- No breaking changes
- New optional dependency: Claude CLI (for human review generation)
