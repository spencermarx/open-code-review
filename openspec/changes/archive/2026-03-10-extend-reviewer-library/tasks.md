# extend-reviewer-library — Tasks

## Phase 1: Reviewer Library (Markdown Templates)

### 1.1 Create holistic generalist reviewer templates
- [x] `architect.md` — Software Architect (system boundaries, contracts, evolutionary architecture)
- [x] `fullstack.md` — Full-Stack Engineer (end-to-end coherence, vertical slices)
- [x] `reliability.md` — Reliability Engineer (failure modes, resilience, observability)
- [x] `staff-engineer.md` — Staff Engineer (cross-team impact, technical strategy)
- [x] `principal.md` — Principal Engineer (architecture, system design, engineering best practices)
- **Location**: `.ocr/skills/references/reviewers/` and `packages/agents/skills/ocr/references/reviewers/`
- **Validation**: Each file follows the template structure from `reviewer-template.md`

### 1.2 Create domain specialist reviewer templates
- [x] `frontend.md` — Frontend Engineer
- [x] `backend.md` — Backend Engineer
- [x] `infrastructure.md` — Infrastructure Engineer
- [x] `performance.md` — Performance Engineer
- [x] `accessibility.md` — Accessibility Engineer
- [x] `data.md` — Data Engineer
- [x] `devops.md` — DevOps Engineer
- [x] `dx.md` — DX Engineer
- [x] `mobile.md` — Mobile Engineer
- [x] `security.md` — Security Engineer
- [x] `quality.md` — Quality Engineer
- [x] `testing.md` — Testing Engineer
- [x] `ai.md` — AI Engineer (LLM integration, prompt engineering, model evaluation)
- **Validation**: Each follows template structure, includes specialist-weighted focus

### 1.3 Create famous engineer persona reviewer templates
- [x] `martin-fowler.md` — Refactoring, evolutionary design, code smells
- [x] `kent-beck.md` — Simplicity, TDD, "make it work, make it right, make it fast"
- [x] `john-ousterhout.md` — Deep modules, complexity management
- [x] `anders-hejlsberg.md` — Type system design, language ergonomics
- [x] `vladimir-khorikov.md` — Domain-driven testing, functional architecture
- [x] `kent-dodds.md` — React composition, frontend best practices, pragmatic testing
- [x] `tanner-linsley.md` — Headless UI patterns, composability
- [x] `kamil-mysliwiec.md` — Modular architecture, DI, progressive framework design
- [x] `sandi-metz.md` — Practical OO, SOLID, cost of change
- [x] `rich-hickey.md` — Simplicity vs. easiness, immutability, value-oriented programming
- **Validation**: Each includes blockquote header with "Known for" + "Philosophy"
- **Validation**: Each follows template structure with persona-specific review approach

### 1.4 Update reviewer template with persona variant
- [x] Add persona blockquote header format to `reviewer-template.md` as an optional section
- [x] Document tier conventions (holistic/specialist/persona) in template

### 1.5 Sync all reviewers to agents package
- [x] All 28 reviewer files exist in both `.ocr/skills/references/reviewers/` and `packages/agents/skills/ocr/references/reviewers/`
- **Validation**: Files are identical between the two locations

---

## Phase 2: Reviewer Sync (CLI + AI Skill)

### 2.1 Add `reviewers-meta.json` TypeScript types
- [x] Define `ReviewerMeta` type in `packages/cli/src/lib/state/types.ts`
- [x] Define `ReviewersMeta` (top-level) type with `schema_version`, `generated_at`, `reviewers[]`
- [x] Define `ReviewerTier` union: `holistic | specialist | persona | custom`
- **Validation**: Types compile, match schema described in design.md

### 2.2 Implement `ocr reviewers sync` CLI subcommand
- [x] Create `packages/cli/src/commands/reviewers.ts` with `sync` subcommand
- [x] **`--stdin` mode**: Accept JSON on stdin, validate against `ReviewersMeta` schema, write atomically
- [x] **Direct scan mode** (no `--stdin`): Scan `.ocr/skills/references/reviewers/*.md` using `generateReviewersMeta()`, write atomically
- [x] Register under `ocr reviewers` parent command in CLI entry point
- [x] Print confirmation with reviewer count and tier breakdown
- **Validation**: Both modes write valid `reviewers-meta.json`
- **Validation**: Invalid schema prints error, exits non-zero, does not write file

### 2.3 Create `/ocr:sync-reviewers` AI skill
- [x] Create `packages/agents/commands/sync-reviewers.md` (source of truth)
- [x] Skill reads all `.md` files from `.ocr/skills/references/reviewers/`
- [x] Skill reads `config.yaml` to identify `default_team` entries
- [x] Skill uses semantic understanding to extract metadata (handles template deviations)
- [x] Skill classifies each reviewer into correct tier (holistic/specialist/persona/custom)
- [x] Skill assigns appropriate Lucide icon per the icon mapping
- [x] Skill extracts "Known for" and "Philosophy" from persona blockquote headers
- [x] Skill builds `ReviewersMeta` JSON and pipes to `ocr reviewers sync --stdin` for validated persistence
- **Validation**: Running `/ocr:sync-reviewers` produces a valid `reviewers-meta.json`
- **Depends on**: 2.2

### 2.4 Update `ocr init` to generate initial `reviewers-meta.json`
- [x] After installing skill files, automatically call `generateReviewersMeta()` and write the file
- **Validation**: Fresh `ocr init` produces a `reviewers-meta.json` without manual sync

---

## Phase 3: Dashboard Reviewer Selection UI

### 3.1 Add `/api/reviewers` endpoint to dashboard server
- [x] Create `packages/dashboard/src/server/routes/reviewers.ts`
- [x] `GET /api/reviewers` reads `.ocr/reviewers-meta.json`, returns parsed JSON
- [x] If file doesn't exist, return `{ reviewers: [], defaults: [] }`
- [x] Register route in server `index.ts`
- **Validation**: Endpoint returns valid JSON, handles missing file gracefully

### 3.2 Add filesystem watcher + Socket.IO event for `reviewers-meta.json`
- [x] Watch `.ocr/reviewers-meta.json` in the existing filesystem sync service
- [x] Emit `reviewers:updated` Socket.IO event on file change
- **Validation**: Changing the file triggers real-time dashboard update
- **Depends on**: 3.1

### 3.3 Create `useReviewers` React hook
- [x] Create `packages/dashboard/src/client/features/commands/hooks/use-reviewers.ts`
- [x] Fetch `/api/reviewers` on mount
- [x] Subscribe to `reviewers:updated` Socket.IO events for live refresh
- [x] Export `reviewers`, `defaults`, `isLoaded` state
- **Validation**: Hook returns reviewer data, updates on socket events
- **Depends on**: 3.1, 3.2

### 3.4 Build `ReviewerDefaults` inline component
- [x] Render default reviewers as compact chips in the review command form
- [x] Each chip: Lucide icon + short name + "×N" redundancy badge
- [x] Chips are removable (click ×) to exclude from this run
- [x] "Customize..." button to open reviewer dialog
- [x] When no `reviewers-meta.json` exists, show a subtle prompt: "Run /ocr:sync-reviewers to customize your review team"
- **Validation**: Default team renders correctly, chips are removable
- **Depends on**: 3.3

### 3.5 Build `ReviewerDialog` modal component
- [x] Full-width dialog overlay with search input at top
- [x] Client-side search across name, description, focus areas
- [x] Tier-grouped sections with collapsible headers
- [x] Reviewer rows with: icon, name, tier badge, truncated description, checkbox
- [x] Clicking a reviewer row toggles the checkbox (not just the checkbox itself)
- [x] Help popover (?) per card: full description, known_for/philosophy for personas, focus area tags
- [x] Redundancy stepper (1-3) visible when card is selected
- [x] "Apply" + "Cancel" footer buttons
- [x] Proper width containment (`flex flex-col` for item list, `min-w-0` on flex children)
- **Validation**: Dialog opens, search works, multi-select works, no horizontal overflow
- **Depends on**: 3.3

### 3.6 Integrate reviewer selection into `CommandPalette`
- [x] Add `ReviewerDefaults` component between existing params and run button
- [x] Track `teamOverride` state (`null` = defaults, `ReviewerSelection[]` = explicit)
- [x] Serialize selection to `--team` flag in `buildCommandString()`
- [x] Parse `--team` flag in `parseCommandString()` for re-run prefill
- [x] When team matches defaults exactly, omit `--team` flag
- **Validation**: End-to-end: select reviewers → run → correct `--team` flag generated
- **Depends on**: 3.4, 3.5

### 3.7 Update AI review skill to accept `--team` flag
- [x] Update `.ocr/commands/review.md` to document `--team` parameter
- [x] Update `.ocr/skills/SKILL.md` workflow to parse `--team` and override `default_team`
- [x] Format: `--team reviewer-id:count,reviewer-id:count`
- **Validation**: `/ocr:review --team principal:1,martin-fowler:1` spawns exactly those reviewers

---

## Phase 4: Spec Updates

### 4.1 Write spec delta: `reviewer-library`
- [x] ADDED requirements for holistic, specialist, and persona tier definitions
- [x] ADDED requirement for persona blockquote header format
- [x] MODIFIED requirement for default reviewer personas (expand from 4 to include all built-in)

### 4.2 Write spec delta: `reviewer-sync`
- [x] ADDED requirement for `ocr reviewers sync --stdin` CLI command
- [x] ADDED requirement for direct scan mode (`ocr reviewers sync` without `--stdin`)
- [x] ADDED requirement for `reviewers-meta.json` schema and file location
- [x] ADDED requirement for `/ocr:sync-reviewers` AI command
- [x] MODIFIED `ocr init` to include reviewer sync step

### 4.3 Write spec delta: `reviewer-selection-ui`
- [x] ADDED requirement for reviewer selection in dashboard command palette
- [x] ADDED requirement for reviewer dialog with search, tiers, help popovers
- [x] ADDED requirement for `--team` flag on review command
- [x] ADDED requirement for `/api/reviewers` dashboard endpoint

---

## Parallelization Notes

- **Phase 1** (templates) can be done entirely in parallel — each `.md` file is independent
- **Phase 2.1** (types) and **Phase 2.2** (CLI) can start immediately
- **Phase 2.3** (AI skill) depends on 2.2 being complete
- **Phase 3.1-3.2** (server) can start as soon as Phase 2.1 types are defined
- **Phase 3.3-3.6** (client) are sequential (each builds on the previous)
- **Phase 3.7** (skill update) can be done in parallel with Phase 3 client work
- **Phase 4** (specs) can be written in parallel with implementation
