# add-reviewer-team-page — Design

## Page Layout Pattern

Follows the established dashboard page convention: **fixed header with actions at top, scrollable content below**. This matches `CommandsPage` (palette + action area at top, output/history below) and `ReviewsPage` (title + toggle buttons at top, table below).

```
┌─────────────────────────────────────────────────────────────────┐
│  Review Team                              [Sync] [+ Create]    │  ← fixed header
│  Manage your AI reviewer personas.                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 🔍 Search reviewers...                                  │    │  ← search input
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Generalists (4)                                    ▼ collapse  │  ← scrollable
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │    content
│  │ 🧱 Arch  │ │ 🧭 Staff │ │ 📐 Full  │ │ 🛡 Reli  │           │
│  │ Default  │ │          │ │ Default  │ │          │           │
│  │ focus... │ │ focus... │ │ focus... │ │ focus... │           │
│  │ [Prompt] │ │ [Prompt] │ │ [Prompt] │ │ [Prompt] │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                 │
│  Specialists (13)                                   ▼ collapse  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ ...      │ │ ...      │ │ ...      │ │ ...      │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                 │
│  Personas (10)                                      ▼ collapse  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ 🧠 Fowler│ │ 🧠 Beck  │ │ ...      │ │ ...      │           │
│  │ Known for│ │ Known for│ │          │ │          │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                        Dashboard (Browser)                        │
│                                                                   │
│  /reviewers page                                                  │
│  ├── Header: title + [Sync] + [+ Create]                         │
│  ├── Search input                                                 │
│  ├── Scrollable tier-grouped card grid                            │
│  ├── PromptViewerSheet (overlay, fetches .md via API)             │
│  └── CreateReviewerDialog (overlay, fires command:run)            │
│          ▲ GET /api/reviewers/:id/prompt    │ socket: command:run │
└──────────┼─────────────────────────────────┼─────────────────────┘
           │                                 │
           │                                 ▼
┌──────────┼─────────────────────────────────────────────────────────┐
│          │              Dashboard Server                           │
│                                                                    │
│  GET /api/reviewers/:id/prompt                                     │
│  → reads .ocr/skills/references/reviewers/{id}.md                  │
│                                                                    │
│  command:run { command: "create-reviewer ..." }                     │
│  → AI CLI spawns with create-reviewer.md prompt                    │
│  → AI writes .md file + runs sync                                  │
│  → reviewers-meta.json updated                                     │
│  → watcher emits reviewers:updated                                 │
│  → page auto-refreshes                                             │
│                                                                    │
│  command:run { command: "sync-reviewers" }                          │
│  → AI CLI spawns with sync-reviewers.md prompt                     │
│  → same refresh path                                               │
└────────────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
ReviewerTeamPage (follows standard page layout: header → content)
│
├── <div> Page Header (sticky/fixed at top of content area)
│   ├── <div> Title row
│   │   ├── <h1> "Review Team"
│   │   └── <div> Action buttons (right-aligned)
│   │       ├── SyncReviewersButton (triggers sync-reviewers AI command)
│   │       └── CreateReviewerButton (opens CreateReviewerDialog)
│   ├── <p> "Manage your AI reviewer personas."
│   └── <input> Search reviewers (full-width, filters cards below)
│
├── <div> Scrollable content (space-y-6, same as other pages)
│   ├── TierSection "Generalists" (collapsible)
│   │   └── <div> Card grid (responsive: 1→2→3→4 cols)
│   │       └── ReviewerCard[] — icon, name, badge, desc, focus tags, [View Prompt]
│   ├── TierSection "Specialists" (collapsible)
│   │   └── ReviewerCard[]
│   ├── TierSection "Personas" (collapsible)
│   │   └── ReviewerCard[] — includes known_for line
│   └── TierSection "Custom" (only if custom reviewers exist)
│       └── ReviewerCard[]
│
├── PromptViewerSheet (side panel overlay)
│   ├── Reviewer header (icon + name + tier + description)
│   ├── Rendered markdown body (full .md content)
│   └── Close button
│
├── CreateReviewerDialog (modal overlay)
│   ├── Name input (auto-generates slug preview)
│   ├── Description textarea ("What should this reviewer focus on?")
│   ├── Tier selector (optional, defaults to "specialist")
│   ├── [Create] button → runs create-reviewer AI command
│   └── Inline output area (shows command progress)
│
└── EmptyState (when no reviewers-meta.json)
    └── "Run ocr init or /ocr:sync-reviewers to get started"
```

## New API Endpoint

### `GET /api/reviewers/:id/prompt`

Returns the raw markdown content of a reviewer's prompt file.

**Response** (200):
```json
{
  "id": "architect",
  "content": "# Software Architect Reviewer\n\nYou are a..."
}
```

**Response** (404):
```json
{
  "error": "Reviewer not found",
  "id": "unknown"
}
```

**Implementation**: Reads `.ocr/skills/references/reviewers/{id}.md`. The `:id` param is validated to prevent path traversal (alphanumeric + hyphens only).

## AI Command: `create-reviewer`

### Input format

The dashboard sends:
```
create-reviewer {name} --focus "{description}"
```

Examples:
```
create-reviewer rust-safety --focus "Memory safety, ownership patterns, lifetime management, unsafe block auditing"
create-reviewer api-design --focus "REST API design, backwards compatibility, versioning, error response consistency"
```

### AI workflow

1. Validate the name isn't already taken (check if `.md` file exists)
2. Read the reviewer template from `.ocr/skills/assets/reviewer-template.md`
3. Read 2-3 existing reviewer files as style exemplars
4. Generate a new reviewer `.md` file following the template structure
5. Write to `.ocr/skills/references/reviewers/{name}.md`
6. Run the sync flow: scan all reviewers → build JSON → pipe to `ocr reviewers sync --stdin`
7. Report success with the new reviewer's details

### Command whitelist addition

Add `create-reviewer` and `sync-reviewers` to the `AI_COMMANDS` set in `command-runner.ts`.

## Navigation

Add a "Team" entry to the sidebar `NAV_ITEMS` between "Commands" and "Sessions":

```typescript
{ to: '/reviewers', label: 'Team', icon: Users }
```

Using "Team" as the label (rather than "Reviewers") because it's shorter, fits the sidebar width, and reinforces the mental model of building a review team.

## Markdown Rendering

The prompt viewer needs to render reviewer markdown. Options:
- **react-markdown** — lightweight, already common in React apps
- **@mdx-js/mdx** — overkill for read-only rendering

Recommendation: Use `react-markdown` with `remark-gfm` for GitHub-flavored markdown (tables, strikethrough). If the dashboard already has a markdown renderer for review outputs, reuse that instead.

## Socket.IO Events

No new events needed. The existing `reviewers:updated` event (emitted when `reviewers-meta.json` changes) and `command:*` events (for execution tracking) cover all real-time needs.

## Search

The page header includes a search input that filters reviewers client-side across `name`, `description`, `focus_areas`, and `known_for` fields — identical to the search in `ReviewerDialog`. Extract the search logic into a shared utility.

## Error States

| Scenario | Behavior |
|---|---|
| No `reviewers-meta.json` | Empty state with "Run `ocr init`" prompt |
| AI CLI unavailable | Sync/Create buttons disabled with tooltip explaining why |
| Create fails (duplicate) | AI command reports error; dashboard shows in output area |
| Prompt file missing | 404 from endpoint; viewer shows "Prompt file not found" message |
