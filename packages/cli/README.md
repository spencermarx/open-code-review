# @open-code-review/cli

The command-line interface for Open Code Review. Handles multi-tool setup and provides real-time progress tracking.

## Why Use the CLI?

1. **Multi-tool configuration**: If you use multiple AI assistants (Claude Code, Cursor, Windsurf), the CLI configures all of them with a single command.

2. **Progress visibility**: AI-powered reviews take time. The `ocr progress` command shows what's happening in real-time.

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

Update OCR skills and commands to the latest version.

```bash
ocr update
```

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
| Claude Code | `.claude/` |
| Windsurf | `.windsurf/` |
| Cursor | `.cursor/` |
| GitHub Copilot | `.github/` |
| Cline | `.cline/` |
| Continue | `.continue/` |

## After Installation

Use OCR through your AI assistant:

```
/ocr-review                     # Start a code review
/ocr-review against spec.md     # Review against a spec file
/ocr-doctor                     # Verify setup
```

For Claude Code / Cursor, use `/ocr:review`, `/ocr:doctor`, etc.

See the [main README](https://github.com/spencermarx/open-code-review) for full documentation.

## License

Apache-2.0
