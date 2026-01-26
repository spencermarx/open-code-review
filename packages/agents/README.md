# @open-code-review/agents

AI-native skills, commands, and reviewer personas for Open Code Review.

## Overview

This package contains static assets for AI-powered code review:

- **Skills** (`skills/ocr/`) - Core skill definitions and workflow references
- **Commands** (`commands/`) - Slash command definitions for AI tools

## Installation

### Option 1: CLI (Multi-Tool Support)

Works with Claude Code, Cursor, Windsurf, and 10+ other AI tools:

```bash
npx @open-code-review/cli init
```

### Option 2: Claude Code Plugin

Native Claude Code integration with automatic updates:

```bash
# Add the marketplace
/plugin marketplace add open-code-review/open-code-review

# Install the plugin
/plugin install open-code-review
```

Or test locally:

```bash
claude --plugin-dir ./packages/agents
```

## Package Structure

```
packages/agents/
├── .claude-plugin/
│   └── plugin.json       # Claude Code plugin manifest
├── commands/             # Slash commands (→ /open-code-review:review)
│   ├── review.md
│   ├── doctor.md
│   └── ...
└── skills/
    └── ocr/              # Main OCR skill
        ├── SKILL.md      # Core Tech Lead skill
        ├── AGENTS.md     # AI assistant instructions
        ├── references/   # Workflow, reviewers, etc.
        └── assets/       # Templates, config
```

## Skills (`skills/ocr/`)

| File | Description |
|------|-------------|
| `SKILL.md` | Core Tech Lead skill definition |
| `AGENTS.md` | Instructions for AI assistants |
| `references/workflow.md` | 8-phase review workflow |
| `references/synthesis.md` | Finding synthesis guide |
| `references/discourse.md` | Multi-agent discourse rules |
| `references/reviewers/*.md` | Reviewer persona definitions |
| `assets/config.yaml` | Configuration template (installed to `.ocr/config.yaml`) |

## Commands (`commands/`)

| Command | CLI Format | Plugin Format |
|---------|------------|---------------|
| `review.md` | `/ocr:review` | `/open-code-review:review` |
| `doctor.md` | `/ocr:doctor` | `/open-code-review:doctor` |
| `reviewers.md` | `/ocr:reviewers` | `/open-code-review:reviewers` |
| `history.md` | `/ocr:history` | `/open-code-review:history` |
| `show.md` | `/ocr:show` | `/open-code-review:show` |
| `post.md` | `/ocr:post` | `/open-code-review:post` |

## License

MIT
