# Design: Dashboard child-process environment posture

Distilled from an architecture-board deliberation (four perspectives: lead
architect, CLI/terminal engineering, evolutionary-design, and
simplicity-first) over web precedents (VS Code shell-environment resolution,
direnv/mise, sudo `env_keep` / sshd `AcceptEnv` / httpoxy, MCP-client env
sanitization complaints, Codex CLI's reversed secret-stripping experiment)
plus a codebase brief. All positions independently converged on the core
design; contested points and dispositions are recorded below.

## Two-sentence contract (verbatim for docs)

Reviews launched from the dashboard see the same environment as the shell
where you ran `ocr dashboard` — if it works in your shell, it works in the
dashboard. OCR removes only its own `OCR_*` internals, npm's script-lifecycle
plumbing your shell never had (`npm_*` and `INIT_CWD`), and `NODE_OPTIONS`,
and every run's log records exactly what was removed.

## Threat model

Environment filtering is a real security control only where the environment's
writer is less trusted than its reader (sudo's uid transition, sshd's
remote-to-local `AcceptEnv`, httpoxy's header-to-env bridge). The
dashboard-to-child spawn crosses no such boundary: same user, same machine,
and the children already have unrestricted filesystem read as that user
(`~/.aws/credentials` is one `Read` away). Env stripping therefore provides no
confidentiality — and the current allowlist concedes this by forwarding
`ANTHROPIC_API_KEY` and `GH_TOKEN` while stripping `AWS_REGION`. The
dashboard's real security gates are unchanged by this design: the
127.0.0.1-only bind, the per-startup random bearer token on every API route
and socket handshake, localhost-only CORS, the socket command whitelist,
prompt-over-stdin (never argv), and the AI CLI's own tool-permission layer.

What env handling here legitimately defends — and all it defends:

1. **The injection boundary** (the only invariant with real security
   content): no request-derived data — socket payload, HTTP field, or agent
   output — may ever become or override a child's environment (httpoxy /
   GitHub Actions `set-env` lesson). Enforced structurally, not by review.
2. **Self-pollution**: a stale inherited `OCR_DASHBOARD_EXECUTION_UID`
   mis-links workflow rows; OCR's coordination namespace must never leak
   ambiently.
3. **Child stability**: `npm_*` lifecycle residue, `INIT_CWD`, and
   `NODE_OPTIONS` (inspector-port storms across concurrent node children,
   silent `--require` warping) demonstrably break children.

Explicit non-guarantees, so nobody later depends on one: this is not a
secret-confidentiality boundary, not a sandbox, and not protection against a
hostile local user (none exists in the model). Secret exposure in logs is a
sink property addressed at log rendering, never by starving the child of
credentials (Codex CLI ran the starve-by-default experiment and reversed it
after harvesting silent auth failures).

## The design

### Snapshot capture and distribution

- `packages/cli/src/commands/dashboard.ts` captures the child-env base
  immediately **before** the `process.env.NODE_ENV = "production"` mutation:
  a null-prototype copy, `Object.freeze`d at capture. Children see the
  shell's true `NODE_ENV` (usually unset); server code keeps seeing
  `production`. A unit test pins both readings.
- `startServer` takes a **required** parameter
  `childEnvBase: { env, source: "cli-launch" | "dev-direct-run", capturedAt }`.
  The dev direct-run path (auto-start at the bottom of `server/index.ts`)
  constructs its own snapshot at entry — there is no forget-the-param path
  that silently falls back to the mutated `process.env`; the compiler rejects
  it.
- A tiny holder module distributes it: `initChildEnvBase(snapshot)` throws on
  a second call; `getChildEnvBase()` throws before init and never falls back
  to `process.env`. Wrong-order wiring is a startup crash, not a silent leak.
  The startup line and per-execution log headers name the snapshot source.

### One pure builder

`cleanEnv()`, and any module-level mutable env state, are deleted. One pure
function replaces them:

```ts
export type ChildEnvResult = {
  env: NodeJS.ProcessEnv;          // null-prototype (__proto__-safe)
  removed: readonly string[];      // names only, never values
  injected: readonly string[];
};
export function buildChildEnv(
  base: Readonly<NodeJS.ProcessEnv>,
  inject?: Readonly<{ OCR_DASHBOARD_EXECUTION_UID?: string }>,
): ChildEnvResult;
```

- Deny rules apply to `base`; `inject` applies **after** the deny step, so
  ambient stale `OCR_*` dies while deliberate per-spawn injection survives.
- The inject channel is doubly closed: a closed TypeScript type for
  authoring, plus a runtime assertion that every inject key is in a frozen
  `ALLOWED_INJECT_KEYS = ['OCR_DASHBOARD_EXECUTION_UID']` — the builder
  throws otherwise (types erase; the throw does not). An inject entry with an
  `undefined` value passes the membership check and is omitted from both the
  output env and the `injected` list, matching Node's spawn-env handling.
- Deny constants are compiled into the builder — not a parameter, not
  exported as levers. A read-only `describeChildEnvPosture()` generates the
  doctor/startup/log-header text from the same constants so prose can never
  drift from behavior.
- Every child-carrying spawn path converges on the builder: both adapters,
  the command runner (both paths), the post handler's `gh` calls, the team
  and config routes' `ocr`/`git` spawns, and the forward-resume sweep
  (today a full-mutated-env leak). Documented exceptions, each carrying a
  per-line lint disable naming the rationale: the adapter `--version`
  detection probes and the `ps` process-identity probe — argument-only
  diagnostics that read nothing env-derived.
- Enforcement is two-part, matching the two ways the leak can reopen:
  (1) an ESLint `no-restricted-properties` ban on `process.env` reads in
  the spawn modules, and (2) an ESLint `no-restricted-syntax` rule over the
  whole dashboard server flagging any `spawnBinary`/`execBinary`/
  `execBinaryAsync` call whose arguments carry no `env` property — the
  omission vector that the property ban structurally cannot see. A new
  divergent spawn site fails at lint time on one rule or the other, or
  carries a visible per-line disable stating why it is exempt.

### Denylist contents (internal, criteria-governed)

Membership criteria — (a) OCR-owned namespace, (b) spawner-lifecycle residue
the interactive shell never had, (c) a named child-stability hazard with a
written failure mode. Never confidentiality, never secret-shaped names, never
third-party provider names. Matching: exact-case on POSIX (a POSIX variable
literally named `node_options` is unread by Node; stripping it would violate
shell parity), case-insensitive on Windows (env names are case-insensitive
there; an exact-case deny would void the guarantee on a case variant).

| Entry | Criterion | Rationale |
|---|---|---|
| `OCR_` prefix | (a) | Stale `OCR_DASHBOARD_EXECUTION_UID` mis-links workflow rows; deliberate injections return via the closed inject channel |
| `npm_` prefix (lowercase-only on POSIX); residue sub-namespaces (`npm_config_`, `npm_package_`, `npm_lifecycle_`, `npm_execpath`, `npm_node_execpath`) case-insensitively on Windows | (b) | npm/pnpm/yarn inject lowercase lifecycle residue; stripping it restores shell parity. User-authored uppercase `NPM_TOKEN` / `NPM_CONFIG_*` pass through on POSIX (stripping them would 401 registry auth). On Windows the collision is undecidable and documented |
| `INIT_CWD` | (b) | npm launch residue outside the `npm_` prefix; nested npm resolves against the wrong directory |
| `NODE_OPTIONS` | (c) | Injects flags into every node child; inherited `--inspect` collides inspector ports across concurrent reviewers; `--require` warps behavior invisibly. VS Code `removeDangerousEnvVariables` precedent |

Everything else passes through untouched, forever: `AWS_*`, `HTTPS_PROXY`,
`SSL_CERT_FILE`, `NODE_EXTRA_CA_CERTS`, `GOOGLE_APPLICATION_CREDENTIALS`,
`DEBUG`, `NPM_TOKEN` — no per-provider maintenance. Denylist additions
require a spec amendment naming the admitting criterion and the concrete
failure mode; a casual patch is not a valid path in.

`NODE_OPTIONS` is the one entry that can carry deliberate user intent
(`--max-old-space-size`). The strip stands (the hazard is real and named),
docs/doctor name it as the single intentional shell-parity break, the
failure-time hint states causality explicitly when it applies, and a
demonstrated support case is the pre-approved trigger for revisiting the
entry. No remedy mechanism is sketched in advance.

### Observability (names only; values never logged)

- Startup line: snapshot timestamp (full ISO-8601 — dashboards run for
  days), source, removed names, and the restart remedy sentence.
- Per-execution log header: `env: shell snapshot <ts> (<source>) minus [...]
  plus [...]`, computed by the same `buildChildEnv` call that spawned the
  child — the filtering is the instrument; no parallel bookkeeping to drift.
- Failure-time hint: on nonzero child exit, the run-detail error surface
  shows the removed list, snapshot timestamp, and remedy; when
  `NODE_OPTIONS` was removed and the shell had it set, the hint states
  causality. A "works in shell, fails in dashboard" report is diagnosable
  from the error surface without reading source.
- `ocr doctor`: prints the posture from `describeChildEnvPosture()`, the
  restart hint, and the `env -u VAR ocr dashboard` subtraction hint.

### Restart semantics

The base is captured once at launch and frozen. A variable exported in a new
shell tab is invisible to children until restart — stated on the startup
line, in doctor, and in docs, not machined around. The single-instance
takeover behavior means the user's instinctive move (running `ocr dashboard`
again) refreshes the snapshot. Per-spawn live re-reads were rejected: the
server's env cannot change post-fork anyway, so re-reading adds
nondeterminism without capability.

## Alternatives considered

- **PR #56's `dashboard.env_passthrough` name list** — rejected: promotes an
  undesigned posture into permanent public API; users maintain OCR's
  allowlist by filing tickets; the knob has nothing to do once the default
  is right.
- **Opt-in strict/hermetic mode** — rejected unanimously: no user has a
  threat model it serves (same-uid children with filesystem read defeat it);
  it is confidentiality theater as permanent API. Addable later, additively,
  if a real isolation boundary (sandboxed or remote runner) materializes; no
  API shape is sketched, deliberately.
- **Policy as a builder parameter** — rejected: a degree of freedom with
  exactly one value in the program, and the precise seam through which a
  future `env_policy` key would un-decide zero-config without tripping
  review.
- **Name-pattern secret redaction of child logs in this change** — rejected:
  name-matching cannot catch a child echoing a secret's value, so it ships
  false confidence. Any future redaction feature must be value-based
  masking; until then OCR surfaces log names only and per-execution log
  files remain mode 0o600.
- **VS Code-style `$SHELL -ilc` shell-env resolution** — not needed: the
  only launch path is a user shell. If a GUI/daemon launcher ever ships,
  shell-env capture at startup is the pre-named remedy — never a per-var
  config list.

## Migration

- Strictly loosening for users; no released version ever shipped
  `env_passthrough` (PR #56 was never merged — verified against `main`:
  `dashboard-config.ts` does not exist there and no `env_passthrough`
  reference is present; an earlier board-record claim that it was on `main`
  was an artifact of verifying while the PR branch was checked out).
- Two parity-restoring narrowings, changelog-called-out: children stop
  seeing the dashboard-forced `NODE_ENV=production`; the forward-resume
  sweep stops inheriting the full mutated dashboard env.
- Courtesy for anyone who installed a PR #56 build: a
  `dashboard.env_passthrough` key in `.ocr/config.yaml` produces exactly one
  startup notice ("no longer needed … inherited automatically … the key is
  ignored and can be deleted"), never an error, and does not appear in the
  `DashboardConfig` type (a raw-YAML peek returns only a boolean).
- PR #56 salvage, with credit: the shared-config YAML parsing approach for
  `dashboard.ai_cli` (replacing the regex-on-YAML hack), null-prototype /
  `__proto__` env hardening, env-name validation, and tests retargeted at
  `buildChildEnv`.
