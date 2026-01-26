# @open-code-review/agents

The core skill definitions, reviewer personas, and workflow references for Open Code Review.

## What This Package Contains

This package provides the AI-readable assets that power multi-agent code review:

```
agents/
├── skills/ocr/           # The OCR skill
│   ├── SKILL.md          # Tech Lead orchestration logic
│   ├── references/
│   │   ├── workflow.md   # 8-phase review workflow
│   │   ├── discourse.md  # Multi-agent debate rules
│   │   ├── synthesis.md  # Finding aggregation guide
│   │   └── reviewers/    # Persona definitions
│   │       ├── principal.md
│   │       ├── quality.md
│   │       ├── security.md
│   │       └── testing.md
│   └── assets/
│       ├── config.yaml   # Default configuration
│       └── reviewer-template.md
├── commands/             # Slash command definitions
│   ├── review.md
│   ├── doctor.md
│   ├── history.md
│   ├── show.md
│   ├── reviewers.md
│   └── post.md
└── .claude-plugin/       # Claude Code plugin manifest
    └── plugin.json
```

## Installation

### Via CLI (Recommended)

The CLI copies these assets to your project's `.ocr/` directory and configures your AI tools:

```bash
npx @open-code-review/cli init
```

### Via Claude Code Plugin

For Claude Code users who prefer plugin-based installation:

```bash
# Add the marketplace
/plugin marketplace add spencermarx/open-code-review

# Install the plugin
/plugin install open-code-review@spencermarx-open-code-review
```

### Local Development

Test the plugin locally with Claude Code:

```bash
claude --plugin-dir ./packages/agents
```

## Skill Architecture

The `skills/ocr/SKILL.md` file defines the **Tech Lead** role—the orchestrator that:

1. Discovers project context (config, OpenSpec, reference files)
2. Analyzes changes and identifies risk areas
3. Selects and spawns reviewer personas
4. Facilitates discourse between reviewers
5. Synthesizes findings into a unified review

Each reviewer in `references/reviewers/` is a specialized persona with distinct focus areas and anti-patterns to flag.

## Commands

| File | CLI Command | Plugin Command |
|------|-------------|----------------|
| `review.md` | `/ocr-review` | `/open-code-review:review` |
| `doctor.md` | `/ocr-doctor` | `/open-code-review:doctor` |
| `reviewers.md` | `/ocr-reviewers` | `/open-code-review:reviewers` |
| `history.md` | `/ocr-history` | `/open-code-review:history` |
| `show.md` | `/ocr-show` | `/open-code-review:show` |
| `post.md` | `/ocr-post` | `/open-code-review:post` |

## License

Apache-2.0
