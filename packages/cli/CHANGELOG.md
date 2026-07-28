## 2.5.0 (2026-07-28)

### 🚀 Features

- **cli:** capture the pre-mutation env snapshot for dashboard children ([0e41df6](https://github.com/spencermarx/open-code-review/commit/0e41df6))

### 🩹 Fixes

- **dashboard:** close spawn-convergence gaps from OCR round-1 review ([ddd02bc](https://github.com/spencermarx/open-code-review/commit/ddd02bc))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 2.4.0 (2026-06-28)

### 🚀 Features

- **skills:** add the OCR Review-to-Approval Loop project skill ([d8146fb](https://github.com/spencermarx/open-code-review/commit/d8146fb))
- **cli:** honor a session --team override in `team resolve` ([9271257](https://github.com/spencermarx/open-code-review/commit/9271257))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 2.3.0 (2026-06-15)

### 🚀 Features

- **brand:** integrate new OCR logo/cover assets in READMEs + dashboard ([52b8483](https://github.com/spencermarx/open-code-review/commit/52b8483))
- **cli:** forward-only, lease-guarded review --resume + status forward-resume ([6fb6541](https://github.com/spencermarx/open-code-review/commit/6fb6541))
- **state:** enforce directional verdict↔blocker-count consistency ([a2c829a](https://github.com/spencermarx/open-code-review/commit/a2c829a))
- **dashboard:** process supervision and database integrity hardening ([4481077](https://github.com/spencermarx/open-code-review/commit/4481077))
- **verdict:** canonical 3-state verdict contract enforced end to end ([278b308](https://github.com/spencermarx/open-code-review/commit/278b308))
- **cli:** argv-safety syntax classes for model ids and vendor session ids ([#43](https://github.com/spencermarx/open-code-review/pull/43))

### 🩹 Fixes

- **cli:** externalize ./index.js from the test-support bundle so the DB cache stays a singleton ([#41](https://github.com/spencermarx/open-code-review/pull/41))
- **cli:** share one vendor-session-id syntax class across bind and capture ([#43](https://github.com/spencermarx/open-code-review/pull/43))
- migrate raw child_process call sites to the platform wrappers ([#43](https://github.com/spencermarx/open-code-review/pull/43))
- **platform:** spawn via cross-spawn — argv is data on every platform ([#43](https://github.com/spencermarx/open-code-review/pull/43))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 2.2.1 (2026-06-11)

### 🩹 Fixes

- **models:** address review round 1 — route hardening, guards, cache split, picker defaults ([6cb4d88](https://github.com/spencermarx/open-code-review/commit/6cb4d88))
- **models:** rebuild vendor model enumeration as a single-source strategy table ([#39](https://github.com/spencermarx/open-code-review/issues/39))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 2.2.0 (2026-06-11)

### 🚀 Features

- **cli:** ocr db prune-backups to reclaim old snapshots (WS-E) ([bc9d351](https://github.com/spencermarx/open-code-review/commit/bc9d351))
- **cli:** auto-finalize completed-but-open sessions via guarded close (WS-C) ([4b19641](https://github.com/spencermarx/open-code-review/commit/4b19641))
- **cli:** operator database maintenance — ocr db doctor/prune/vacuum (WS-E) ([06560a7](https://github.com/spencermarx/open-code-review/commit/06560a7))
- **cli:** per-tool instruction-file injection and host capability model ([#28](https://github.com/spencermarx/open-code-review/issues/28))

### 🩹 Fixes

- **cli:** close the prune-backups NaN guard bypass (round-2 SF2) ([a89b599](https://github.com/spencermarx/open-code-review/commit/a89b599))
- **cli:** supervision + maintenance plumbing from the round-1 review ([65b3a09](https://github.com/spencermarx/open-code-review/commit/65b3a09))
- **cli:** type-clean the test suite for the typecheck gate ([b4bc78d](https://github.com/spencermarx/open-code-review/commit/b4bc78d))
- **cli:** correct type errors masked by the missing typecheck gate ([bfb7b37](https://github.com/spencermarx/open-code-review/commit/bfb7b37))
- **db:** stop markdown_artifacts duplication (write-path + migration v14) ([f192eaf](https://github.com/spencermarx/open-code-review/commit/f192eaf))
- **agents:** harden and clarify the host-neutral Phase 4 skill prose ([#35](https://github.com/spencermarx/open-code-review/issues/35))
- **cli:** warn on prompt-injection patterns in reviewer personas ([#35](https://github.com/spencermarx/open-code-review/issues/35))
- **cli:** surface silent reviewers-meta.json write failure ([#35](https://github.com/spencermarx/open-code-review/issues/35))
- **agents:** run review Phase 4 host-neutrally instead of assuming Claude Code ([#28](https://github.com/spencermarx/open-code-review/issues/28))
- **dashboard:** harden review render against missing or unknown reviewer metadata ([#28](https://github.com/spencermarx/open-code-review/issues/28))

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

- **cli,dashboard:** cascade dead-supervisor dependents; derive process kind; retire dead parent_id ([8229a77](https://github.com/spencermarx/open-code-review/commit/8229a77))
- **db:** one-time migration notice when upgrading a pre-v2 database ([cf05983](https://github.com/spencermarx/open-code-review/commit/cf05983))
- **cli:** begin is a true superset of init; advance tolerates --phase-number ([1a19a20](https://github.com/spencermarx/open-code-review/commit/1a19a20))
- **cli:** atomic agent state API + close-guard backstop ([e95873f](https://github.com/spencermarx/open-code-review/commit/e95873f))
- **state:** atomic event+projection commits + projection rebuild ([#31](https://github.com/spencermarx/open-code-review/issues/31))
- **db:** automatic legacy state reconciliation ([0bd8dd1](https://github.com/spencermarx/open-code-review/commit/0bd8dd1))
- **db:** migration v12 — taxonomy guard, sweep indexes, completeness view ([3a70893](https://github.com/spencermarx/open-code-review/commit/3a70893))
- **dashboard,cli:** sweep stale-active sessions + periodic dashboard timer ([4bf3596](https://github.com/spencermarx/open-code-review/commit/4bf3596))

### 🩹 Fixes

- **cli,dashboard:** round-4 blocker + supervision correctness fixes ([ba49580](https://github.com/spencermarx/open-code-review/commit/ba49580))
- **cli,dashboard:** orphan a supervised row only on a confirmed-dead pid ([7795eb5](https://github.com/spencermarx/open-code-review/commit/7795eb5))
- **cli:** round-2 blockers — sweepStaleSessions transactionality + cutover doc/spec finish ([6f22021](https://github.com/spencermarx/open-code-review/commit/6f22021))
- **dashboard:** resolve cli sentinels via the db barrel, not a dist-only subpath ([952e17d](https://github.com/spencermarx/open-code-review/commit/952e17d))
- **cli:** address PR #31 review — atomic-API hardening + v2 cutover ([#31](https://github.com/spencermarx/open-code-review/issues/31))
- **cli:** deterministic terminal color policy for published bundles ([c43a1fa](https://github.com/spencermarx/open-code-review/commit/c43a1fa))
- **cli:** state close uses the typed exit-code taxonomy + close-guard proof ([6a3aa28](https://github.com/spencermarx/open-code-review/commit/6a3aa28))
- **cli:** air-tight workflow state lifecycle ([#31](https://github.com/spencermarx/open-code-review/issues/31))
- **cli:** resolve completion session via dashboard execution UID ([b1b8204](https://github.com/spencermarx/open-code-review/commit/b1b8204))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.11.0 (2026-05-06)

### 🚀 Features

- **cli/db:** single-owner workflow_id linkage + durable spawn marker ([e3e2b55](https://github.com/spencermarx/open-code-review/commit/e3e2b55))
- **cli:** shared vendor-resume helper for argv + display strings ([80f7377](https://github.com/spencermarx/open-code-review/commit/80f7377))
- **cli:** ocr review --resume support ([41ef300](https://github.com/spencermarx/open-code-review/commit/41ef300))
- **cli:** ocr team resolve/set with three-form schema ([bb290d2](https://github.com/spencermarx/open-code-review/commit/bb290d2))
- **cli:** ocr models list with bundled fallbacks per vendor ([14753cb](https://github.com/spencermarx/open-code-review/commit/14753cb))
- **cli:** ocr session subcommands for AI lifecycle journaling ([ca9c8a3](https://github.com/spencermarx/open-code-review/commit/ca9c8a3))
- **cli/db:** collapse agent_sessions journal into command_executions ([17fb83f](https://github.com/spencermarx/open-code-review/commit/17fb83f))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.10.4 (2026-04-07)

### 🩹 Fixes

- **injector:** use h2 heading and backticks in managed block ([91e0ac1](https://github.com/spencermarx/open-code-review/commit/91e0ac1))

### ❤️ Thank You

- Alex @AlexanderWillner

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