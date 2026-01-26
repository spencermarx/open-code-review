# @open-code-review/cli

The command-line interface for Open Code Review. Handles multi-tool setup and provides real-time progress tracking for review sessions.

## Why Use the CLI?

The CLI solves two problems:

1. **Multi-tool configuration**: If you use multiple AI assistants (Claude Code, Cursor, Windsurf), the CLI configures all of them with a single command—no manual copying of files between tool-specific directories.

2. **Progress visibility**: AI-powered reviews take time. The `ocr progress` command shows what's happening in real-time, so you're not staring at a blank screen wondering if anything is working.

## Installation

```bash
# Global install (recommended)
npm install -g @open-code-review/cli

# Or via pnpm
pnpm add -g @open-code-review/cli

# Or run directly without installing
npx @open-code-review/cli init
```

## Commands

### `ocr init`

Initialize Open Code Review in your project.

```bash
# Interactive mode — select which AI tools to configure
ocr init

# Non-interactive — specify tools directly
ocr init --tools claude,windsurf,cursor

# Configure all detected tools
ocr init --tools all
```

**What it does:**

1. Creates `.ocr/` directory with skills, commands, and default config
2. Detects installed AI tools (Claude Code, Cursor, Windsurf, etc.)
3. Configures each tool with appropriate symlinks or copies
4. Optionally injects OCR instructions into `AGENTS.md` / `CLAUDE.md`

### `ocr progress`

Watch a review session in real-time.

```bash
# Auto-detect the current session
ocr progress

# Watch a specific session
ocr progress --session 2026-01-26-feature-auth
```

The progress display shows:

- Current phase and elapsed time
- Individual reviewer status
- Finding counts as they're discovered
- Overall completion percentage

## Supported AI Tools

| Tool | Config Directory | Detection |
|------|------------------|-----------|
| Claude Code | `.claude/` | Auto-detected |
| Windsurf | `.windsurf/` | Auto-detected |
| Cursor | `.cursor/` | Auto-detected |
| GitHub Copilot | `.github/` | Auto-detected |
| Cline | `.cline/` | Auto-detected |
| Continue | `.continue/` | Auto-detected |

The CLI detects which tools you have configured and offers to set up OCR for each.

## After Installation

Once initialized, use OCR through your AI assistant:

```
/ocr-review              # Start a code review
/ocr-doctor              # Verify setup
/ocr-history             # View past sessions
```

See the [main README](https://github.com/spencermarx/open-code-review) for full usage documentation.

## License

Apache-2.0
