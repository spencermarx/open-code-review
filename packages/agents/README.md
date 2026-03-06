# @open-code-review/agents

The skill definitions, reviewer personas, and workflow references that power Open Code Review.

> Browse review output and map artifacts in the [Dashboard](../dashboard/README.md) or through your AI assistant's slash commands.

## What This Package Contains

```
agents/
├── skills/ocr/              # The OCR skill
│   ├── SKILL.md             # Tech Lead orchestration logic
│   ├── references/
│   │   ├── workflow.md        # 8-phase review workflow
│   │   ├── session-files.md   # Authoritative file manifest
│   │   ├── session-state.md   # State management
│   │   ├── discourse.md       # Multi-agent debate rules
│   │   ├── final-template.md  # Final review template
│   │   └── reviewers/         # Persona definitions (customizable)
│   │       ├── principal.md # Architecture, design patterns
│   │       ├── quality.md   # Code style, best practices
│   │       ├── security.md  # Auth, data handling, vulnerabilities
│   │       └── testing.md   # Coverage, edge cases
│   └── assets/
│       ├── config.yaml      # Default configuration
│       └── reviewer-template.md
├── commands/                # Slash command definitions
│   ├── review.md
│   ├── map.md
│   ├── doctor.md
│   ├── history.md
│   ├── show.md
│   ├── reviewers.md
│   └── post.md
└── .claude-plugin/          # Claude Code plugin manifest
    └── plugin.json
```

## Prerequisites

All OCR workflows require the CLI for session state management. Before running any review or map command, ensure the CLI is installed:

```bash
npm install -g @open-code-review/cli
ocr init
```

The CLI provides the `ocr state` commands that track workflow progress through each phase. Without it, reviews will fail at phase transitions.

## Installation

### Via CLI (Recommended)

The CLI copies these assets to your project's `.ocr/` directory:

```bash
npx @open-code-review/cli init
```

To update after a package upgrade:

```bash
ocr update
```

This updates skills and workflow references while **preserving your `.ocr/config.yaml`** and **all reviewer personas** (both default and custom).

### Via Claude Code Plugin

```bash
/plugin marketplace add spencermarx/open-code-review
/plugin install ocr@aclarify
```

## Skill Architecture

The `SKILL.md` file defines the **Tech Lead** role—the orchestrator that:

1. Discovers project context (config, OpenSpec, reference files)
2. Analyzes changes and identifies risk areas
3. Selects and spawns reviewer personas based on your team configuration
4. Facilitates discourse between reviewers
5. Synthesizes findings into a unified review

Each reviewer in `references/reviewers/` is a specialized persona. You can customize the built-in reviewers or add your own.

### Map Agent Personas

The `/ocr:map` command uses a separate set of specialized agents defined in `references/map-personas/`:

| Persona | Role |
|---------|------|
| **Map Architect** | Analyzes change topology, determines optimal section groupings and review ordering |
| **Flow Analyst** | Traces upstream/downstream dependencies, groups related changes by data and control flow |
| **Requirements Mapper** | Maps changes to requirements/specs when provided, identifies coverage gaps |

These agents run with configurable redundancy (default: 2) to increase confidence in groupings. See `.ocr/config.yaml` → `code-review-map.agents` for tuning.

## Session Structure

OCR uses a **round-first architecture** for session storage:

```
.ocr/sessions/{YYYY-MM-DD}-{branch}/
├── discovered-standards.md # Project context (shared across rounds)
├── context.md              # Change analysis (shared)
└── rounds/
    ├── round-1/
    │   ├── reviews/        # Individual reviewer outputs
    │   ├── discourse.md    # Cross-reviewer discussion
    │   └── final.md        # Synthesized review
    └── round-2/            # Created on re-review
        └── ...
├── maps/
│   ├── run-1/
│   │   ├── map.md             # Code Review Map output
│   │   └── flow-analysis.md   # Dependency graph (Mermaid)
│   └── run-2/                 # Created on re-map
│       └── ...
```

**Multi-round reviews**: Running `/ocr-review` again on an existing session creates a new round (`round-2/`, `round-3/`, etc.) if the previous round is complete. This enables iterative "review → fix → re-review" workflows while preserving history.

**Map runs**: Running `/ocr-map` creates map artifacts in `maps/run-{n}/`. Like review rounds, subsequent runs create new directories without modifying previous ones.

See `references/session-files.md` for the complete file manifest.

## Commands

| File | Windsurf | Claude Code / Cursor |
|------|----------|----------------------|
| `review.md` | `/ocr-review` | `/ocr:review` |
| `map.md` | `/ocr-map` | `/ocr:map` |
| `doctor.md` | `/ocr-doctor` | `/ocr:doctor` |
| `reviewers.md` | `/ocr-reviewers` | `/ocr:reviewers` |
| `history.md` | `/ocr-history` | `/ocr:history` |
| `show.md` | `/ocr-show` | `/ocr:show` |
| `post.md` | `/ocr-post` | `/ocr:post` |

**Why two formats?** Windsurf requires flat command files with a prefix (`/ocr-command`), while Claude Code and Cursor support subdirectories (`/ocr:command`). Both invoke the same underlying functionality.

## License

Apache-2.0
