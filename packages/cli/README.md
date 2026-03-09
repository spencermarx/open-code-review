# @open-code-review/cli

Command-line interface for [Open Code Review](https://github.com/spencermarx/open-code-review) — multi-tool setup, real-time progress tracking, environment health checks, and a web dashboard for managing reviews.

## Quick Start

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
/ocr:review                     # Claude Code / Cursor
/ocr-review                     # Windsurf / other tools
/ocr-review against spec.md     # With requirements context
/ocr-map                        # Code Review Map for large changesets
```

Run `ocr doctor` to verify your setup at any time.

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

### `ocr state`

Internal command used by the review workflow to manage session state. Subcommands: `init`, `transition`, `close`, `show`, `sync`, `round-complete`, `map-complete`.

```bash
ocr state show                # Show current session state
ocr state show --json         # Output as JSON
ocr state sync                # Rebuild state from filesystem
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
