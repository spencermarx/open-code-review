# extend-reviewer-library

## Summary

Expand OCR's reviewer system from 4 built-in personas to a comprehensive library of 20+ template reviewers spanning three tiers — **holistic generalists**, **domain specialists**, and **famous engineer personas** — with a modern dashboard UI for reviewer selection/override on the review command form, and a `sync-reviewers` flow that bridges custom user-created roles into the dashboard via a `reviewers-meta.json` file written by the CLI.

## Motivation

The current reviewer set (principal, quality, security, testing) covers foundational concerns but misses the depth and breadth that real engineering teams bring. Senior engineers don't just review "code quality" — they review through distinct lenses: performance, accessibility, API design, DX, domain correctness. The best reviews come from people with strong, opinionated philosophies about how software should be built.

By offering reviewers modeled after famous engineers (Martin Fowler on refactoring, John Ousterhout on complexity, Kent Beck on simplicity), users get reviews that channel specific, well-known schools of thought — not generic checklists.

The dashboard currently has no way to select or override reviewers when launching a review. Users must edit `config.yaml` manually. This proposal adds a first-class reviewer selection experience directly in the command form.

## Scope

### Capability 1: Reviewer Library (new template reviewers)

**Three tiers of reviewer personas:**

1. **Holistic Generalists** — Senior/Principal-level roles that review everything through a specific leadership lens:
   - `architect` — Software Architect (system boundaries, contracts, evolutionary architecture)
   - `principal-fullstack` — Principal Full-Stack Engineer (end-to-end coherence, vertical slice quality)
   - `principal-quality` — Principal Quality Engineer (systemic quality, process, reliability)
   - `staff-engineer` — Staff Engineer (cross-team impact, technical strategy, mentoring tone)

2. **Domain Specialists** — Review everything but weight findings toward their specialty:
   - `frontend` — Principal Frontend Engineer (component design, state management, rendering, a11y)
   - `backend` — Principal Backend Engineer (API design, data modeling, concurrency, observability)
   - `infrastructure` — Principal Infrastructure Engineer (deployment, scaling, resource efficiency)
   - `performance` — Principal Performance Engineer (profiling, bottlenecks, algorithmic complexity)
   - `accessibility` — Principal Accessibility Engineer (WCAG, screen readers, keyboard nav, contrast)
   - `data` — Principal Data Engineer (schemas, migrations, query efficiency, data integrity)
   - `devops` — Principal DevOps Engineer (CI/CD, IaC, rollback safety, monitoring)
   - `dx` — Principal DX Engineer (API ergonomics, error messages, developer productivity)
   - `mobile` — Principal Mobile Engineer (platform conventions, offline, battery, responsiveness)

3. **Famous Engineer Personas** — Review through a specific philosophy:
   - `martin-fowler` — **Martin Fowler**: Refactoring, evolutionary design, code smells
   - `kent-beck` — **Kent Beck**: Simplicity, TDD, "make it work, make it right, make it fast"
   - `john-ousterhout` — **John Ousterhout**: Deep modules, complexity management (A Philosophy of Software Design)
   - `anders-hejlsberg` — **Anders Hejlsberg**: Type system design, language ergonomics, developer experience
   - `vladimir-khorikov` — **Vladimir Khorikov**: Domain-driven testing, unit test value, functional architecture
   - `kent-dodds` — **Kent Dodds**: Testing trophy, implementation-detail-free tests, user-centric testing
   - `tanner-linsley` — **Tanner Linsley**: Headless UI patterns, composability, framework-agnostic design
   - `kamil-mysliwiec` — **Kamil Myśliwiec**: Modular architecture, dependency injection, progressive framework design (NestJS)
   - `sandi-metz` — **Sandi Metz**: Practical OO, SOLID principles, cost of change, "99 Bottles" refactoring
   - `rich-hickey` — **Rich Hickey**: Simplicity vs. easiness, immutability, value-oriented programming

Each famous persona markdown includes:
- A frontmatter-style header: **Known for** (one-liner) and **Core philosophy** (2-3 sentences)
- Review approach grounded in their published works/talks
- These same strings populate the dashboard popover help

### Capability 2: Reviewer Sync (`/ocr:sync-reviewers` + CLI command)

A two-part flow that bridges the filesystem (reviewer `.md` files) to the dashboard (structured JSON):

1. **AI Skill** (`/ocr:sync-reviewers`): An agentic command that:
   - Scans `.ocr/skills/references/reviewers/` for all `.md` files
   - Reads `config.yaml` to identify the `default_team`
   - For each reviewer, extracts: name, display name, tier (holistic/specialist/persona/custom), brief description, focus areas
   - Calls the CLI internal command with the structured payload

2. **CLI Command** (`ocr reviewers sync --stdin`): An internal-only subcommand that:
   - Accepts a JSON payload on stdin describing all discovered reviewers
   - Validates the schema
   - Writes `.ocr/reviewers-meta.json` atomically
   - Emits a Socket.IO event (`reviewers:updated`) so the dashboard live-refreshes

**`reviewers-meta.json` schema:**

```json
{
  "schema_version": 1,
  "generated_at": "2026-03-10T12:00:00Z",
  "reviewers": [
    {
      "id": "martin-fowler",
      "name": "Martin Fowler",
      "tier": "persona",
      "icon": "brain",
      "description": "Refactoring, evolutionary design, code smells",
      "known_for": "Refactoring: Improving the Design of Existing Code",
      "philosophy": "Good code is code that is easy to change. Refactoring is not rewriting — it's a series of small, behavior-preserving transformations.",
      "focus_areas": ["refactoring", "code smells", "evolutionary design", "patterns"],
      "is_default": false,
      "is_builtin": true
    }
  ]
}
```

`icon` uses Lucide icon names for built-in reviewers (matching the dashboard's existing Lucide usage). Custom reviewers default to `"user"`.

### Capability 3: Dashboard Reviewer Selection UI

Extends the command palette's Review form with reviewer selection:

**A. Default Reviewers Section (inline in form)**
- Shows the `default_team` reviewers as a row of compact, removable chips/badges directly in the Review command form
- Each chip shows: icon + short name + instance count badge (e.g., "Principal ×2")
- Chips are removable (click ×) to exclude a default reviewer from this run
- A "Customize..." button opens the full selection dialog

**B. Reviewer Selection Dialog (modal)**
- Triggered by "Customize..." button
- **Layout**: Full-width dialog with a search input at top, scrollable reviewer grid below
- **Search**: Filters by name, tier, description, focus areas — instant, client-side
- **Tier Sections**: Grouped by tier with collapsible headers: "Generalists", "Specialists", "Famous Engineers", "Custom"
- **Reviewer Cards**: Each card shows:
  - Lucide icon (left)
  - Name + tier badge (top)
  - One-line description (below name)
  - Help button (?) that opens a popover with:
    - Full description
    - For famous personas: "Known for" + "Philosophy" quote
    - Focus areas as tags
  - Checkbox for selection (multi-select)
  - Redundancy stepper (1-3) — only visible when selected
- **Footer**: "Apply" saves selection back to the command form, "Cancel" discards

**C. Command String Generation**
- Selected reviewers are serialized as `--team principal:2,security:1,martin-fowler:1`
- The AI skill (`/ocr:review`) parses this to override `default_team`
- When team matches `default_team` exactly, the flag is omitted (clean default)

## Design Decisions

### Why Lucide icons (not emoji)?

The dashboard already uses Lucide throughout (Play, ShieldAlert, Sparkles in the command palette alone). Lucide gives consistent sizing, dark-mode support, and professional aesthetics. Each tier gets a signature icon treatment:
- Holistic: `crown` (leadership perspective)
- Specialist: domain-specific (e.g., `layout` for frontend, `server` for backend, `gauge` for performance)
- Famous: `brain` (thought leadership)
- Custom: `user`

### Why `reviewers-meta.json` instead of reading YAML + markdown on the server?

1. **Follows established pattern**: `round-meta.json` and `map-meta.json` are already written by the CLI as structured snapshots for the dashboard to consume. This is the same pattern.
2. **Performance**: The dashboard reads one JSON file instead of parsing N markdown files + YAML.
3. **Decoupled**: The AI agent does the heavy lifting of understanding markdown reviewer files; the CLI/dashboard just consume structured data.
4. **Custom reviewer support**: When users add custom `.md` files, they run `/ocr:sync-reviewers` and the AI agent intelligently extracts metadata — no fragile regex parsing needed.

### Why a separate `/ocr:sync-reviewers` command (not auto-sync)?

1. **Explicit > implicit**: Users control when metadata is regenerated — no surprise behavior.
2. **AI-powered extraction**: The sync reads and summarizes markdown files. This is an AI task, not a CLI task. Running it automatically on every dashboard load would be wasteful.
3. **Idempotent**: Running sync multiple times is safe; it overwrites the same file.
4. **Escape hatch**: If the AI misinterprets a custom reviewer, the user can edit the markdown and re-sync.

### Why `--team` flag (not `--reviewers`)?

The existing concept is `default_team` in config.yaml. Using `--team` maintains the team metaphor and feels natural: "I'm assembling a review team for this PR."

## Out of Scope

- **Marketplace/sharing**: Publishing or importing reviewer templates across projects
- **Per-file reviewer routing**: Assigning specific reviewers to specific files/paths
- **AI-generated reviewer suggestions**: Auto-recommending reviewers based on the diff content (great future feature)
- **Reviewer performance analytics**: Tracking which reviewers find the most valuable findings over time

## Dependencies

- `reviewer-management` spec (existing) — this proposal extends it
- `dashboard` spec (existing) — adds reviewer selection UI to command palette
- `slash-commands` spec (existing) — adds `/ocr:sync-reviewers` command
- `cli` spec (existing) — adds `ocr reviewers sync` internal subcommand
