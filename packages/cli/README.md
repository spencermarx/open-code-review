# @open-code-review/cli

The command-line interface for Open Code Review. Handles multi-tool setup, real-time progress tracking, environment health checks, and a web dashboard for browsing review sessions.

## Why Use the CLI?

1. **Multi-tool configuration**: If you use multiple AI assistants (Claude Code, Cursor, Windsurf, and 11 more), the CLI configures all of them with a single command.

2. **Progress visibility**: AI-powered reviews take time. The `ocr progress` command shows what's happening in real-time.

3. **Environment health**: The `ocr doctor` command verifies your dependencies and OCR installation before you run a review.

4. **Dashboard**: The `ocr dashboard` command starts a local web interface for browsing sessions, reviews, and maps.

> **Recommended:** Use `ocr dashboard` to launch the web interface for running commands, browsing reviews, triaging findings, and posting to GitHub — all from your browser. See the [Dashboard docs](../dashboard/README.md) for details.

## Installation

```bash
# Global install
npm install -g @open-code-review/cli

# Or via pnpm
pnpm add -g @open-code-review/cli

# Or run directly
npx @open-code-review/cli init
```

## Commands

### `ocr init`

Initialize Open Code Review in your project.

```bash
# Interactive mode
ocr init

# Non-interactive
ocr init --tools claude,windsurf,cursor

# Configure all detected tools
ocr init --tools all
```

**What it does:**

1. Creates `.ocr/` directory with skills, commands, and config
2. Detects installed AI tools
3. Configures each tool appropriately
4. Optionally injects OCR instructions into `AGENTS.md` / `CLAUDE.md`

### `ocr progress`

Watch a review session in real-time.

```bash
# Auto-detect current session
ocr progress

# Watch a specific session
ocr progress --session 2026-01-26-feature-auth
```

Shows: current phase, elapsed time, reviewer status, finding counts, completion percentage, and **current round**.

**Multi-round support**: The progress display shows which round is active and tracks completion across rounds. When a round completes, running `/ocr-review` again starts a new round (`round-2/`, `round-3/`, etc.).

### `ocr update`

Update OCR skills and commands to the latest version after upgrading the package.

```bash
# Update everything
ocr update

# Preview changes first
ocr update --dry-run

# Update specific components
ocr update --commands    # Commands only
ocr update --skills      # Skills and references only
ocr update --inject      # AGENTS.md/CLAUDE.md only
```

**What it does:**

1. Detects which AI tools you configured during `ocr init`
2. Updates `.ocr/skills/` (SKILL.md, workflow, discourse rules)
3. Updates tool-specific commands (`.windsurf/workflows/`, etc.)
4. Updates managed blocks in `AGENTS.md` / `CLAUDE.md`

**What is NOT modified:**

- `.ocr/config.yaml` — Your team composition and context are preserved
- `.ocr/skills/references/reviewers/` — All reviewers preserved (default and custom)
- `.ocr/sessions/` — Review history remains untouched

### `ocr doctor`

Check your OCR installation and verify all dependencies.

```bash
ocr doctor
```

**What it checks:**

- **Environment**: `git`, `claude` (Claude Code), and `gh` (GitHub CLI) are in PATH, with version detection
- **OCR installation**: `.ocr/skills/`, `.ocr/sessions/`, `.ocr/config.yaml`, `.ocr/data/ocr.db`

Exits with code `0` when healthy, `1` when required dependencies are missing or OCR is not initialized.

### `ocr dashboard`

Start the OCR dashboard web interface for browsing sessions, reviews, maps, and posting reviews to GitHub. The dashboard is bundled with the CLI — no separate installation required.

```bash
# Start on default port
ocr dashboard

# Custom port
ocr dashboard --port 8080

# Don't auto-open browser
ocr dashboard --no-open
```

Requires OCR to be initialized (`.ocr/` must exist). The dashboard reads from the same SQLite database and session files used by the review workflow.

**Key capabilities:** session browser, review triage, Code Review Map navigation with dependency graphs, Command Center for launching reviews/maps, AI-powered chat, posting to GitHub with human review translation, and address feedback tooling. See the [Dashboard README](../dashboard/README.md) for full details.

### `ocr state`

Manage OCR session state. This is an internal command used by the review workflow to track phase transitions.

```bash
ocr state show                    # Show current session state
ocr state show --json             # Output as JSON
ocr state sync                    # Rebuild state from filesystem
```

Subcommands: `init`, `transition`, `close`, `show`, `sync`.

## Session Storage

The CLI reads session state from `.ocr/sessions/{date}-{branch}/`:

```
.ocr/sessions/2026-01-26-feature-auth/
├── state.json              # Workflow state (read by progress command)
└── rounds/
    ├── round-1/
    │   ├── reviews/*.md    # Individual reviewer outputs
    │   ├── discourse.md
    │   └── final.md        # Completion indicator
    └── round-2/            # Additional rounds if re-reviewed
```

The CLI derives round information from the filesystem:
- **Round count**: Enumerated from `rounds/round-*/` directories
- **Round completion**: Determined by `final.md` presence
- **Reviewer progress**: Listed from `rounds/round-{n}/reviews/*.md`

## Supported AI Tools

| Tool | Config Directory |
|------|------------------|
| Amazon Q Developer | `.aws/amazonq/` |
| Augment (Auggie) | `.augment/` |
| Claude Code | `.claude/` |
| Cline | `.cline/` |
| Codex | `.codex/` |
| Continue | `.continue/` |
| Cursor | `.cursor/` |
| Gemini CLI | `.gemini/` |
| GitHub Copilot | `.github/` |
| Kilo Code | `.kilocode/` |
| OpenCode | `.opencode/` |
| Qoder | `.qoder/` |
| RooCode | `.roo/` |
| Windsurf | `.windsurf/` |

## After Installation

Use OCR through your AI assistant:

```
/ocr-review                     # Start a code review
/ocr-review against spec.md     # Review against a spec file
/ocr-map                        # Generate a Code Review Map for large changesets
/ocr-doctor                     # Verify setup
```

For Claude Code / Cursor, use `/ocr:review`, `/ocr:map`, `/ocr:doctor`, etc.

See the [main README](https://github.com/spencermarx/open-code-review) for full documentation.

## License

Apache-2.0
