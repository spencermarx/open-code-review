# enhance-reviewer-selection — Tasks

## Phase 1: Focus Area Tags in Prompt Viewer

### 1.1 Add focus area tags to `PromptViewerSheet` header
- [x] Add all `reviewer.focus_areas` as pill badges between the description and markdown content
- [x] Add persona-specific fields (`known_for`, `philosophy`) between description and tags when present
- [x] Reuse existing tag pill styling from `ReviewerCard`
- **File**: `packages/dashboard/src/client/features/reviewers/components/prompt-viewer-sheet.tsx`
- **Validation**: Opening "View Prompt" for any reviewer shows all focus areas, not just the first 4

---

## Phase 2: Ephemeral Reviewer Types & Serialization

### 2.1 Extend `ReviewerSelection` type
- [x] Add optional `description?: string` field to `ReviewerSelection` in `reviewer-defaults.tsx`
- [x] When `description` is present, the entry is ephemeral (no library `id` required)
- [x] Assign a synthetic `id` for ephemeral entries (e.g., `ephemeral-{index}`) for React keys and state tracking
- **File**: `packages/dashboard/src/client/features/commands/components/reviewer-defaults.tsx`

### 2.2 Update `buildCommandString()` in `command-palette.tsx`
- [x] Serialize ephemeral selections as `--reviewer "..."` flags (one per ephemeral reviewer)
- [x] Library reviewers continue to use `--team` as before
- [x] Ensure proper quoting of description text in the command string
- **File**: `packages/dashboard/src/client/features/commands/components/command-palette.tsx`

### 2.3 Update `parseCommandString()` in `command-palette.tsx`
- [x] Parse `--reviewer "..."` flags from command strings
- [x] Reconstruct ephemeral `ReviewerSelection` entries from parsed descriptions
- [x] Handle multiple `--reviewer` flags
- **File**: `packages/dashboard/src/client/features/commands/components/command-palette.tsx`
- **Validation**: Round-trip: build → parse → build produces identical command string

---

## Phase 3: Dashboard UI for Ephemeral Reviewers

### 3.1 Add "Add description..." to `ReviewerDialog`
- [x] Add button in the dialog footer area (left side, next to selected count)
- [x] Clicking opens an inline textarea with placeholder "Describe what this reviewer should focus on..."
- [x] "Add" button below textarea to confirm; Shift+Enter for newline, Enter to submit
- [x] Added descriptions appear in the dialog's selection state immediately
- [x] Each ephemeral entry shows in the list with a distinct visual (pen icon, italic label, dashed border)
- [x] Ephemeral entries are removable from within the dialog
- **File**: `packages/dashboard/src/client/features/commands/components/reviewer-dialog.tsx`
- **Validation**: Can add, see, and remove ephemeral descriptions in the dialog

### 3.2 Render ephemeral chips in `ReviewerDefaults`
- [x] Ephemeral selections render as visually distinct chips: pen icon (`PenLine` from Lucide), italic text, dashed border
- [x] Description text truncated to ~40 chars in chip, full text in title attribute
- [x] Removable like library reviewer chips
- **File**: `packages/dashboard/src/client/features/commands/components/reviewer-defaults.tsx`
- **Validation**: Ephemeral and library reviewer chips render side-by-side with clear visual distinction

### 3.3 Wire ephemeral state through `CommandPalette`
- [x] `handleApplyReviewers` preserves ephemeral entries from the dialog result
- [x] `handleRemoveReviewer` works for ephemeral entries (match by synthetic ID)
- [x] Confirmation overlay shows the full command including `--reviewer` flags
- **File**: `packages/dashboard/src/client/features/commands/components/command-palette.tsx`
- **Validation**: End-to-end: add ephemeral in dialog → see chip → run → correct command string

---

## Phase 4: AI Workflow Updates (source: `packages/agents/`)

> All AI skill files are authored in `packages/agents/`. Run `nx run cli:update` after changes to sync to `.ocr/`.

### 4.1 Update `review.md` command spec
- [x] Document `--reviewer` parameter in the Arguments section
- [x] Add usage examples showing `--reviewer` alone and combined with `--team`
- **File**: `packages/agents/commands/review.md`

### 4.2 Update `workflow.md` orchestrator instructions
- [x] In Phase 3 (Tech Lead Analysis), add `--team` and `--reviewer` handling alongside `default_team`
- [x] Instruct Tech Lead to synthesize a focused reviewer prompt from each `--reviewer` value
- [x] Define output file naming convention: `ephemeral-{n}.md`
- [x] Confirm ephemeral reviewers participate in discourse and synthesis phases
- **File**: `packages/agents/skills/ocr/references/workflow.md`

### 4.3 Update `reviewer-task.md` with ephemeral variant
- [x] Add an "Ephemeral Reviewer" section documenting the synthesized persona format
- [x] Ephemeral task receives the user's description as its persona (no `.md` file lookup)
- [x] Same output format as library reviewers (`## Summary`, `## Findings`, etc.)
- **File**: `packages/agents/skills/ocr/references/reviewer-task.md`

### 4.4 Update `session-files.md` with ephemeral file naming
- [x] Add `ephemeral-{n}.md` to the reviewer file naming section alongside `{type}-{n}.md`
- [x] Add example entries to the session directory structure
- **File**: `packages/agents/skills/ocr/references/session-files.md`

---

## Parallelization Notes

- **Phase 1** (tags in prompt viewer) is fully independent — can be done first or in parallel
- **Phase 2** (types + serialization) must come before Phase 3 (UI)
- **Phase 3.1** (dialog) and **Phase 3.2** (chips) can be done in parallel
- **Phase 3.3** (wiring) depends on 3.1 and 3.2
- **Phase 4** (AI workflow) can be done in parallel with Phases 2-3
- After all phases, run `nx run cli:update` to sync agents → `.ocr/`
