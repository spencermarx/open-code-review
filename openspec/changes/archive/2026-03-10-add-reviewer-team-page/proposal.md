# add-reviewer-team-page — Proposal

## Motivation

Reviewer personas are a core OCR concept, yet they have no dedicated home in the dashboard. Users currently manage reviewers by editing markdown files in `.ocr/skills/references/reviewers/`, running `/ocr:sync-reviewers` from their IDE, and configuring `config.yaml` by hand. The reviewer selection in the Command Center only shows the _result_ of that setup — it doesn't help users discover, understand, create, or manage their review team.

A dedicated **Reviewer Team** page in the dashboard gives users a single place to:

1. **Browse & understand** — See all available reviewers at a glance, grouped by tier, with rendered descriptions, focus areas, and (for personas) their known philosophies.
2. **Read prompts** — Inspect the full system prompt for any reviewer without leaving the dashboard.
3. **Create new reviewers** — Describe what they want in natural language; an AI command generates the markdown file using the standard template.
4. **Sync metadata** — Trigger `/ocr:sync-reviewers` from the dashboard so the reviewer catalog stays current after manual edits.
5. **See changes instantly** — The existing `reviewers:updated` Socket.IO event means the page live-refreshes after any creation or sync operation.

## Capabilities

### 1. Reviewer Team Page (dashboard)

A new `/reviewers` route with a sidebar nav entry. Displays all reviewers from `reviewers-meta.json` in a tier-grouped card grid. Each card shows icon, name, tier badge, description, and focus area tags. Selecting a card opens an inline detail panel or modal with the full rendered markdown prompt. Header actions: "Sync Reviewers" and "Create Reviewer" buttons.

**Spec delta**: `reviewer-team-page`

### 2. Dashboard Reviewer Creation

A "Create Reviewer" flow triggered from the Team page. Opens a dialog where the user provides a name and a natural language description of the reviewer they want. The dashboard invokes the new `create-reviewer` AI command via the existing Socket.IO command execution pipeline. The AI generates the markdown file and automatically runs the sync flow, causing the dashboard to live-update.

**Spec delta**: `dashboard-reviewer-creation`

### 3. Create Reviewer AI Skill

A new `/ocr:create-reviewer` AI command (`.ocr/commands/create-reviewer.md`). Accepts a reviewer name and focus description. Reads the reviewer template, generates a well-structured reviewer markdown file, writes it to `.ocr/skills/references/reviewers/{id}.md`, and then invokes `ocr reviewers sync --stdin` to update the metadata. The AI skill handles tier classification, icon suggestion, and duplicate prevention.

**Spec delta**: `create-reviewer-skill`

## Design Decisions

### Page placement

The Reviewer Team page lives at `/reviewers` as a top-level sidebar item (using the `Users` Lucide icon). Reviewers are a foundational concept — they deserve first-class navigation rather than being buried in settings or the command palette.

### Prompt viewing

Each reviewer card has a "View Prompt" action that opens a sheet/modal rendering the full markdown content. This reads the actual `.md` file via a new `GET /api/reviewers/:id/prompt` endpoint rather than embedding prompt text in `reviewers-meta.json` (which should stay lean for fast serialization).

### Creation via AI command (not form)

Rather than building a complex multi-step form to generate reviewer markdown, we delegate to an AI command. This is consistent with how OCR works — AI does the heavy authoring, the CLI does structured data writes. The dashboard just needs to collect a name + description and pass them as arguments. The AI handles template adherence, focus area structuring, and all the nuanced prompt engineering.

### Auto-sync after creation

The `create-reviewer` AI command ends by calling the sync flow internally (generating and piping JSON to `ocr reviewers sync --stdin`). This means the dashboard sees the new reviewer appear automatically — no manual sync step required.

### Sync button as escape hatch

The "Sync Reviewers" button on the page triggers the existing `sync-reviewers` AI command. This covers cases where users edited markdown files manually outside the dashboard, or the auto-sync didn't fire.

## Out of Scope

- **Editing existing reviewers from the dashboard** — The existing `/ocr:edit-reviewer` spec covers this via AI command in the IDE. Dashboard editing can be a follow-up.
- **Deleting reviewers from the dashboard** — Deletion is a destructive action better handled via file system / IDE. Can follow later.
- **Drag-and-drop team ordering** — Nice-to-have but unnecessary for the initial implementation.
- **Config.yaml default_team editing** — The Command Center's reviewer override already covers per-run team customization. Editing persistent defaults is a config concern, not a team browsing concern.
