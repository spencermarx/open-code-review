# Change: Add OCR CLI with NX Monorepo Architecture

## Why

Users need a simple way to install OCR across multiple AI coding environments without manual file copying. The CLI should be installable via `npx` or `pnpm dlx` and provide environment setup (`init`), easy updates (`update`), and real-time review progress tracking (`progress`).

## What Changes

- Add NX 22 integrated monorepo with two publishable packages:
  - `@open-code-review/cli` - CLI with `init`, `update`, and `progress` commands
  - `@open-code-review/agents` - Skills, commands, templates, reviewer personas (also Claude Code plugin)
- Use esbuild bundler for fast CLI builds with shebang injection
- Implement `ocr init` command for multi-environment setup
- Implement `ocr update` command for refreshing assets after package upgrades
- Implement `ocr progress` command for real-time review tracking
- Inject OCR instructions into user's `AGENTS.md` and `CLAUDE.md` during init (following OpenSpec pattern)
- Add setup validation guards for CLI commands
- Add setup guard sub-skill for agent-side validation
- Support tool-specific command installation (subdirectory vs flat-prefixed)
- Provide `.ocr/config.yaml` for project context and review customization

## Impact

- **Affected specs**: New `cli` capability
- **Affected code**: 
  - `packages/cli/` - CLI package source
  - `packages/agents/` - Skills and agentic assets package
  - `nx.json` - NX workspace configuration
  - `package.json` - Root workspace config
  - `tsconfig.base.json` - Shared TypeScript config

## Success Criteria

```bash
# Global install
npm install -g @open-code-review/cli
ocr init
ocr progress
ocr update

# One-time execution
npx @open-code-review/cli init
pnpm dlx @open-code-review/cli progress

# Update after package upgrade
npm update -g @open-code-review/cli
ocr update                    # Update all assets
ocr update --commands         # Update only commands
ocr update --inject           # Update only AGENTS.md
ocr update --dry-run          # Preview changes
```
