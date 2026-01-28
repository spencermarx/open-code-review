# @open-code-review/agents

The skill definitions, reviewer personas, and workflow references that power Open Code Review.

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
│   ├── doctor.md
│   ├── history.md
│   ├── show.md
│   ├── reviewers.md
│   └── post.md
└── .claude-plugin/          # Claude Code plugin manifest
    └── plugin.json
```

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

## Session Structure

OCR uses a **round-first architecture** for session storage:

```
.ocr/sessions/{YYYY-MM-DD}-{branch}/
├── state.json              # Workflow state (current_round, phase)
├── discovered-standards.md # Project context (shared across rounds)
├── context.md              # Change analysis (shared)
└── rounds/
    ├── round-1/
    │   ├── reviews/        # Individual reviewer outputs
    │   ├── discourse.md    # Cross-reviewer discussion
    │   └── final.md        # Synthesized review
    └── round-2/            # Created on re-review
        └── ...
```

**Multi-round reviews**: Running `/ocr-review` again on an existing session creates a new round (`round-2/`, `round-3/`, etc.) if the previous round is complete. This enables iterative "review → fix → re-review" workflows while preserving history.

See `references/session-files.md` for the complete file manifest.

## Commands

| File | Windsurf | Claude Code / Cursor |
|------|----------|----------------------|
| `review.md` | `/ocr-review` | `/ocr:review` |
| `doctor.md` | `/ocr-doctor` | `/ocr:doctor` |
| `reviewers.md` | `/ocr-reviewers` | `/ocr:reviewers` |
| `history.md` | `/ocr-history` | `/ocr:history` |
| `show.md` | `/ocr-show` | `/ocr:show` |
| `post.md` | `/ocr-post` | `/ocr:post` |

**Why two formats?** Windsurf requires flat command files with a prefix (`/ocr-command`), while Claude Code and Cursor support subdirectories (`/ocr:command`). Both invoke the same underlying functionality.

## License

Apache-2.0
