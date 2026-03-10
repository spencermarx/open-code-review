## 1.7.0 (2026-03-10)

### 🚀 Features

- **agents:** expand reviewer library to 28 personas across four tiers ([991c4dc](https://github.com/spencermarx/open-code-review/commit/991c4dc))
- **agents:** add create-reviewer and sync-reviewers commands ([79fd570](https://github.com/spencermarx/open-code-review/commit/79fd570))
- **agents:** update review workflow for `--reviewer` ephemeral support ([5f99872](https://github.com/spencermarx/open-code-review/commit/5f99872))
- **cli:** add reviewer metadata generation and sync command ([b591694](https://github.com/spencermarx/open-code-review/commit/b591694))
- **dashboard:** add Team page for browsing and creating reviewers ([f146dbf](https://github.com/spencermarx/open-code-review/commit/f146dbf))
- **dashboard:** add reviewer selection with ephemeral support to command palette ([f6f8d44](https://github.com/spencermarx/open-code-review/commit/f6f8d44))

### 🩹 Fixes

- **dashboard:** forward `--team` and `--reviewer` flags to AI workflow ([c9a172d](https://github.com/spencermarx/open-code-review/commit/c9a172d))

### ❤️ Thank You

- Spencer Marx
- claude-flow @agentic-org

## 1.6.0 (2026-03-09)

### 🚀 Features

- **cli:** add orchestrator completion state management ([ee7a969](https://github.com/spencermarx/open-code-review/commit/ee7a969))
- **cli:** add non-blocking update check notifier ([0df5e58](https://github.com/spencermarx/open-code-review/commit/0df5e58))
- **dashboard:** integrate orchestrator-first metadata pipeline ([025a05b](https://github.com/spencermarx/open-code-review/commit/025a05b))
- **dashboard:** add address feedback popover and round triage ([0731fc7](https://github.com/spencermarx/open-code-review/commit/0731fc7))

### 🧪 Tests

- **cli:** add orchestrator completion state tests ([7aa73e5](https://github.com/spencermarx/open-code-review/commit/7aa73e5))
- **dashboard:** add orchestrator metadata and final-parser tests ([07e6a81](https://github.com/spencermarx/open-code-review/commit/07e6a81))

### 🏗️ Build

- **cli:** add db subpath export to esbuild config ([61171e5](https://github.com/spencermarx/open-code-review/commit/61171e5))

### ❤️ Thank You

- Spencer Marx
- claude-flow @agentic-org

## 1.5.1 (2026-03-06)

### 🚀 Features

- **cli:** add managed .gitignore block system for .ocr directory ([f17a1de](https://github.com/spencermarx/open-code-review/commit/f17a1de))

### ❤️ Thank You

- Spencer Marx

## 1.5.0 (2026-03-06)

### 🚀 Features

- initialize claude flow / ruflo ([1a73d7f](https://github.com/spencermarx/open-code-review/commit/1a73d7f))
- **agents:** update skill references with state tracking and map workflow ([f880146](https://github.com/spencermarx/open-code-review/commit/f880146))
- **agents:** add setup-guard reference and review-feedback command ([fb8da57](https://github.com/spencermarx/open-code-review/commit/fb8da57))
- **agents:** add address and translate-review-to-single-human commands ([c29d27b](https://github.com/spencermarx/open-code-review/commit/c29d27b))
- **cli:** add SQLite database layer, state management, and progress tracking ([1bcc2c2](https://github.com/spencermarx/open-code-review/commit/1bcc2c2))
- **cli:** add doctor command and init preflight dependency checks ([51d1350](https://github.com/spencermarx/open-code-review/commit/51d1350))
- **cli:** add dashboard command and register all new commands ([a7a61b7](https://github.com/spencermarx/open-code-review/commit/a7a61b7))
- **cli:** add tiered capability model to init and doctor ([f84df6f](https://github.com/spencermarx/open-code-review/commit/f84df6f))
- **dashboard:** add web dashboard package ([0789634](https://github.com/spencermarx/open-code-review/commit/0789634))
- **dashboard:** add bearer token auth and harden server security ([d2af985](https://github.com/spencermarx/open-code-review/commit/d2af985))
- **dashboard:** add post-to-GitHub with human review translation ([555417b](https://github.com/spencermarx/open-code-review/commit/555417b))
- **dashboard:** display workspace name and git branch in sidebar ([5bb1072](https://github.com/spencermarx/open-code-review/commit/5bb1072))
- **dashboard:** add AI CLI adapter strategy with unified execution tracking ([71e3aef](https://github.com/spencermarx/open-code-review/commit/71e3aef))
- **dashboard:** add capability-aware UI for command center and chat ([ce8963c](https://github.com/spencermarx/open-code-review/commit/ce8963c))
- **dashboard:** enrich session detail with per-workflow progress ([4b18ffb](https://github.com/spencermarx/open-code-review/commit/4b18ffb))
- **dashboard:** add address feedback popover with capability detection ([a5a7d51](https://github.com/spencermarx/open-code-review/commit/a5a7d51))
- **dashboard:** add GitHub documentation link to header ([360a35d](https://github.com/spencermarx/open-code-review/commit/360a35d))
- **dashboard:** add Write tool tracking and phase-aware generation to post handler ([378eb08](https://github.com/spencermarx/open-code-review/commit/378eb08))
- **dashboard:** save edited review on GitHub submit and add draft saved feedback ([5e5ad26](https://github.com/spencermarx/open-code-review/commit/5e5ad26))
- **dashboard:** add search, filter, and sort to command history ([c37b69a](https://github.com/spencermarx/open-code-review/commit/c37b69a))
- **dashboard:** add PID tracking and orphaned process cleanup on startup ([39c6d0a](https://github.com/spencermarx/open-code-review/commit/39c6d0a))
- **dashboard:** implement OpenCode CLI adapter with NDJSON parser ([afe97b3](https://github.com/spencermarx/open-code-review/commit/afe97b3))
- **ocr:** add address command and multi-round review support ([c866cd3](https://github.com/spencermarx/open-code-review/commit/c866cd3))

### 🩹 Fixes

- use git root path for Claude hook commands and add ruflo MCP server ([64e74fd](https://github.com/spencermarx/open-code-review/commit/64e74fd))
- **build:** add createRequire banner for ESM server bundle and fix workspace resolution ([fc3b8a2](https://github.com/spencermarx/open-code-review/commit/fc3b8a2))
- **cli:** guard against division by zero in renderProgressBar ([82aa6d0](https://github.com/spencermarx/open-code-review/commit/82aa6d0))
- **dashboard:** consolidate date utilities and fix client component bugs ([f2b6bf1](https://github.com/spencermarx/open-code-review/commit/f2b6bf1))
- **dashboard:** add filesystem-sync safety nets for interrupted sessions ([072cdd9](https://github.com/spencermarx/open-code-review/commit/072cdd9))
- **dashboard:** correct Socket.IO room event names and null-safe process entry ([5829ba8](https://github.com/spencermarx/open-code-review/commit/5829ba8))
- **dashboard:** use event delegation for Mermaid click listeners ([25028fe](https://github.com/spencermarx/open-code-review/commit/25028fe))
- **dashboard:** improve breadcrumb links, workflow output, and home error state ([f8c0afd](https://github.com/spencermarx/open-code-review/commit/f8c0afd))
- **dashboard:** clear command palette params on confirm and use exit code -2 for cancelled commands ([1151e34](https://github.com/spencermarx/open-code-review/commit/1151e34))
- **dashboard:** include git branch in document title when available ([268eb21](https://github.com/spencermarx/open-code-review/commit/268eb21))
- **dashboard:** mark stale commands with null exit_code as cancelled on startup ([5eaee2d](https://github.com/spencermarx/open-code-review/commit/5eaee2d))
- **dashboard:** simplify buildPhases logic and decouple workflow completion from session status ([18a11ae](https://github.com/spencermarx/open-code-review/commit/18a11ae))
- **dashboard:** use project root as CWD for all spawned processes ([a3f0cf4](https://github.com/spencermarx/open-code-review/commit/a3f0cf4))
- **dashboard:** align session card verdict with review triage status ([5b4b672](https://github.com/spencermarx/open-code-review/commit/5b4b672))
- **dashboard:** resolve CLI path via workspace root marker instead of walk-up ([9c94760](https://github.com/spencermarx/open-code-review/commit/9c94760))
- **dashboard:** use tmpdir() for temp files and pass GitHub tokens to child env ([326f317](https://github.com/spencermarx/open-code-review/commit/326f317))
- **dashboard:** harden socket handlers with buffer limits and flush on shutdown ([eac80af](https://github.com/spencermarx/open-code-review/commit/eac80af))
- **db:** add WAL/busy_timeout pragmas and protect orchestration audit trail ([b1b84a5](https://github.com/spencermarx/open-code-review/commit/b1b84a5))
- **db:** prevent cascade-delete data loss with mtime checks and progress stash/restore ([34b0013](https://github.com/spencermarx/open-code-review/commit/34b0013))
- **ocr:** run address workflow autonomously without user acknowledgment ([b3ddde4](https://github.com/spencermarx/open-code-review/commit/b3ddde4))
- **security:** harden auth, sanitize env, validate inputs, and disable stub adapter ([b0bf40e](https://github.com/spencermarx/open-code-review/commit/b0bf40e))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.4.0 (2026-01-29)

### 🚀 Features

- add openspec approve workflow for windsurf ([ef48ce8](https://github.com/spencermarx/open-code-review/commit/ef48ce8))
- add code review maps capabilities ([6b16188](https://github.com/spencermarx/open-code-review/commit/6b16188))

### ❤️ Thank You

- Spencer Marx

## 1.3.1 (2026-01-28)

This was a version bump only, there were no code changes.

## 1.3.0 (2026-01-28)

### 🚀 Features

- add testing to cli package ([a1ad97a](https://github.com/spencermarx/open-code-review/commit/a1ad97a))

### ❤️ Thank You

- Spencer Marx

## 1.2.0 (2026-01-28)

### 🚀 Features

- introduce multi-round review architecture ([c823f19](https://github.com/spencermarx/open-code-review/commit/c823f19))

### 🩹 Fixes

- update progress cli command to leverage correct phase states ([4b8f724](https://github.com/spencermarx/open-code-review/commit/4b8f724))
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

This was a version bump only, there were no code changes.

## 1.0.2 (2026-01-26)

This was a version bump only, there were no code changes.

## 1.0.1 (2026-01-26)

### 🩹 Fixes

- revert premature cli package.json ref change ([a624843](https://github.com/spencermarx/open-code-review/commit/a624843))

### ❤️ Thank You

- Spencer Marx

# Changelog

All notable changes to Open Code Review will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-26

### Added

- **Multi-Agent Code Review System**
  - Tech Lead orchestration of specialized reviewer personas
  - Default team: 2× Principal + 2× Quality engineers
  - Optional Security and Testing reviewers

- **Reviewer Personas**
  - Principal Engineer — Architecture, design, maintainability
  - Security Engineer — Auth, vulnerabilities, data protection
  - Quality Engineer — Code style, readability, best practices
  - Testing Engineer — Coverage, edge cases, testability
  - Custom reviewer support via templates

- **Redundancy System**
  - Multiple reviewers for higher confidence
  - Configurable per-reviewer redundancy
  - Consensus detection across redundant runs

- **Discourse Phase**
  - Reviewers challenge and validate each other
  - AGREE, CHALLENGE, CONNECT, SURFACE response types
  - Skip with `--quick` flag

- **Requirements Context**
  - Flexible input (inline, document reference, pasted text)
  - Agent-driven discovery of requirements
  - Requirements assessment in final synthesis

- **Clarifying Questions**
  - Surface requirements ambiguity
  - Scope boundary questions
  - Edge case uncertainty
  - Prominently displayed in synthesis

- **Reviewer Agency**
  - Full codebase exploration beyond diff
  - Professional judgment like real engineers
  - Document exploration in review output

- **Commands**
  - `/ocr:review` — Run code review
  - `/ocr:doctor` — Health check
  - `/ocr:reviewers` — List reviewers
  - `/ocr:add-reviewer` — Create custom reviewer
  - `/ocr:edit-reviewer` — Modify reviewer
  - `/ocr:history` — List sessions
  - `/ocr:show` — Display session
  - `/ocr:post` — Post to GitHub PR

- **Context Discovery**
  - Auto-discover CLAUDE.md, AGENTS.md, .cursorrules, etc.
  - Priority-based merging
  - Custom standards support

- **Session Management**
  - Persistent storage in `.ocr/sessions/`
  - Session history and retrieval
  - Configurable gitignore

- **GitHub Integration**
  - PR review support
  - Post reviews as PR comments
  - Inline comment format option

- **Cross-Platform Support**
  - Claude Code plugin structure
  - Agent Skills specification compliance
  - Cursor and Windsurf compatibility

### Technical

- Zero runtime dependencies
- Pure markdown-based skill definition
- Progressive disclosure pattern for efficiency
