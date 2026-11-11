<p align="center">
  <a href="https://github.com/spencermarx/open-code-review">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/spencermarx/open-code-review/main/assets/OCR-Logo-Text-Light.png">
      <img src="https://raw.githubusercontent.com/spencermarx/open-code-review/main/assets/OCR-Logo-Text-Dark.png" alt="Open Code Review" width="300">
    </picture>
  </a>
</p>

# @open-code-review/cli

Command-line interface for [Open Code Review](https://github.com/spencermarx/open-code-review) — multi-tool setup, real-time progress tracking, environment health checks, and a web dashboard for managing reviews.

## Quick Start

**Requires Node.js >= 22.5** — OCR's storage engine is Node's built-in SQLite (`node:sqlite`), so there's no native module to compile and it installs cleanly under any package manager (npm, **pnpm 10+**, yarn).

```bash
# 1. Install globally
npm install -g @open-code-review/cli

# 2. Initialize in your project
cd your-project
ocr init

# 3. Launch the dashboard
ocr dashboard
```

`ocr init` detects your installed AI tools and configures each one automatically. Then use your AI assistant to run a review:

```
/ocr:review                                          # Claude Code / Cursor
/ocr-review                                          # Windsurf / other tools
/ocr-review against spec.md                          # With requirements context
/ocr-review --team principal:2,martin-fowler:1       # Custom team composition
/ocr-review --reviewer "Focus on error handling"     # Add an ephemeral reviewer
/ocr-map                                             # Code Review Map for large changesets
```

Run `ocr doctor` to verify your setup at any time.

## Reviewer Library

OCR ships with 28 reviewer personas across four tiers — holistic generalists (Principal, Staff Engineer, Architect), domain specialists (Security, Testing, Frontend, Performance, and more), and famous engineer personas (Martin Fowler, Kent Beck, Sandi Metz, and others) who review through the lens of their published work.

Add ephemeral one-off reviewers with `--reviewer`, or create persistent custom reviewers with `/ocr:create-reviewer`.

## Multi-Model Teams

Different reviewers can run on different models. Pair a fast generalist with a deeper specialist, or mix vendors across a single team:

```yaml
# .ocr/config.yaml
models:
  aliases:
    workhorse: claude-sonnet-4-6
    big-brain: claude-opus-4-7
  default: claude-sonnet-4-6

default_team:
  principal:                            # per-instance models
    - { model: big-brain }
    - { model: workhorse, name: principal-balanced }
  security: { count: 1, model: big-brain }   # one model, multiple instances
  quality: 2                            # default model
```

Override per-review from the dashboard's Command Center, or via `--team` on the CLI. The dashboard auto-discovers every model your installed vendor (Claude Code or OpenCode) offers.

## Commands

### `ocr init`

Initialize Open Code Review in your project. Creates `.ocr/` with skills, commands, and config, then configures your detected AI tools.

```bash
ocr init                              # Interactive — select tools
ocr init --tools claude,windsurf      # Non-interactive
ocr init --tools all                  # Configure all detected tools
```

### `ocr dashboard`

Start the web dashboard for running reviews, browsing results, triaging findings, and posting to GitHub. Bundled with the CLI — no separate install.

```bash
ocr dashboard                         # Default port (4173)
ocr dashboard --port 8080             # Custom port
ocr dashboard --no-open               # Don't auto-open browser
```

### `ocr progress`

Watch a review or map session in real-time. Shows current phase, elapsed time, reviewer status, finding counts, and completion percentage.

```bash
ocr progress                           # Auto-detect current session
ocr progress --session 2026-01-26-main # Specific session
```

### `ocr doctor`

Verify your OCR installation and all dependencies.

```bash
ocr doctor
```

Checks: `git`, AI CLI tools (Claude Code, OpenCode), `gh` (GitHub CLI), `.ocr/` setup, and capabilities.

### `ocr update`

Update OCR skills and commands after upgrading the package. Preserves your `.ocr/config.yaml` and all reviewer personas.

```bash
ocr update                    # Update everything
ocr update --dry-run          # Preview changes
ocr update --commands         # Commands only
ocr update --skills           # Skills and references only
ocr update --inject           # AGENTS.md/CLAUDE.md only
```

### `ocr reviewers`

Manage reviewer personas. Sync metadata from reviewer markdown files to `reviewers-meta.json` for the dashboard.

```bash
ocr reviewers sync --stdin      # Pipe JSON from AI-generated metadata
```

### `ocr state`

Internal command used by the review workflow to manage session state. Subcommands: `begin`, `advance`, `complete-round`, `complete-map`, `finish`, `status`, `show`, `sync`, `reconcile`.

```bash
ocr state begin --session-id <id> --branch <branch> --workflow-type review
ocr state advance --phase reviews   # Advance to a phase (graph-validated)
ocr state complete-round --stdin    # Finalize a round from piped JSON
ocr state finish                    # Close the workflow (invariant-checked)
ocr state status --json             # Completeness + next action
ocr state show --json               # Show current session state
ocr state sync                      # Rebuild state from filesystem
```

## Supported AI Tools

`ocr init` detects and configures all of these automatically:

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
| Universal (`--tools agents`) | `.agents/` — writes only `.agents/skills/ocr/SKILL.md`, a pointer skill for any [Agent Skills](https://agentskills.io)-compatible agent; no commands |

## Updating

After upgrading the package:

```bash
npm i -g @open-code-review/cli@latest
ocr update
```

The CLI notifies you when a new version is available.

## Links

- **Full documentation**: [github.com/spencermarx/open-code-review](https://github.com/spencermarx/open-code-review)
- **npm**: [@open-code-review/cli](https://www.npmjs.com/package/@open-code-review/cli)

## License

Apache-2.0
