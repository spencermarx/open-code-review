# Dashboard Spec Delta — Child-Process Environment

## ADDED Requirements

### Requirement: Shell-Parity Child Environment Inheritance

Dashboard-spawned child processes SHALL receive the environment of the shell
that launched `ocr dashboard` — captured as a snapshot at launch — minus only
the internal denylist, plus only registered injections. This covers every
child-carrying spawn path: AI CLI adapters, utility commands (including the
team and config routes' `ocr`/`git` spawns), `gh` invocations, and
forward-resume spawns. Argument-only diagnostic probes (adapter `--version`
detection, the `ps` process-identity check) MAY use the ambient environment,
and each such exception SHALL carry a per-line lint suppression stating the
rationale at the call site. No public configuration key SHALL govern this
behavior.

#### Scenario: Provider variable flows through

- **GIVEN** the user's shell exports `AWS_BEARER_TOKEN_BEDROCK` and
  `AWS_REGION`
- **WHEN** the dashboard spawns an AI review child
- **THEN** the child's environment SHALL contain both variables with the
  shell's values

#### Scenario: Snapshot precedes dashboard mutation

- **GIVEN** the shell that ran `ocr dashboard` had no `NODE_ENV` set
- **WHEN** the dashboard (which sets `NODE_ENV=production` for itself)
  spawns any child
- **THEN** the child's environment SHALL have no `NODE_ENV`
- **AND** the server process SHALL continue to observe
  `NODE_ENV=production`

#### Scenario: Snapshot is frozen at launch

- **GIVEN** the dashboard is running and the user exports a new variable in
  a different shell
- **WHEN** a child is spawned
- **THEN** the child SHALL NOT receive the new variable
- **AND** the documented remedy (restart `ocr dashboard`) SHALL appear in
  the startup output and `ocr doctor`

### Requirement: Single Frozen Snapshot With Set-Once Distribution

The child-env base SHALL be captured once, frozen at capture (null-prototype
object, `Object.freeze`), and registered exactly once. No spawn path SHALL
read `process.env` directly or fall back to it; direct `process.env` access
in spawn modules SHALL be forbidden by lint. `startServer` SHALL require a
`childEnvBase` parameter carrying the snapshot, its source (`cli-launch` or
`dev-direct-run`), and its capture timestamp.

#### Scenario: Use before init fails loud

- **GIVEN** server wiring attempts to build a child env before the snapshot
  is registered
- **WHEN** the snapshot holder's getter is called
- **THEN** it SHALL throw
- **AND** no fallback to `process.env` SHALL occur

#### Scenario: Re-init rejected

- **GIVEN** the snapshot has been registered
- **WHEN** the holder's init function is called a second time
- **THEN** it SHALL throw

#### Scenario: Snapshot source is visible

- **GIVEN** the dashboard was started via `ocr dashboard`
- **WHEN** startup output and a per-execution log header are emitted
- **THEN** both SHALL identify the snapshot source as `cli-launch` and carry
  the full ISO-8601 capture timestamp

### Requirement: Internal Environment Denylist By Criteria

The child-env builder SHALL remove only entries admitted under one of three
criteria: OCR-owned namespace; spawner-lifecycle residue the interactive
shell never had; or a named child-stability hazard with a written failure
mode. The current entries are the `OCR_` prefix, lowercase `npm_` residue
(with Windows-specific residue sub-namespace matching), `INIT_CWD`, and
`NODE_OPTIONS`. Matching SHALL be exact-case on POSIX and case-insensitive on
Windows for every entry. Denylist additions SHALL require a spec amendment
naming the admitting criterion and the concrete failure mode.
Secret-shaped and third-party provider names are categorically inadmissible.

#### Scenario: OCR namespace stripped while deliberate injection survives

- **GIVEN** the dashboard's snapshot contains a stale
  `OCR_DASHBOARD_EXECUTION_UID`
- **WHEN** it spawns an AI workflow child with a fresh per-spawn UID
- **THEN** the child SHALL receive exactly the fresh UID, never the stale
  inherited value

#### Scenario: npm residue stripped, user npm auth preserved on POSIX

- **GIVEN** the dashboard was launched via a package-manager runner (env
  contains `npm_config_registry`, `npm_lifecycle_event`, `INIT_CWD`) and the
  shell exports `NPM_TOKEN`
- **WHEN** a child is spawned on a POSIX platform
- **THEN** `npm_config_registry`, `npm_lifecycle_event`, and `INIT_CWD`
  SHALL be absent from the child env
- **AND** `NPM_TOKEN` SHALL be present

#### Scenario: NODE_OPTIONS stripped and reported

- **GIVEN** the shell exports `NODE_OPTIONS=--inspect`
- **WHEN** a child is spawned
- **THEN** the child's env SHALL lack `NODE_OPTIONS`
- **AND** the per-execution log header's removed list SHALL contain
  `NODE_OPTIONS`

#### Scenario: Case variants handled per platform

- **GIVEN** a Windows snapshot contains a key spelled `Node_Options`
- **WHEN** a child is spawned
- **THEN** the child's env SHALL contain no case variant of `NODE_OPTIONS`
  and the removed list SHALL report it
- **AND** on POSIX a variable literally named `node_options` SHALL pass
  through untouched

### Requirement: Closed Child-Env Injection Channel

Every child-carrying spawn SHALL construct its environment through the
single builder function (documented argument-only probe exceptions per the
Shell-Parity requirement). Injected keys SHALL be limited to a
compile-time-frozen allowed set (currently `OCR_DASHBOARD_EXECUTION_UID`),
enforced by a runtime error at the builder. Injected entries with undefined
values SHALL be omitted from both the output env and the injected-names
list. No socket-, HTTP-, or agent-derived value SHALL become or override
child env. Lint SHALL flag both divergence vectors: direct `process.env`
reads in spawn modules, and spawn calls whose arguments omit `env`.

#### Scenario: Unregistered inject key rejected at runtime

- **GIVEN** a caller passes an inject object containing a key outside the
  allowed set (e.g. `GIT_DIR`)
- **WHEN** the builder executes
- **THEN** it SHALL throw before any spawn occurs

#### Scenario: Forward-resume spawn uses the builder

- **GIVEN** the liveness sweep resumes a workflow via `ocr review --resume`
- **WHEN** that child is spawned
- **THEN** its environment SHALL equal the builder's output for the launch
  snapshot — notably containing no dashboard-mutated `NODE_ENV` and no
  inherited `OCR_*` values

### Requirement: Names-Only Child-Env Observability

OCR surfaces SHALL record the removed and injected variable names — never
values — for each spawn, derived from the same computation that built the
env, with full ISO-8601 snapshot timestamps. On a nonzero child exit, the
run's error surface SHALL show the removed-names list, the snapshot
timestamp, and the restart remedy; when `NODE_OPTIONS` was removed and the
shell had it set, the hint SHALL state that dashboard children run without
it. `ocr doctor` SHALL print the current posture, including the
`env -u VAR ocr dashboard` subtraction hint, generated from the same
constants that drive the builder.

#### Scenario: Failure-time hint

- **GIVEN** a spawned child exits nonzero
- **WHEN** the user opens the run's detail in the dashboard
- **THEN** the error surface SHALL show the removed-names list, the full
  snapshot timestamp, and the restart remedy
- **AND** if `NODE_OPTIONS` was removed and set in the shell, a sentence
  SHALL state that dashboard children run without it

#### Scenario: Values never logged

- **GIVEN** any spawn with removed or injected variables
- **WHEN** OCR writes the startup line, log headers, doctor output, or error
  hints
- **THEN** only variable names SHALL appear, never their values
