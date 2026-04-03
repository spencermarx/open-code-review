## 1.10.3 (2026-04-03)

### 🩹 Fixes

- **cli:** move @open-code-review/platform to devDependencies ([a5fa8b5](https://github.com/spencermarx/open-code-review/commit/a5fa8b5))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.10.2 (2026-04-03)

### 🩹 Fixes

- **cli:** use platform-safe ESM import and binary execution ([d867733](https://github.com/spencermarx/open-code-review/commit/d867733))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.10.1 (2026-04-01)

### 🩹 Fixes

- **cli,dashboard:** skip empty sessions and default backfilled status to closed ([1210b5f](https://github.com/spencermarx/open-code-review/commit/1210b5f))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.10.0 (2026-03-31)

### 🚀 Features

- **cli:** add JSONL-backed command history backup with replay recovery ([424007a](https://github.com/spencermarx/open-code-review/commit/424007a))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.9.0 (2026-03-24)

### 🩹 Fixes

- **agents:** install @nx/devkit and use proper imports in version-actions ([39d9072](https://github.com/spencermarx/open-code-review/commit/39d9072))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.8.4 (2026-03-10)

### 🚀 Features

- **cli:** add `synthesis_counts` to `round-meta.json` schema — deduplicated post-synthesis counts preferred over derived per-reviewer counts

### 🧪 Tests

- **cli:** add `synthesis_counts` preference and fallback tests for `computeRoundCounts`

### ❤️ Thank You

- Spencer Marx
- claude-flow @agentic-org

## 1.8.3 (2026-03-10)

### 🩹 Fixes

- **cli:** fix `ocr --version` reporting stale version — bundle was not rebuilt before 1.8.1 publish

### ❤️ Thank You

- Spencer Marx
- claude-flow @agentic-org

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

- **dashboard:** add PID tracking and orphaned process cleanup on startup ([39c6d0a](https://github.com/spencermarx/open-code-review/commit/39c6d0a))
- **ocr:** add address command and multi-round review support ([c866cd3](https://github.com/spencermarx/open-code-review/commit/c866cd3))
- **cli:** add tiered capability model to init and doctor ([f84df6f](https://github.com/spencermarx/open-code-review/commit/f84df6f))
- **agents:** add address and translate-review-to-single-human commands ([c29d27b](https://github.com/spencermarx/open-code-review/commit/c29d27b))
- **agents:** add setup-guard reference and review-feedback command ([fb8da57](https://github.com/spencermarx/open-code-review/commit/fb8da57))
- **agents:** update skill references with state tracking and map workflow ([f880146](https://github.com/spencermarx/open-code-review/commit/f880146))
- **cli:** add dashboard command and register all new commands ([a7a61b7](https://github.com/spencermarx/open-code-review/commit/a7a61b7))
- **cli:** add doctor command and init preflight dependency checks ([51d1350](https://github.com/spencermarx/open-code-review/commit/51d1350))
- **cli:** add SQLite database layer, state management, and progress tracking ([1bcc2c2](https://github.com/spencermarx/open-code-review/commit/1bcc2c2))
- initialize claude flow / ruflo ([1a73d7f](https://github.com/spencermarx/open-code-review/commit/1a73d7f))

### 🩹 Fixes

- **cli:** guard against division by zero in renderProgressBar ([82aa6d0](https://github.com/spencermarx/open-code-review/commit/82aa6d0))
- **build:** add createRequire banner for ESM server bundle and fix workspace resolution ([fc3b8a2](https://github.com/spencermarx/open-code-review/commit/fc3b8a2))
- **db:** add WAL/busy_timeout pragmas and protect orchestration audit trail ([b1b84a5](https://github.com/spencermarx/open-code-review/commit/b1b84a5))
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

This was a version bump only for cli to align it with other projects, there were no code changes.

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
- update progress cli command to leverage correct phase states ([4b8f724](https://github.com/spencermarx/open-code-review/commit/4b8f724))

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

This was a version bump only for cli to align it with other projects, there were no code changes.

## 1.0.2 (2026-01-26)

This was a version bump only for cli to align it with other projects, there were no code changes.

## 1.0.1 (2026-01-26)

### 🩹 Fixes

- revert premature cli package.json ref change ([a624843](https://github.com/spencermarx/open-code-review/commit/a624843))

### ❤️ Thank You

- Spencer Marx

# 1.0.0 (2026-01-26)

### 🚀 Features

- add cli package ([6432351](https://github.com/spencermarx/open-code-review/commit/6432351))

### 🩹 Fixes

- fix claude code plugin marketplace config ([27c1732](https://github.com/spencermarx/open-code-review/commit/27c1732))

### ❤️ Thank You

- Spencer Marx