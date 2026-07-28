# Change: Dashboard child processes inherit the launch shell environment

## Why

The dashboard spawns AI CLI, `gh`, and `ocr` child processes with a hardcoded
environment allowlist (`cleanEnv()` in
`packages/dashboard/src/server/socket/env.ts`). The list was never designed as
a threat model — it grew by whack-a-mole (`GH_TOKEN` added when PR posting
broke) — and every name it misses ships as a silent, misattributed failure:
OpenCode + Amazon Bedrock breaks because `AWS_BEARER_TOKEN_BEDROCK` /
`AWS_REGION` are stripped (issue #57), and proxies, `SSL_CERT_FILE`, and every
future provider are the next tickets. The failure class is "works in my shell,
fails in dashboard." The allowlist crosses no privilege boundary (same user,
same machine, children have filesystem read anyway) and forwards the most
sensitive credentials (`ANTHROPIC_API_KEY`, `GH_TOKEN`) while stripping
trivia, so it provides no real confidentiality. PR #56 proposed a
`dashboard.env_passthrough` config list; we are not merging it because it
promotes the undesigned sanitization posture into permanent public config API
and makes users maintain OCR's allowlist by filing tickets.

## What Changes

- Dashboard-spawned children inherit a **frozen snapshot of the launch shell
  environment**, captured in the CLI before the dashboard mutates
  `process.env` (notably `NODE_ENV=production` at
  `packages/cli/src/commands/dashboard.ts:83`), minus a small compiled-in
  denylist, plus explicitly registered per-spawn injections.
- The denylist is internal (no config key) and criteria-governed: OCR-owned
  namespace (`OCR_*`), spawner-lifecycle residue (`npm_*` lowercase residue,
  `INIT_CWD`), and named child-stability hazards (`NODE_OPTIONS`). Matching is
  exact-case on POSIX, case-insensitive on Windows.
- `cleanEnv()` and its module-level state are replaced by one pure builder,
  `buildChildEnv(base, inject)`, returning `{ env, removed, injected }`. Every
  spawn path converges on it — both AI CLI adapters, the command runner, the
  post handler's `gh` calls, and the forward-resume sweep (which today
  inherits the dashboard's full mutated env). Direct `process.env` access in
  spawn modules becomes a lint error.
- The snapshot is distributed via a set-once holder (throws on re-init and on
  use-before-init; never falls back to `process.env`); `startServer` takes a
  required `childEnvBase` parameter.
- Observability, names only (values never logged): startup line and
  per-execution log headers report the snapshot timestamp/source and the
  removed/injected names; nonzero child exits surface the removed list with a
  restart remedy; `ocr doctor` prints the posture.
- `dashboard.ai_cli` parsing moves from a regex over raw YAML into the shared
  config layer (`readDashboardConfig` in `@open-code-review/config`), and a
  `dashboard.env_passthrough` key — never merged or released, but present in
  PR #56 builds — is ignored with a single startup notice.
- **Zero new public config keys.** The escape hatch for subtracting a
  variable is the shell itself: `env -u VAR ocr dashboard`.

Behavior change is strictly loosening for users (Bedrock, Vertex, proxies,
custom CAs start working with no action). Two parity-restoring narrowings,
called out in the changelog: children stop seeing the dashboard-forced
`NODE_ENV=production`, and the forward-resume sweep stops inheriting the
dashboard's full mutated environment.

## Impact

- Affected specs: `dashboard` (new child-process environment requirements),
  `config` (dashboard settings parsing)
- Affected code:
  - `packages/cli/src/commands/dashboard.ts` (snapshot capture before
    `NODE_ENV` mutation; passes `childEnvBase` to `startServer`)
  - `packages/dashboard/src/server/index.ts` (required `childEnvBase` param,
    holder init, dev direct-run snapshot, forward-resume spawn env, startup
    line)
  - `packages/dashboard/src/server/socket/env.ts` (rewrite:
    `buildChildEnv`, denylist constants, `describeChildEnvPosture`)
  - `packages/dashboard/src/server/services/ai-cli/claude-adapter.ts`,
    `opencode-adapter.ts`, `socket/command-runner.ts`, `socket/post-handler.ts`
    (converge on the builder)
  - `packages/shared/config/src/dashboard-config.ts` (new: `readDashboardConfig`
    for `dashboard.ai_cli` + retired-key notice)
  - `packages/cli/src/commands/doctor.ts` (posture section)
  - root `eslint.config.mjs` (spawn-module `process.env` restriction)
- Not breaking for any released user: the current allowlist behavior was
  never a documented guarantee, and `env_passthrough` exists in no release
  tag.
- Credit: parts of PR #56 (@thunderock) are salvaged — the shared-config YAML
  parsing approach for `dashboard.ai_cli`, null-prototype/`__proto__` env
  hardening, env-name validation, and tests retargeted at `buildChildEnv`.
