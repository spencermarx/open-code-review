# @open-code-review/cli

CLI for Open Code Review - Multi-environment setup and progress tracking.

## Installation

```bash
# Via npx (no install)
npx @open-code-review/cli init

# Via pnpm dlx
pnpm dlx @open-code-review/cli init

# Global install
npm install -g @open-code-review/cli
ocr init
```

## Commands

### `ocr init`

Set up OCR for your AI coding environments.

```bash
# Interactive mode - select tools via checkbox
ocr init

# Non-interactive - specify tools
ocr init --tools claude,windsurf,cursor

# Install for all supported tools
ocr init --tools all

# Skip AGENTS.md/CLAUDE.md injection
ocr init --no-inject
```

### `ocr progress`

Watch real-time progress of an active code review session.

```bash
# Auto-detect current session
ocr progress

# Specify session
ocr progress --session 2025-01-26-feature-auth
```

## Supported AI Tools

| Tool | Config Directory |
|------|------------------|
| Claude Code | `.claude/` |
| Windsurf | `.windsurf/` |
| Cursor | `.cursor/` |
| GitHub Copilot | `.github/` |
| Cline | `.cline/` |
| Continue | `.continue/` |
| And more... | See `ocr init --help` |

## License

Apache-2.0
