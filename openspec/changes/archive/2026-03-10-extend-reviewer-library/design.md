# extend-reviewer-library — Design

## System Architecture

This change touches three systems that communicate through a structured JSON file (`reviewers-meta.json`):

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   AI Agent       │     │   CLI            │     │   Dashboard      │
│                  │     │                  │     │                  │
│ /ocr:sync-       │────▶│ ocr reviewers    │────▶│ GET /api/        │
│   reviewers      │stdin│   sync --stdin   │file │   reviewers      │
│                  │     │                  │     │                  │
│ Reads .md files  │     │ Validates +      │     │ Reads meta.json  │
│ Reads config.yaml│     │ writes meta.json │     │ Renders UI       │
│ Builds payload   │     │ Emits socket.io  │     │ Listens socket.io│
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

### Data Flow: Sync

1. User runs `/ocr:sync-reviewers`
2. AI agent reads all `.md` files from `.ocr/skills/references/reviewers/`
3. AI agent reads `.ocr/config.yaml` → extracts `default_team` keys
4. AI builds a `ReviewersMeta` JSON object
5. AI pipes JSON to `ocr reviewers sync --stdin`
6. CLI validates schema, writes `.ocr/reviewers-meta.json` atomically
7. CLI prints confirmation
8. If dashboard is running, filesystem watcher detects change → emits `reviewers:updated` socket event
9. Dashboard re-fetches `/api/reviewers` → UI updates

### Data Flow: Review with Custom Team

1. User opens dashboard → command palette → Review
2. Dashboard reads `/api/reviewers` → populates reviewer selection UI
3. User selects/deselects reviewers in the dialog
4. Form generates `--team principal:2,martin-fowler:1,frontend:1`
5. Dashboard sends command to AI CLI adapter
6. AI skill (`/ocr:review`) parses `--team` flag
7. Review orchestrator spawns only the specified reviewers

### Data Flow: Default (no override)

1. User clicks "Run Review" without touching reviewer selection
2. No `--team` flag is appended (defaults are used)
3. AI skill reads `config.yaml` `default_team` as usual
4. No change to existing behavior

## Reviewer File Taxonomy

### Tier Classification

Each reviewer belongs to exactly one tier, determined by filename convention and/or frontmatter:

| Tier | Directory Convention | Characteristics |
|------|---------------------|-----------------|
| `holistic` | No prefix | Reviews everything from a leadership lens |
| `specialist` | No prefix | Reviews everything, weights toward specialty |
| `persona` | Named after person | Channels a specific philosophy |
| `custom` | User-created | Anything not shipped with OCR |

Built-in vs. custom is determined by whether the file ships with the OCR install (`is_builtin: true`) vs. was created by the user.

### Famous Persona Markdown Format

Famous persona files add a structured header section that the sync agent extracts:

```markdown
# Martin Fowler — Reviewer

> **Known for**: Refactoring: Improving the Design of Existing Code
>
> **Philosophy**: Good code is code that is easy to change. Refactoring is not
> rewriting — it's a series of small, behavior-preserving transformations that
> steadily improve design quality.

You are reviewing code through the lens of **Martin Fowler**...
```

The blockquote header is the canonical source for `known_for` and `philosophy` fields in `reviewers-meta.json`. Standard reviewers (holistic/specialist) omit this section.

## Dashboard UI Architecture

### Component Hierarchy

```
CommandPalette
├── [existing fields: Target, Requirements, Fresh]
├── ReviewerDefaults          ← NEW: inline chip row
│   ├── ReviewerChip (×N)    ← removable badges for default_team
│   └── CustomizeButton      ← opens dialog
└── ReviewerDialog            ← NEW: modal overlay
    ├── SearchInput
    ├── TierSection ("Generalists")
    │   └── ReviewerCard (×N)
    │       ├── Icon + Name + TierBadge
    │       ├── Description
    │       ├── HelpPopover (?)
    │       │   ├── Full description
    │       │   ├── Known for / Philosophy (personas only)
    │       │   └── FocusAreaTags
    │       ├── SelectionCheckbox
    │       └── RedundancyStepper (when selected)
    ├── TierSection ("Specialists")
    ├── TierSection ("Famous Engineers")
    ├── TierSection ("Custom")
    └── DialogFooter (Apply / Cancel)
```

### State Management

The reviewer selection state lives in `CommandPalette` as:

```typescript
type ReviewerSelection = {
  id: string
  count: number // redundancy
}

// State: null means "use defaults", [] means "explicitly none"
const [teamOverride, setTeamOverride] = useState<ReviewerSelection[] | null>(null)
```

- `null` → default team (from meta.json `is_default` entries) → no `--team` flag
- Non-null → explicit selection → `--team` flag with exact entries

### API Endpoints

**`GET /api/reviewers`** — Returns `reviewers-meta.json` contents (or empty default if file doesn't exist):

```typescript
// Response
{
  reviewers: ReviewerMeta[]
  defaults: string[]  // IDs of default_team reviewers
}
```

**No write endpoint** — meta.json is only written by the CLI `reviewers sync` command.

### Socket.IO Events

| Event | Direction | Payload | Trigger |
|-------|-----------|---------|---------|
| `reviewers:updated` | server → client | `{ reviewers: ReviewerMeta[] }` | `reviewers-meta.json` changed |

## CLI Subcommand Design

### `ocr reviewers sync --stdin`

**Internal-only**: This command is designed to be called by AI agents, not directly by users. It follows the same pattern as `ocr state round-complete --stdin`.

```bash
echo '{"schema_version":1,...}' | ocr reviewers sync --stdin
```

**Validation rules:**
- `schema_version` must be `1`
- Each reviewer must have: `id`, `name`, `tier`, `description`
- `tier` must be one of: `holistic`, `specialist`, `persona`, `custom`
- `id` must be a valid filename slug (lowercase, hyphens, no spaces)
- Duplicate `id` values are rejected

**Atomic write**: Write to `.ocr/reviewers-meta.json.tmp` then `rename()` to prevent partial reads.

### `ocr reviewers list`

Existing `/ocr:reviewers` command is already specified. This change does not modify it — it reads from the `.md` files directly (AI-powered). The `reviewers-meta.json` is solely for dashboard consumption.

## Reviewer Template File Sizes

To keep reviewer markdown files focused and consistent:

- **Standard roles** (holistic/specialist): ~40-60 lines (matching current principal.md at 52 lines)
- **Famous personas**: ~50-70 lines (adds the blockquote header, ~5 extra lines)
- **Custom**: No size constraint (user-created)

## Icon Mapping

Complete Lucide icon assignments for built-in reviewers:

| Reviewer | Icon | Rationale |
|----------|------|-----------|
| **Holistic** | | |
| architect | `blocks` | System building blocks |
| principal-fullstack | `layers` | Full-stack layers |
| principal-quality | `shield-check` | Quality assurance |
| staff-engineer | `compass` | Technical direction |
| **Specialist** | | |
| frontend | `layout` | UI layout |
| backend | `server` | Server-side |
| infrastructure | `cloud` | Cloud/infra |
| performance | `gauge` | Performance metrics |
| accessibility | `accessibility` | Built-in Lucide icon |
| data | `database` | Data storage |
| devops | `rocket` | Deployment |
| dx | `terminal` | Developer tools |
| mobile | `smartphone` | Mobile devices |
| **Existing** | | |
| principal | `crown` | Leadership |
| quality | `sparkles` | Code quality (existing dashboard icon) |
| security | `shield-alert` | Security (existing dashboard icon) |
| testing | `test-tubes` | Testing |
| **Persona** | | |
| (all) | `brain` | Thought leadership |
| **Custom** | | |
| (all) | `user` | User-defined |

## Migration & Backwards Compatibility

- **No breaking changes**: `default_team` in `config.yaml` continues to work exactly as before
- **No auto-sync required**: If `reviewers-meta.json` doesn't exist, the dashboard shows a minimal "Run /ocr:sync-reviewers to enable reviewer selection" prompt in the command form
- **Init flow**: `ocr init` will be updated to run an initial sync as part of setup, pre-populating `reviewers-meta.json` for new installations
- **Existing custom reviewers**: Users who already created custom `.md` files just need to run `/ocr:sync-reviewers` once to make them visible in the dashboard
