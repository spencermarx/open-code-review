# @open-code-review/agents

Skill definitions, reviewer personas, and workflow references that power [Open Code Review](https://github.com/spencermarx/open-code-review).

## Getting Started

All OCR workflows require the CLI for session state management. Install it first:

```bash
# 1. Install the CLI
npm install -g @open-code-review/cli

# 2. Initialize in your project (copies these assets to .ocr/)
cd your-project
ocr init
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
│   │       ├── principal.md   # Architecture, design patterns
│   │       ├── quality.md     # Code style, best practices
│   │       ├── security.md    # Auth, data handling, vulnerabilities
│   │       └── testing.md     # Coverage, edge cases
│   └── assets/
│       ├── config.yaml        # Default configuration
│       └── reviewer-template.md
├── commands/                  # Slash command definitions
│   ├── review.md
│   ├── map.md
│   ├── doctor.md
│   ├── history.md
│   ├── show.md
│   ├── reviewers.md
│   ├── post.md
│   ├── address.md
│   └── translate-review-to-single-human.md
└── .claude-plugin/            # Claude Code plugin manifest
    └── plugin.json
```

## Commands

| File | Windsurf | Claude Code / Cursor |
|------|----------|----------------------|
| `review.md` | `/ocr-review` | `/ocr:review` |
| `map.md` | `/ocr-map` | `/ocr:map` |
| `post.md` | `/ocr-post` | `/ocr:post` |
| `doctor.md` | `/ocr-doctor` | `/ocr:doctor` |
| `reviewers.md` | `/ocr-reviewers` | `/ocr:reviewers` |
| `history.md` | `/ocr-history` | `/ocr:history` |
| `show.md` | `/ocr-show` | `/ocr:show` |
| `address.md` | `/ocr-address` | `/ocr:address` |
| `translate-review-to-single-human.md` | `/ocr-translate-review-to-single-human` | `/ocr:translate-review-to-single-human` |

**Why two formats?** Windsurf requires flat command files with a prefix (`/ocr-command`), while Claude Code and Cursor support subdirectories (`/ocr:command`). Both invoke the same underlying functionality.

## Skill Architecture

The `SKILL.md` file defines the **Tech Lead** role — the orchestrator that:

1. Discovers project context (config, OpenSpec, reference files)
2. Analyzes changes and identifies risk areas
3. Selects and spawns reviewer personas based on your team configuration
4. Facilitates discourse between reviewers
5. Synthesizes findings into a unified review

### Reviewer Personas

**Built-in** (customizable):
- **Principal** — Architecture, design patterns, holistic review
- **Quality** — Code style, readability, best practices
- **Security** — Authentication, data handling, vulnerabilities
- **Testing** — Coverage, edge cases, test strategy

**Custom**: Create your own by adding files to `.ocr/skills/references/reviewers/`. See the [reviewer template](skills/ocr/assets/reviewer-template.md).

### Map Agent Personas

The `/ocr:map` command uses specialized agents:

| Persona | Role |
|---------|------|
| **Map Architect** | Analyzes change topology, determines section groupings and review ordering |
| **Flow Analyst** | Traces upstream/downstream dependencies, groups related changes by data and control flow |
| **Requirements Mapper** | Maps changes to requirements/specs, identifies coverage gaps |

These run with configurable redundancy (default: 2). See `.ocr/config.yaml` → `code-review-map.agents`.

## Session Structure

```
.ocr/sessions/{YYYY-MM-DD}-{branch}/
├── discovered-standards.md  # Project context (shared across rounds)
├── context.md               # Change analysis (shared)
└── rounds/
    ├── round-1/
    │   ├── reviews/         # Individual reviewer outputs
    │   ├── discourse.md     # Cross-reviewer discussion
    │   └── final.md         # Synthesized review
    └── round-2/             # Created on re-review
├── maps/
│   └── run-1/
│       ├── map.md           # Code Review Map
│       └── flow-analysis.md # Dependency graph (Mermaid)
```

Running `/ocr-review` again on an existing session creates a new round if the previous round is complete. See `references/session-files.md` for the complete file manifest.

## License

Apache-2.0
