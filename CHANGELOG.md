## 2.5.0 (2026-07-28)

### 🚀 Features

- **cli:** capture the pre-mutation env snapshot for dashboard children ([0e41df6](https://github.com/spencermarx/open-code-review/commit/0e41df6))
- **config:** add dashboard settings parsing layer ([#56](https://github.com/spencermarx/open-code-review/issues/56))
- **dashboard:** inherit the launch shell environment in child processes ([#57](https://github.com/spencermarx/open-code-review/issues/57), [#56](https://github.com/spencermarx/open-code-review/issues/56))
- **platform:** add child-env builder with criteria-governed denylist ([7490f06](https://github.com/spencermarx/open-code-review/commit/7490f06))

### 🩹 Fixes

- **dashboard:** close spawn-convergence gaps from OCR round-1 review ([ddd02bc](https://github.com/spencermarx/open-code-review/commit/ddd02bc))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 2.4.0 (2026-06-28)

### 🚀 Features

- **cli:** honor a session --team override in `team resolve` ([9271257](https://github.com/spencermarx/open-code-review/commit/9271257))
- **config:** add strict --team shorthand parser (parseTeamSpec) ([f0b58e4](https://github.com/spencermarx/open-code-review/commit/f0b58e4))
- **skills:** add the OCR Review-to-Approval Loop project skill ([d8146fb](https://github.com/spencermarx/open-code-review/commit/d8146fb))

### 🩹 Fixes

- **config:** bound team instance count to prevent a heap-OOM / DoS ([c32ef3e](https://github.com/spencermarx/open-code-review/commit/c32ef3e))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 2.3.0 (2026-06-15)

### 🚀 Features

- **brand:** integrate new OCR logo/cover assets in READMEs + dashboard ([52b8483](https://github.com/spencermarx/open-code-review/commit/52b8483))
- **cli:** argv-safety syntax classes for model ids and vendor session ids ([#43](https://github.com/spencermarx/open-code-review/pull/43))
- **cli:** forward-only, lease-guarded review --resume + status forward-resume ([6fb6541](https://github.com/spencermarx/open-code-review/commit/6fb6541))
- **dashboard:** process supervision and database integrity hardening ([4481077](https://github.com/spencermarx/open-code-review/commit/4481077))
- **dashboard:** auto-forward-resume sweep + exhausted-state recovery UI ([d85333f](https://github.com/spencermarx/open-code-review/commit/d85333f))
- **state:** enforce directional verdict↔blocker-count consistency ([a2c829a](https://github.com/spencermarx/open-code-review/commit/a2c829a))
- **state:** forward-resume core for stranded mid-pipeline runs ([#146](https://github.com/spencermarx/open-code-review/issues/146))
- **verdict:** canonical 3-state verdict contract enforced end to end ([278b308](https://github.com/spencermarx/open-code-review/commit/278b308))

### 🩹 Fixes

- migrate raw child_process call sites to the platform wrappers ([#43](https://github.com/spencermarx/open-code-review/pull/43))
- **cli:** share one vendor-session-id syntax class across bind and capture ([#43](https://github.com/spencermarx/open-code-review/pull/43))
- **cli:** externalize ./index.js from the test-support bundle so the DB cache stays a singleton ([#41](https://github.com/spencermarx/open-code-review/pull/41))
- **dashboard:** deliver prompts over stdin for both adapters ([#43](https://github.com/spencermarx/open-code-review/pull/43))
- **dashboard:** refuse to spawn an agent CLI with an empty prompt ([#43](https://github.com/spencermarx/open-code-review/pull/43))
- **dashboard:** run 'ocr team set' from the project root on every platform ([#41](https://github.com/spencermarx/open-code-review/pull/41))
- **platform:** spawn via cross-spawn — argv is data on every platform ([#43](https://github.com/spencermarx/open-code-review/pull/43))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 2.2.1 (2026-06-11)

### 🩹 Fixes

- **dashboard:** disclose bundled model-list fallback and keep free-text entry reachable ([#39](https://github.com/spencermarx/open-code-review/issues/39))
- **models:** rebuild vendor model enumeration as a single-source strategy table ([#39](https://github.com/spencermarx/open-code-review/issues/39))
- **models:** address review round 1 — route hardening, guards, cache split, picker defaults ([6cb4d88](https://github.com/spencermarx/open-code-review/commit/6cb4d88))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 2.2.0 (2026-06-11)

### 🚀 Features

- **cli:** per-tool instruction-file injection and host capability model ([#28](https://github.com/spencermarx/open-code-review/issues/28))
- **cli:** operator database maintenance — ocr db doctor/prune/vacuum (WS-E) ([06560a7](https://github.com/spencermarx/open-code-review/commit/06560a7))
- **cli:** auto-finalize completed-but-open sessions via guarded close (WS-C) ([4b19641](https://github.com/spencermarx/open-code-review/commit/4b19641))
- **cli:** ocr db prune-backups to reclaim old snapshots (WS-E) ([bc9d351](https://github.com/spencermarx/open-code-review/commit/bc9d351))
- **dashboard:** declare adapter sub-agent spawn capability ([#28](https://github.com/spencermarx/open-code-review/issues/28))
- **dashboard:** file-stdio isolation for detached agents (WS-A hardening) ([78b6ee5](https://github.com/spencermarx/open-code-review/commit/78b6ee5))
- **dashboard:** integrate reconciliation, file-stdio tailer + maintenance reapers ([677f05c](https://github.com/spencermarx/open-code-review/commit/677f05c))
- **platform:** add a cross-platform process-tree reaper ([25b5a3c](https://github.com/spencermarx/open-code-review/commit/25b5a3c))

### 🩹 Fixes

- **agents:** run review Phase 4 host-neutrally instead of assuming Claude Code ([#28](https://github.com/spencermarx/open-code-review/issues/28))
- **agents:** harden and clarify the host-neutral Phase 4 skill prose ([#35](https://github.com/spencermarx/open-code-review/issues/35))
- **cli:** surface silent reviewers-meta.json write failure ([#35](https://github.com/spencermarx/open-code-review/issues/35))
- **cli:** warn on prompt-injection patterns in reviewer personas ([#35](https://github.com/spencermarx/open-code-review/issues/35))
- **cli:** correct type errors masked by the missing typecheck gate ([bfb7b37](https://github.com/spencermarx/open-code-review/commit/bfb7b37))
- **cli:** type-clean the test suite for the typecheck gate ([b4bc78d](https://github.com/spencermarx/open-code-review/commit/b4bc78d))
- **cli:** supervision + maintenance plumbing from the round-1 review ([65b3a09](https://github.com/spencermarx/open-code-review/commit/65b3a09))
- **cli:** close the prune-backups NaN guard bypass (round-2 SF2) ([a89b599](https://github.com/spencermarx/open-code-review/commit/a89b599))
- **dashboard:** harden review render against missing or unknown reviewer metadata ([#28](https://github.com/spencermarx/open-code-review/issues/28))
- **dashboard:** contract-test the icon map; drop dead shield-check glyph ([#35](https://github.com/spencermarx/open-code-review/issues/35))
- **dashboard:** supervise spawned reviews so a leaked daemon can't wedge them ([dfb0999](https://github.com/spencermarx/open-code-review/commit/dfb0999))
- **dashboard:** reap orphan .tmp files and enforce a single instance ([a986b33](https://github.com/spencermarx/open-code-review/commit/a986b33))
- **dashboard:** correct type errors masked by the missing typecheck gate ([2946d42](https://github.com/spencermarx/open-code-review/commit/2946d42))
- **dashboard:** type-clean the test suite for the typecheck gate ([33c4c54](https://github.com/spencermarx/open-code-review/commit/33c4c54))
- **dashboard:** supervision correctness from the round-1 review ([78cb2f6](https://github.com/spencermarx/open-code-review/commit/78cb2f6))
- **dashboard:** reap full process trees at restart boundaries (round-1 SF1) ([96251c2](https://github.com/spencermarx/open-code-review/commit/96251c2))
- **dashboard:** watchdog finalizes regardless of child liveness (round-2 SF1/SF4/SF5) ([7b49f1d](https://github.com/spencermarx/open-code-review/commit/7b49f1d))
- **dashboard:** make the shutdown SIGKILL escalation actually fire (round-2 SF3) ([e650dad](https://github.com/spencermarx/open-code-review/commit/e650dad))
- **db:** stop markdown_artifacts duplication (write-path + migration v14) ([f192eaf](https://github.com/spencermarx/open-code-review/commit/f192eaf))
- **e2e:** retry + best-effort temp-dir teardown (Windows EBUSY) ([e32fb52](https://github.com/spencermarx/open-code-review/commit/e32fb52))
- **platform:** reapTree returns a SIGTERM-phase diagnostic + warns on stragglers ([4b475cd](https://github.com/spencermarx/open-code-review/commit/4b475cd))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 2.1.0 (2026-06-09)

### 🚀 Features

- ⚠️  **cli:** migrate SQLite engine to Node's built-in node:sqlite ([7aef5b7](https://github.com/spencermarx/open-code-review/commit/7aef5b7))

### 🩹 Fixes

- **ci:** resolve the agents dep via override in the install gate ([1a24756](https://github.com/spencermarx/open-code-review/commit/1a24756))
- **cli:** doctor --engine-only so the install gate exits on the engine (PR #34 R2 SF1) ([#34](https://github.com/spencermarx/open-code-review/issues/34))

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

- **cli:** atomic agent state API + close-guard backstop ([e95873f](https://github.com/spencermarx/open-code-review/commit/e95873f))
- **cli:** begin is a true superset of init; advance tolerates --phase-number ([1a19a20](https://github.com/spencermarx/open-code-review/commit/1a19a20))
- **cli,dashboard:** cascade dead-supervisor dependents; derive process kind; retire dead parent_id ([8229a77](https://github.com/spencermarx/open-code-review/commit/8229a77))
- **dashboard:** derive command outcome from workflow lifecycle ([d656834](https://github.com/spencermarx/open-code-review/commit/d656834))
- **dashboard:** derive command outcome from event-sourced completeness ([9eddf66](https://github.com/spencermarx/open-code-review/commit/9eddf66))
- **dashboard:** cancellation_reason (S10) + single-writer architecture test ([903ddbd](https://github.com/spencermarx/open-code-review/commit/903ddbd))
- **dashboard,cli:** sweep stale-active sessions + periodic dashboard timer ([4bf3596](https://github.com/spencermarx/open-code-review/commit/4bf3596))
- **db:** migration v12 — taxonomy guard, sweep indexes, completeness view ([3a70893](https://github.com/spencermarx/open-code-review/commit/3a70893))
- **db:** automatic legacy state reconciliation ([0bd8dd1](https://github.com/spencermarx/open-code-review/commit/0bd8dd1))
- **db:** one-time migration notice when upgrading a pre-v2 database ([cf05983](https://github.com/spencermarx/open-code-review/commit/cf05983))
- **state:** atomic event+projection commits + projection rebuild ([#31](https://github.com/spencermarx/open-code-review/issues/31))

### 🩹 Fixes

- **cli:** resolve completion session via dashboard execution UID ([b1b8204](https://github.com/spencermarx/open-code-review/commit/b1b8204))
- **cli:** air-tight workflow state lifecycle ([#31](https://github.com/spencermarx/open-code-review/issues/31))
- **cli:** state close uses the typed exit-code taxonomy + close-guard proof ([6a3aa28](https://github.com/spencermarx/open-code-review/commit/6a3aa28))
- **cli:** deterministic terminal color policy for published bundles ([c43a1fa](https://github.com/spencermarx/open-code-review/commit/c43a1fa))
- **cli:** color policy must treat TERM=dumb as no-color ([8c9970f](https://github.com/spencermarx/open-code-review/commit/8c9970f))
- **cli:** address PR #31 review — atomic-API hardening + v2 cutover ([#31](https://github.com/spencermarx/open-code-review/issues/31))
- **cli:** round-2 blockers — sweepStaleSessions transactionality + cutover doc/spec finish ([6f22021](https://github.com/spencermarx/open-code-review/commit/6f22021))
- **cli,dashboard:** orphan a supervised row only on a confirmed-dead pid ([7795eb5](https://github.com/spencermarx/open-code-review/commit/7795eb5))
- **cli,dashboard:** round-4 blocker + supervision correctness fixes ([ba49580](https://github.com/spencermarx/open-code-review/commit/ba49580))
- **cli-e2e:** stabilise liveness-sweep "untouched" test on slow CI ([9f6738b](https://github.com/spencermarx/open-code-review/commit/9f6738b))
- **dashboard:** address PR #31 review — single-writer lifecycle + dead-code cutover ([#31](https://github.com/spencermarx/open-code-review/issues/31))
- **dashboard:** distinguish cascade-close (-4) from user-cancel (-2) in history ([137014d](https://github.com/spencermarx/open-code-review/commit/137014d))
- **dashboard:** resolve cli sentinels via the db barrel, not a dist-only subpath ([952e17d](https://github.com/spencermarx/open-code-review/commit/952e17d))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.11.0 (2026-05-06)

### 🚀 Features

- **cli:** ocr session subcommands for AI lifecycle journaling ([ca9c8a3](https://github.com/spencermarx/open-code-review/commit/ca9c8a3))
- **cli:** ocr models list with bundled fallbacks per vendor ([14753cb](https://github.com/spencermarx/open-code-review/commit/14753cb))
- **cli:** ocr team resolve/set with three-form schema ([bb290d2](https://github.com/spencermarx/open-code-review/commit/bb290d2))
- **cli:** ocr review --resume support ([41ef300](https://github.com/spencermarx/open-code-review/commit/41ef300))
- **cli:** shared vendor-resume helper for argv + display strings ([80f7377](https://github.com/spencermarx/open-code-review/commit/80f7377))
- **cli/db:** collapse agent_sessions journal into command_executions ([17fb83f](https://github.com/spencermarx/open-code-review/commit/17fb83f))
- **cli/db:** single-owner workflow_id linkage + durable spawn marker ([e3e2b55](https://github.com/spencermarx/open-code-review/commit/e3e2b55))
- **dashboard:** ai-cli adapter listModels + per-task model + workflow session_id capture ([5e0f06c](https://github.com/spencermarx/open-code-review/commit/5e0f06c))
- **dashboard:** agent-sessions API, handoff route, WAL hygiene, sweep ([34e7a8e](https://github.com/spencermarx/open-code-review/commit/34e7a8e))
- **dashboard:** team config API and hooks ([4b676b6](https://github.com/spencermarx/open-code-review/commit/4b676b6))
- **dashboard/server:** adapter contract for resume + per-task model ([42d2ad0](https://github.com/spencermarx/open-code-review/commit/42d2ad0))
- **dashboard/server:** SessionCaptureService façade + thin handoff route ([861275e](https://github.com/spencermarx/open-code-review/commit/861275e))
- **dashboard/server:** per-execution event journal + events API ([2824863](https://github.com/spencermarx/open-code-review/commit/2824863))
- **dashboard/server:** durable spawn lifecycle + UTF-8 safety + prompt-injection guards ([87e2a5d](https://github.com/spencermarx/open-code-review/commit/87e2a5d))
- **dashboard/server:** normalize final.md verdict labels ([283332b](https://github.com/spencermarx/open-code-review/commit/283332b))
- **dashboard/ui:** ModelSelect dropdown matching design system ([1317605](https://github.com/spencermarx/open-code-review/commit/1317605))
- **dashboard/ui:** default team management on the Team page ([1ca4b94](https://github.com/spencermarx/open-code-review/commit/1ca4b94))
- **dashboard/ui:** session liveness, resume, and terminal-handoff panel ([8a26bbe](https://github.com/spencermarx/open-code-review/commit/8a26bbe))
- **dashboard/ui:** command-history surfaces stalled/orphaned + terminal handoff ([f037432](https://github.com/spencermarx/open-code-review/commit/f037432))
- **dashboard/ui:** live event-stream timeline renderer ([8ddff99](https://github.com/spencermarx/open-code-review/commit/8ddff99))
- **dashboard/ui:** terminal-handoff panel + structured failure rendering ([a8460eb](https://github.com/spencermarx/open-code-review/commit/a8460eb))

### 🩹 Fixes

- **dashboard:** vite proxy logger filters benign EPIPE/ECONNRESET noise ([d94e4ba](https://github.com/spencermarx/open-code-review/commit/d94e4ba))
- **dashboard:** vitest resolves @open-code-review/cli/vendor-resume to source ([ee90acf](https://github.com/spencermarx/open-code-review/commit/ee90acf))
- **dashboard:** esbuild resolves @open-code-review/cli/* via source condition ([9765620](https://github.com/spencermarx/open-code-review/commit/9765620))
- **dashboard/server:** syncAgentSessions detects workflow_id + vendor_session_id changes ([3ce00c3](https://github.com/spencermarx/open-code-review/commit/3ce00c3))

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
- **dashboard:** use platform-safe subprocess calls ([8863cd2](https://github.com/spencermarx/open-code-review/commit/8863cd2))
- **dashboard:** move health endpoint above auth middleware ([beb9e89](https://github.com/spencermarx/open-code-review/commit/beb9e89))
- **dashboard:** resolve dev proxy port race condition ([fb9e4c6](https://github.com/spencermarx/open-code-review/commit/fb9e4c6))
- **platform:** add execBinaryAsync and enforce encoding in signatures ([c0b12d4](https://github.com/spencermarx/open-code-review/commit/c0b12d4))

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
- **dashboard:** integrate JSONL backup, port auto-retry, and Vite port discovery ([ba292e2](https://github.com/spencermarx/open-code-review/commit/ba292e2))

### 🩹 Fixes

- **dashboard:** accept any localhost origin in dev CORS ([b5b9ec7](https://github.com/spencermarx/open-code-review/commit/b5b9ec7))
- **dashboard:** extend CORS to 127.0.0.1 and document origin handling ([576c0f7](https://github.com/spencermarx/open-code-review/commit/576c0f7))
- **dashboard:** use 127.0.0.1 in Vite proxy targets for IPv4 match ([a1d9c39](https://github.com/spencermarx/open-code-review/commit/a1d9c39))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.9.0 (2026-03-24)

### 🚀 Features

- **agents:** add Nx VersionActions to sync plugin.json on release ([#16](https://github.com/spencermarx/open-code-review/issues/16))

### 🩹 Fixes

- **agents:** update plugin.json and SKILL.md versions to 1.8.4 ([#16](https://github.com/spencermarx/open-code-review/issues/16))
- **agents:** resolve TS errors in version-actions by using nx imports ([3a01b5e](https://github.com/spencermarx/open-code-review/commit/3a01b5e))
- **agents:** install @nx/devkit and use proper imports in version-actions ([39d9072](https://github.com/spencermarx/open-code-review/commit/39d9072))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.8.4 (2026-03-10)

### 🚀 Features

- **cli:** add `synthesis_counts` to `round-meta.json` schema for deduplicated post-synthesis finding counts
- **agents:** update orchestrator instructions to require `synthesis_counts` in round-complete JSON

### 🩹 Fixes

- **dashboard:** prefer `synthesis_counts` from `round-meta.json` over derived per-reviewer counts that double-count cross-reviewer findings

### 🧪 Tests

- **cli:** add `synthesis_counts` preference and fallback tests for `computeRoundCounts`

### ❤️ Thank You

- Spencer Marx
- claude-flow @agentic-org

## 1.8.3 (2026-03-10)

### 🩹 Fixes

- **cli:** fix `ocr --version` reporting stale version — bundle was not rebuilt before 1.8.1 publish

### ⚙️ CI

- **nx:** add `build` as dependency of `nx-release-publish` to prevent publishing stale bundles

### ❤️ Thank You

- Spencer Marx
- claude-flow @agentic-org

## 1.8.1 (2026-03-10)

### 🩹 Fixes

- **agents:** require post-synthesis categories in round-meta.json ([#7](https://github.com/spencermarx/open-code-review/issues/7))

### ❤️ Thank You

- claude-flow @agentic-org
- Spencer Marx

## 1.8.0 (2026-03-10)

### 🚀 Features

- **cli:** add local artifact version drift detection — warns when `.ocr/` files were installed by an older CLI version and suggests `ocr update` ([5520d50](https://github.com/spencermarx/open-code-review/commit/5520d50))
- **cli:** extract shared `CLI_VERSION` module for consistent version access across commands ([5520d50](https://github.com/spencermarx/open-code-review/commit/5520d50))
- **dashboard:** clean up server startup logs — aligned labels, tilde-shortened paths, removed noisy socket/auth banner ([5520d50](https://github.com/spencermarx/open-code-review/commit/5520d50))

### 📖 Docs

- add Team page screenshot to root and dashboard READMEs ([71720a4](https://github.com/spencermarx/open-code-review/commit/71720a4))

### ❤️ Thank You

- Spencer Marx
- claude-flow @agentic-org

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
