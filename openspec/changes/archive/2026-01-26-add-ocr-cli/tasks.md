# Tasks: Add OCR CLI

## Phase 1: NX Monorepo Setup

- [x] 1.1 Create root `package.json` with pnpm workspace config
- [x] 1.2 Create `pnpm-workspace.yaml` for packages
- [x] 1.3 Create `nx.json` with NX 22.x configuration and release settings
- [x] 1.4 Create `tsconfig.base.json` with strict TypeScript settings
- [x] 1.5 Update `openspec/config.yaml` with TypeScript coding standards

## Phase 2: Agents Package Setup

- [x] 2.1 Create `packages/agents/package.json` with publishable config
- [x] 2.2 Create `packages/agents/project.json` with NX targets
- [x] 2.3 Move `.ocr/skills/` content to `packages/agents/ocr/`
- [x] 2.4 Move `.ocr/commands/` content to `packages/agents/commands/`
- [x] 2.5 Create `packages/agents/ocr/AGENTS.md` (OCR-specific instructions)
- [x] 2.6 Create `packages/agents/README.md`

## Phase 3: CLI Package Setup

- [x] 3.1 Create `packages/cli/package.json` with bin entry and agents dependency
- [x] 3.2 Create `packages/cli/project.json` with esbuild build target
- [x] 3.3 Add NX dev targets: `dev`, `init`, `progress` using `tsx` executor
- [x] 3.4 Create `packages/cli/tsconfig.json`
- [x] 3.5 Create `packages/cli/README.md`

## Phase 4: CLI Core Implementation

- [x] 4.1 Create `packages/cli/src/index.ts` (CLI entry with Commander)
- [x] 4.2 Create `packages/cli/src/lib/config.ts` (AI tools configuration)
- [x] 4.3 Create `packages/cli/src/lib/installer.ts` (copy/symlink logic)
- [x] 4.4 Create `packages/cli/src/lib/injector.ts` (AGENTS.md/CLAUDE.md injection)

## Phase 5: Init Command

- [x] 5.1 Create `packages/cli/src/commands/init.ts`
- [x] 5.2 Implement interactive multi-select tool selection
- [x] 5.3 Implement `--tools` flag for non-interactive mode
- [x] 5.4 Implement symlink vs copy installation strategy
- [x] 5.5 Implement AGENTS.md/CLAUDE.md injection with managed blocks
- [x] 5.6 Implement `--no-inject` flag to skip instruction injection
- [x] 5.7 Create `.ocr/sessions/` directory and `.ocr/.gitignore`

## Phase 6: Progress Command

- [x] 6.1 Create `packages/cli/src/lib/watcher.ts` (session file watcher)
- [x] 6.2 Create `packages/cli/src/lib/parser.ts` (session file parser)
- [x] 6.3 Create `packages/cli/src/commands/progress.ts`
- [x] 6.4 Implement real-time progress display with phase tracking
- [x] 6.5 Implement reviewer status and findings count
- [x] 6.6 Implement 8-phase workflow display (context, requirements, analysis, reviews, aggregation, discourse, synthesis, complete)
- [x] 6.7 Add progress bar visualization
- [x] 6.8 Add reviewer details with finding counts under reviews phase

## Phase 6b: OCR Setup Validation

- [x] 6b.1 Create `packages/cli/src/lib/guards.ts` with setup validation functions
- [x] 6b.2 Implement `requireOcrSetup()` guard for CLI commands
- [x] 6b.3 Implement `ensureSessionsDir()` for JIT session directory bootstrap
- [x] 6b.4 Add guard to `progress` command
- [x] 6b.5 Create `packages/agents/ocr/references/setup-guard.md` for agent-side validation

## Phase 6c: Update Command

- [x] 6c.1 Create `packages/cli/src/commands/update.ts`
- [x] 6c.2 Implement detection of configured tools (check for existing `.{tool}/` directories)
- [x] 6c.3 Implement `--commands` flag to update only commands/workflows
- [x] 6c.4 Implement `--skills` flag to update only skills/assets
- [x] 6c.5 Implement `--inject` flag to update only AGENTS.md/CLAUDE.md blocks
- [x] 6c.6 Implement `--dry-run` flag to preview changes (shows all assets being updated)
- [x] 6c.7 Add guard to require OCR setup before update
- [x] 6c.8 Register update command in `packages/cli/src/index.ts`

## Phase 6d: Tool-Specific Command Installation

- [x] 6d.1 Add `commandStrategy` field to `AIToolConfig` type
- [x] 6d.2 Implement `subdirectory` strategy (Claude Code, Cursor, etc.)
- [x] 6d.3 Implement `flat-prefixed` strategy (Windsurf)
- [x] 6d.4 Update `installCommandsForTool()` to use strategy pattern

## Phase 6e: Project Configuration

- [x] 6e.1 Redesign `packages/agents/skills/ocr/assets/config.yaml` as project config template
- [x] 6e.2 Add context discovery, OpenSpec integration, and review rules sections
- [x] 6e.3 Install config.yaml to `.ocr/config.yaml` during init
- [x] 6e.4 Preserve existing config.yaml on update

## Phase 6f: Claude Code Plugin Distribution

- [x] 6f.1 Create `.claude-plugin/plugin.json` manifest in agents package
- [x] 6f.2 Restructure `ocr/` → `skills/ocr/` for plugin compatibility
- [x] 6f.3 Update CLI installer to use new `skills/ocr/` path
- [x] 6f.4 Update agents README with dual distribution docs (CLI + Plugin)
- [x] 6f.5 Test CLI init/update with new structure
- [x] 6f.6 Create `/.claude-plugin/marketplace.json` for plugin discovery
- [x] 6f.7 Plugin bootstrapping handled by setup-guard.md JIT (no init command needed)
- [x] 6f.8 Update `setup-guard.md` for dual-mode operation (CLI vs Plugin)
- [x] 6f.9 Validate plugin structure with `claude plugin validate`

## Phase 7: Build & Test

- [x] 7.1 Run `pnpm install` to install dependencies
- [x] 7.2 Run `nx build cli` and verify dist output with shebang
- [x] 7.3 Test `node packages/cli/dist/index.js init` locally
- [x] 7.4 Test `node packages/cli/dist/index.js progress` locally
- [x] 7.5 Verify AGENTS.md injection works correctly

## Phase 8: Documentation & Publishing

- [x] 8.1 Update root `README.md` with installation instructions
- [x] 8.2 Run `nx release --dry-run` to preview release
- [x] 8.3 Run `nx release --first-release` for initial publish

## Validation

```bash
# Install dependencies
pnpm install

# Build CLI (agents package is static assets, no build needed)
nx build cli

# Local development (no build required)
nx run cli:dev -- --help
nx run cli:init -- --tools claude
nx run cli:init -- --tools all --no-inject
nx run cli:progress

# Test built output
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js init --tools claude

# Test AGENTS.md injection
cat AGENTS.md | grep "OCR:START"

# Release preview
nx release --dry-run

# Test npx execution (after publish)
npx @open-code-review/cli init
npx @open-code-review/cli progress
```
