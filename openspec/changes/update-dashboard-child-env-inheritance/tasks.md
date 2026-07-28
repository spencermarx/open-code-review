# Tasks: update-dashboard-child-env-inheritance

## 1. Snapshot capture and distribution

- [x] 1.1 Capture the child-env snapshot in
      `packages/cli/src/commands/dashboard.ts` immediately before the
      `process.env.NODE_ENV = "production"` mutation: null-prototype copy,
      `Object.freeze`d, tagged `{ source: "cli-launch", capturedAt }`; update
      the `importModule` type and pass it to `startServer`
- [x] 1.2 Make `childEnvBase` a required `StartServerOptions` field; the dev
      direct-run auto-start path in `packages/dashboard/src/server/index.ts`
      constructs its own snapshot tagged `dev-direct-run` at entry
- [x] 1.3 Add the set-once holder module (`initChildEnvBase` throws on
      second call; `getChildEnvBase` throws before init, never falls back to
      `process.env`); wire `startServer` to init it exactly once
- [x] 1.4 Unit tests: freeze semantics (later writes throw), re-init throws,
      use-before-init throws, server keeps seeing `NODE_ENV=production`
      while the snapshot lacks it

## 2. The builder

- [x] 2.1 Rewrite `packages/dashboard/src/server/socket/env.ts`: delete
      `cleanEnv`; add pure `buildChildEnv(base, inject)` returning
      `{ env, removed, injected }` on a null-prototype object; deny rules
      applied to base, inject applied after; frozen `ALLOWED_INJECT_KEYS`
      runtime assertion; undefined inject values omitted from env and
      `injected`
- [x] 2.2 Implement the denylist constants with per-entry rationale
      comments: `OCR_` prefix; lowercase `npm_` prefix + `INIT_CWD` (POSIX);
      case-insensitive residue sub-namespaces (`npm_config_`,
      `npm_package_`, `npm_lifecycle_`, `npm_execpath`,
      `npm_node_execpath`), `OCR_`, `INIT_CWD`, `NODE_OPTIONS` (Windows);
      exact-case `NODE_OPTIONS` (POSIX)
- [x] 2.3 Add `describeChildEnvPosture()` generating human-readable posture
      text from the same constants
- [x] 2.4 Unit tests: provider vars pass through; `OCR_*` stripped, fresh
      inject survives; POSIX `NPM_TOKEN` preserved while `npm_config_*`
      stripped; `NODE_OPTIONS` stripped and reported; Windows case-variant
      matching (platform-parameterized); `__proto__` collision; unregistered
      inject key throws; removed/injected lists accurate

## 3. Spawn-site convergence

- [x] 3.1 Converge all spawn paths on `buildChildEnv` with the holder's
      snapshot: `claude-adapter.ts`, `opencode-adapter.ts` (replace
      `{ ...cleanEnv(), ...(opts.env ?? {}) }` spreads — inject goes through
      the builder, preserving the null prototype), `command-runner.ts`,
      `post-handler.ts`
- [x] 3.2 Fix the forward-resume sweep spawn in `server/index.ts` to pass
      the builder's env (today it inherits the full mutated dashboard env)
- [x] 3.3 Add ESLint `no-restricted-properties` ban on `process.env` scoped
      to the spawn modules; fix any fallout
- [x] 3.4 Adapter/unit tests: spawn env equals builder output; no spawn site
      reads `process.env`

## 4. Shared config layer

- [x] 4.1 Add `packages/shared/config/src/dashboard-config.ts` with
      `readDashboardConfig(ocrDir)` (typed `aiCli` with `"auto"` fallback;
      never throws; malformed-YAML stderr notice) and the boolean raw-YAML
      peek `sawRetiredEnvPassthrough`; export via package.json subpath
- [x] 4.2 Replace the regex `ai_cli` read in
      `services/ai-cli/index.ts` with the shared layer; wire the startup
      warn-once notice for the retired `env_passthrough` key
- [x] 4.3 Unit tests: parse/default/malformed cases; warn-once notice; key
      absent from `DashboardConfig` type

## 5. Observability

- [x] 5.1 Startup line: snapshot ISO-8601 timestamp, source, removed names,
      restart-remedy sentence
- [x] 5.2 Per-execution log header from the same `buildChildEnv` result:
      `env: shell snapshot <ts> (<source>) minus [...] plus [...]`
- [x] 5.3 Failure-time hint on nonzero child exit in the run-detail error
      surface: removed names, snapshot timestamp, restart remedy; explicit
      `NODE_OPTIONS` causality sentence when applicable
- [x] 5.4 `ocr doctor` posture section from `describeChildEnvPosture()`
      including the `env -u VAR ocr dashboard` hint and naming
      `NODE_OPTIONS` as the one intentional shell-parity break
- [x] 5.5 Tests: names-only invariant (no values in any surface); header
      derived from the actual spawn's builder result

## 6. Docs and template

- [x] 6.1 README: replace the dashboard env section with the two-sentence
      contract, the restart semantics, and the `env -u` hint
- [x] 6.2 `packages/agents/skills/ocr/assets/config.yaml` template: document
      `dashboard.ai_cli`; no env keys; run `nx run cli:update` to sync
- [x] 6.3 Changelog notes: the two parity-restoring narrowings (child
      `NODE_ENV`, forward-resume env); credit PR #56 (@thunderock) for the
      salvaged config-layer approach and env hardening

## 7. Verification

- [x] 7.1 `nx run-many -t typecheck` and `-t lint` green across all projects
- [x] 7.2 Full test suites for `dashboard`, `config`, `cli` green
- [x] 7.3 End-to-end smoke: export a non-allowlisted variable (e.g.
      `AWS_REGION`), start the dashboard, run a review child, verify the
      variable reaches the child, `NODE_ENV` does not, and the log header
      reports the delta
- [x] 7.4 `openspec validate update-dashboard-child-env-inheritance --strict`
      passes; production bundle builds
