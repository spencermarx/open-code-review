# add-reviewer-team-page — Tasks

## Phase 1: Server — Prompt Endpoint + Command Whitelist

### 1.1 Add `GET /api/reviewers/:id/prompt` endpoint
- [x] Add route to `packages/dashboard/src/server/routes/reviewers.ts`
- [x] Validate `:id` param (alphanumeric + hyphens only, reject path traversal)
- [x] Read `.ocr/skills/references/reviewers/{id}.md`, return `{ id, content }`
- [x] Return 404 with `{ error }` if file doesn't exist
- **Validation**: `GET /api/reviewers/architect/prompt` returns markdown content; `GET /api/reviewers/../../etc/passwd/prompt` returns 400

### 1.2 Add `create-reviewer` and `sync-reviewers` to AI command whitelist
- [x] Add both to `AI_COMMANDS` set in `packages/dashboard/src/server/socket/command-runner.ts`
- [x] Add argument parsing for `create-reviewer` and `sync-reviewers` (pass raw args) in `spawnAiCommand`
- **Validation**: `command:run` with `create-reviewer test --focus "..."` spawns successfully; unknown commands still rejected

---

## Phase 2: AI Skills — Create + Sync Reviewer Commands

### 2.1 Create `/ocr:create-reviewer` AI command
- [x] Create `packages/agents/commands/create-reviewer.md` (source of truth)
- [x] Input format: `create-reviewer {name} --focus "{description}"`
- [x] Step-by-step instructions: parse args, check duplicates, read template, read exemplars, generate, write
- [x] Slug normalization rules
- [x] Template section checklist (all required sections)
- [x] Auto-sync step delegates to `sync-reviewers.md` workflow
- **Validation**: AI command generates a well-structured reviewer file when invoked

### 2.2 Create `/ocr:sync-reviewers` AI command
- [x] Create `packages/agents/commands/sync-reviewers.md` (source of truth)
- [x] Balanced design: AI does flexible analysis (semantic extraction), CLI does deterministic persistence (`--stdin` validation)
- [x] Includes built-in ID lists, icon assignment table, and extraction guidance
- [x] Explicitly instructs AI to use semantic understanding for template deviations
- [x] Pipes final JSON to `ocr reviewers sync --stdin` for schema validation
- **Validation**: AI command produces valid `reviewers-meta.json` even with imperfect reviewer files

---

## Phase 3: Dashboard Client — Team Page

### 3.1 Create `ReviewerTeamPage` component
- [x] Create `packages/dashboard/src/client/features/reviewers/reviewers-page.tsx`
- [x] Page header: title ("Review Team"), description, search input
- [x] Tier-grouped grid using `useReviewers()` hook (reuse from commands feature)
- [x] Each tier section: collapsible header with tier name, count badge
- [x] Empty state: "Click **Sync** above or run `/ocr:sync-reviewers` from your IDE" (no mention of `ocr init`)
- **Validation**: Page renders all reviewers grouped by tier; search filters correctly

### 3.2 Create `ReviewerCard` component
- [x] Create `packages/dashboard/src/client/features/reviewers/components/reviewer-card.tsx`
- [x] Display: `ReviewerIcon` + name + tier badge + description (truncated) + focus area tags
- [x] "Default" badge when `is_default` is true
- [x] For personas: subtle `known_for` line below description
- [x] "View Prompt" button on each card
- **Validation**: Cards render correctly for all tiers; persona cards show known_for

### 3.3 Create `PromptViewerDialog` component
- [x] Create `packages/dashboard/src/client/features/reviewers/components/prompt-viewer-sheet.tsx`
- [x] Centered modal dialog (not side drawer) matching other dialog patterns in the app
- [x] Fetches `GET /api/reviewers/:id/prompt`, renders via `MarkdownRenderer`
- [x] Header: reviewer icon, name, description
- [x] Loading and error states; backdrop click or Escape to close
- **Validation**: Clicking "View Prompt" opens centered dialog with rendered markdown; handles 404 gracefully
- **Depends on**: 1.1

### 3.4 Create `CreateReviewerDialog` component
- [x] Create `packages/dashboard/src/client/features/reviewers/components/create-reviewer-dialog.tsx`
- [x] Inputs: Name (text), Focus Description (textarea)
- [x] Auto-generated slug preview below name input
- [x] "Create" button: emits `command:run` via Socket.IO with formatted command string
- [x] Inline output area showing AI command progress with auto-scroll
- [x] Tracks execution by `execution_id` for accurate state
- [x] Close dialog after successful completion (or allow manual close via "Done" button)
- **Validation**: Submitting creates a reviewer; output shows in dialog; page auto-refreshes
- **Depends on**: 1.2

### 3.5 Add Sync + Create action buttons to page header
- [x] "Sync Reviewers" button: emits `command:run` with `sync-reviewers`
- [x] Sync button tracks by `execution_id` for accurate loading state (not any `command:finished`)
- [x] "Create Reviewer" button: opens `CreateReviewerDialog`
- [x] Both disabled when AI CLI unavailable (use `useAiCli()` hook)
- **Validation**: Buttons work; disabled states correct; sync loading clears only when its specific command finishes
- **Depends on**: 1.2, 3.1, 3.4

### 3.6 Add route and sidebar navigation
- [x] Add `/reviewers` route to `packages/dashboard/src/client/router.tsx`
- [x] Add "Team" nav item to sidebar (between "Commands" and "Sessions")
- [x] Use `Users` Lucide icon
- **Validation**: Navigation works; active state highlights correctly

### 3.7 Extract shared search utility
- [x] Create `packages/dashboard/src/client/lib/reviewer-utils.ts`
- [x] Extract `filterReviewers`, `groupByTier`, `TIER_CONFIG`, `toSlug`
- [x] Reuse in both `ReviewerDialog` (Command Center) and `ReviewerTeamPage`
- **Validation**: Both search implementations behave identically

---

## Phase 4: UX Polish

### 4.1 Fix reviewer selection dialog overflow
- [x] Replace `grid gap-1.5` with `flex flex-col gap-1.5` for reviewer item list (grid auto-columns expand to content width)
- [x] Add `min-w-0` to scroll container and row elements for proper flex shrinking
- [x] Add `overflow-x-hidden` to scroll container
- [x] Add `px-4` to backdrop for edge-to-edge protection

### 4.2 Add click-to-toggle on reviewer rows
- [x] Entire reviewer row is clickable to toggle checkbox (not just the checkbox)
- [x] `stopPropagation` on checkbox, stepper buttons, and help button to prevent double-toggle
- [x] Keyboard accessible: Enter/Space toggles the row

### 4.3 Expand help popover content
- [x] Help popover now shows full description (untruncated) at the top
- [x] Followed by persona-specific fields (known_for, philosophy)
- [x] Then focus area tags
- **Validation**: Every reviewer type shows useful content in the help popover

---

## Phase 5: Content & Package Sync

### 5.1 Update Kent Dodds reviewer
- [x] Broadened from testing-only to React composition, frontend best practices, and pragmatic testing
- [x] Updated `known_for`: "Epic React, Testing Library, Remix, and the Testing Trophy"
- [x] Updated focus areas: React composition, colocation, custom hooks, AHA, testing strategy

### 5.2 Sync all reviewers to agents package
- [x] All 28 reviewer files exist in `packages/agents/skills/ocr/references/reviewers/`
- [x] Both new commands (`create-reviewer.md`, `sync-reviewers.md`) exist in `packages/agents/commands/`
- **Validation**: `packages/agents/` is the source of truth; `.ocr/` is the installed copy

---

## Phase 6: Spec Updates

### 6.1 Write spec delta: `reviewer-team-page`
- [x] ADDED requirements for Team page, prompt viewer (dialog), prompt API endpoint, sidebar nav

### 6.2 Write spec delta: `dashboard-reviewer-creation`
- [x] ADDED requirements for create dialog, sync button, command whitelist modification

### 6.3 Write spec delta: `create-reviewer-skill`
- [x] ADDED requirements for `/ocr:create-reviewer` AI command with template adherence and auto-sync

---

## Parallelization Notes

- **Phase 1** (server) and **Phase 2** (AI skills) can run in parallel — no dependencies between them
- **Phase 3.1-3.2** (page + cards) can start immediately — they only depend on the existing `useReviewers` hook
- **Phase 3.3** (prompt viewer) depends on **1.1** (prompt endpoint)
- **Phase 3.4** (create dialog) depends on **1.2** (command whitelist)
- **Phase 3.5** (action buttons) depends on 3.1 and 3.4
- **Phase 3.6** (routing/nav) can be done first or last — independent of content
- **Phase 3.7** (shared search) can be done anytime during Phase 3
- **Phase 4** (UX polish) depends on Phase 3 being complete
- **Phase 5** (content/package sync) can be done in parallel with anything
- **Phase 6** (specs) is already done as part of this proposal
