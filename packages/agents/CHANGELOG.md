## 2.5.0 (2026-07-28)

### 🩹 Fixes

- **dashboard:** close spawn-convergence gaps from OCR round-1 review ([ddd02bc](https://github.com/spencermarx/open-code-review/commit/ddd02bc))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 2.4.0 (2026-06-28)

### 🚀 Features

- **skills:** add the OCR Review-to-Approval Loop project skill ([d8146fb](https://github.com/spencermarx/open-code-review/commit/d8146fb))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 2.3.0 (2026-06-15)

### 🚀 Features

- **brand:** integrate new OCR logo/cover assets in READMEs + dashboard ([52b8483](https://github.com/spencermarx/open-code-review/commit/52b8483))
- **state:** enforce directional verdict↔blocker-count consistency ([a2c829a](https://github.com/spencermarx/open-code-review/commit/a2c829a))
- **verdict:** canonical 3-state verdict contract enforced end to end ([278b308](https://github.com/spencermarx/open-code-review/commit/278b308))

### 🩹 Fixes

- **platform:** spawn via cross-spawn — argv is data on every platform ([#43](https://github.com/spencermarx/open-code-review/pull/43))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 2.2.1 (2026-06-11)

### 🩹 Fixes

- **models:** address review round 1 — route hardening, guards, cache split, picker defaults ([6cb4d88](https://github.com/spencermarx/open-code-review/commit/6cb4d88))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 2.2.0 (2026-06-11)

### 🩹 Fixes

- **agents:** harden and clarify the host-neutral Phase 4 skill prose ([#35](https://github.com/spencermarx/open-code-review/issues/35))
- **agents:** run review Phase 4 host-neutrally instead of assuming Claude Code ([#28](https://github.com/spencermarx/open-code-review/issues/28))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 2.1.0 (2026-06-09)

### 🚀 Features

- ⚠️  **cli:** migrate SQLite engine to Node's built-in node:sqlite ([7aef5b7](https://github.com/spencermarx/open-code-review/commit/7aef5b7))

### 🩹 Fixes

- **cli:** doctor --engine-only so the install gate exits on the engine (PR #34 R2 SF1) ([#34](https://github.com/spencermarx/open-code-review/issues/34))
- **ci:** resolve the agents dep via override in the install gate ([1a24756](https://github.com/spencermarx/open-code-review/commit/1a24756))

### ⚠️  Breaking Changes

- **cli:** migrate SQLite engine to Node's built-in node:sqlite  ([7aef5b7](https://github.com/spencermarx/open-code-review/commit/7aef5b7))
  requires Node >= 22.5 (node:sqlite). Existing on-disk databases
  are unaffected (engine-independent SQLite file format).
  Co-Authored-By: claude-flow <ruv@ruv.net>

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

# 2.0.0 (2026-06-09)

### 🚀 Features

- **db:** one-time migration notice when upgrading a pre-v2 database ([cf05983](https://github.com/spencermarx/open-code-review/commit/cf05983))

### 🩹 Fixes

- **cli:** round-2 blockers — sweepStaleSessions transactionality + cutover doc/spec finish ([6f22021](https://github.com/spencermarx/open-code-review/commit/6f22021))
- **cli:** address PR #31 review — atomic-API hardening + v2 cutover ([#31](https://github.com/spencermarx/open-code-review/issues/31))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.11.0 (2026-05-06)

This was a version bump only for agents to align it with other projects, there were no code changes.

## 1.10.4 (2026-04-07)

This was a version bump only for agents to align it with other projects, there were no code changes.

## 1.10.3 (2026-04-03)

### 🩹 Fixes

- **cli:** move @open-code-review/platform to devDependencies ([a5fa8b5](https://github.com/spencermarx/open-code-review/commit/a5fa8b5))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.10.2 (2026-04-03)

This was a version bump only for agents to align it with other projects, there were no code changes.

## 1.10.1 (2026-04-01)

This was a version bump only for agents to align it with other projects, there were no code changes.

## 1.10.0 (2026-03-31)

This was a version bump only for agents to align it with other projects, there were no code changes.

## 1.9.0 (2026-03-24)

### 🚀 Features

- **agents:** add Nx VersionActions to sync plugin.json on release ([#16](https://github.com/spencermarx/open-code-review/issues/16))

### 🩹 Fixes

- **agents:** install @nx/devkit and use proper imports in version-actions ([39d9072](https://github.com/spencermarx/open-code-review/commit/39d9072))
- **agents:** resolve TS errors in version-actions by using nx imports ([3a01b5e](https://github.com/spencermarx/open-code-review/commit/3a01b5e))
- **agents:** update plugin.json and SKILL.md versions to 1.8.4 ([#16](https://github.com/spencermarx/open-code-review/issues/16))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.8.4 (2026-03-10)

### 🚀 Features

- **agents:** update orchestrator instructions to require `synthesis_counts` in round-complete JSON for accurate dashboard display

### ❤️ Thank You

- Spencer Marx
- claude-flow @agentic-org

## 1.8.3 (2026-03-10)

This version has no agents-specific changes. Bumped for version alignment.

## 1.8.1 (2026-03-10)

### 🩹 Fixes

- **agents:** require post-synthesis categories in round-meta.json ([#7](https://github.com/spencermarx/open-code-review/issues/7))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.5.1 (2026-03-06)

### 🚀 Features

- **cli:** add managed .gitignore block system for .ocr directory ([f17a1de](https://github.com/spencermarx/open-code-review/commit/f17a1de))

### ❤️ Thank You

- Spencer Marx

## 1.5.0 (2026-03-06)

### 🚀 Features

- **ocr:** add address command and multi-round review support ([c866cd3](https://github.com/spencermarx/open-code-review/commit/c866cd3))
- **agents:** add address and translate-review-to-single-human commands ([c29d27b](https://github.com/spencermarx/open-code-review/commit/c29d27b))
- **agents:** add setup-guard reference and review-feedback command ([fb8da57](https://github.com/spencermarx/open-code-review/commit/fb8da57))
- **agents:** update skill references with state tracking and map workflow ([f880146](https://github.com/spencermarx/open-code-review/commit/f880146))
- initialize claude flow / ruflo ([1a73d7f](https://github.com/spencermarx/open-code-review/commit/1a73d7f))

### 🩹 Fixes

- **ocr:** run address workflow autonomously without user acknowledgment ([b3ddde4](https://github.com/spencermarx/open-code-review/commit/b3ddde4))
- use git root path for Claude hook commands and add ruflo MCP server ([64e74fd](https://github.com/spencermarx/open-code-review/commit/64e74fd))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.4.0 (2026-01-29)

### 🚀 Features

- add code review maps capabilities ([6b16188](https://github.com/spencermarx/open-code-review/commit/6b16188))
- add openspec approve workflow for windsurf ([ef48ce8](https://github.com/spencermarx/open-code-review/commit/ef48ce8))

### ❤️ Thank You

- Spencer Marx

## 1.3.1 (2026-01-28)

This was a version bump only for agents to align it with other projects, there were no code changes.

## 1.3.0 (2026-01-28)

### 🚀 Features

- add testing to cli package ([a1ad97a](https://github.com/spencermarx/open-code-review/commit/a1ad97a))

### ❤️ Thank You

- Spencer Marx

## 1.2.0 (2026-01-28)

### 🚀 Features

- introduce multi-round review architecture ([c823f19](https://github.com/spencermarx/open-code-review/commit/c823f19))

### 🩹 Fixes

- enhance accuracy of commands and polish progress command ([7b350ab](https://github.com/spencermarx/open-code-review/commit/7b350ab))

### ❤️ Thank You

- Spencer Marx

## 1.1.1 (2026-01-27)

### 🩹 Fixes

- fix time tracking bug for sessions ([25cf05d](https://github.com/spencermarx/open-code-review/commit/25cf05d))

### ❤️ Thank You

- Spencer Marx

## 1.1.0 (2026-01-26)

### 🚀 Features

- add github-npm releases from nx cli ([29cd02b](https://github.com/spencermarx/open-code-review/commit/29cd02b))

### ❤️ Thank You

- Spencer Marx

## 1.0.3 (2026-01-26)

This was a version bump only for agents to align it with other projects, there were no code changes.

## 1.0.2 (2026-01-26)

This was a version bump only for agents to align it with other projects, there were no code changes.

## 1.0.1 (2026-01-26)

This was a version bump only for agents to align it with other projects, there were no code changes.

# 1.0.0 (2026-01-26)

### 🚀 Features

- add agents package ([2850bbb](https://github.com/spencermarx/open-code-review/commit/2850bbb))

### 🩹 Fixes

- fix claude code plugin marketplace config ([27c1732](https://github.com/spencermarx/open-code-review/commit/27c1732))

### ❤️ Thank You

- Spencer Marx