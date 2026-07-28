// Flat ESLint config — SCOPED to exactly ONE job: enforce the module-boundary
// DAG. It is the CI-enforced version of the CLAUDE.md invariant "apps never
// depend on apps; shared depends only on shared" — the app->shared->shared
// (a.k.a. app→shared→shared) DAG, code-review SF#1 — keyed off the `scope:*`
// tags every project.json already carries.
//
// Deliberately minimal: we register ONLY `@nx/enforce-module-boundaries` and no
// typescript-eslint recommended set, so this stays a dependency-graph gate — not
// a repo-wide style lint that would flag thousands of pre-existing issues. Add
// other rules in a separate, intentional change if/when the team wants them.
//
// Single-axis by design: every project carries both `scope:*` and `type:*` tags
// (e.g. type:app / type:e2e / type:util / type:assets), but these constraints
// consume only `scope:*`. That is sufficient for this invariant; future rules
// (e.g. "apps may not depend on tests") can grow into the `type:*` axis.
//
// A behavioral canary (packages/shared/platform/src/__tests__/
// module-boundary-gate.test.ts) runs ESLint on a planted violation and asserts
// the rule fires — so an option rename, an error->warn downgrade, or a widened
// allow-list cannot silently disarm this gate.

import nx from '@nx/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.ocr/**',
      '**/vendor/**',
      '**/*.config.{js,mjs,cjs,ts,mts,cts}',
      // NOTE: agent *assets* (markdown/JSON under packages/agents/{commands,
      // skills}) are excluded simply by not matching the `.ts` `files` glob
      // below — we deliberately do NOT blanket-ignore `packages/agents/**`, so
      // the one real TS file there (release/version-actions.ts) IS boundary-
      // checked and a future workspace import from it cannot slip the gate.
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module' },
    },
    // `@nx` carries the boundary rule. `@typescript-eslint` and `react-hooks`
    // are registered ONLY so the codebase's existing, intentional inline
    // `eslint-disable` directives (e.g. `react-hooks/exhaustive-deps`,
    // `@typescript-eslint/no-unused-vars`) resolve to a known rule — their rule
    // SUITES are deliberately NOT enabled here. (The lone `no-control-regex`
    // directive in persistence is a CORE rule, always defined, so it needs no
    // plugin.) `reportUnusedDisableDirectives: 'off'` keeps those now-inert
    // suppressions from being flagged; turning the suites on — and re-enabling
    // unused-directive reporting — is a separate, intentional change.
    plugins: { '@nx': nx, '@typescript-eslint': tsPlugin, 'react-hooks': reactHooks },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          // Both options are the rule's defaults, stated explicitly:
          // `allow: []` — no per-import escape hatches; `enforceBuildableLib...`
          // is irrelevant here (source-only inlined libs, no buildable-lib graph).
          enforceBuildableLibDependency: false,
          allow: [],
          // This gate enforces the dependency *DAG* (app->shared->shared), not
          // lazy-load discipline. The CLI intentionally `await import()`s
          // `@open-code-review/persistence` on hot paths (e.g. `progress`) to
          // defer the `node:sqlite` load while static-importing it elsewhere;
          // exempt our workspace libs from the "static import of a lazy-loaded
          // library" check so that legitimate mix is not flagged here. Enforcing
          // lazy-load consistency is a separate, intentional change.
          checkDynamicDependenciesExceptions: ['@open-code-review/.*'],
          // NB: the `app -> app` prohibition is enforced by TWO layers — these
          // allow-lists AND the rule's `projectType: "application"` default
          // (which yields the "Imports of apps are forbidden" message). Today a
          // `dashboard -> cli` import trips both; degrading the gate would
          // require changing both. The canary test re-validates the combination.
          depConstraints: [
            // Shared libraries may depend ONLY on other shared libraries —
            // never on an application. Keeps the graph a DAG of app -> shared.
            { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
            // The CLI app bundles the agent assets and the shared libs; it must
            // NOT depend on the dashboard app. (`scope:cli` also covers cli-e2e.)
            {
              sourceTag: 'scope:cli',
              onlyDependOnLibsWithTags: ['scope:cli', 'scope:shared', 'scope:agents'],
            },
            // The dashboard app depends on shared libs only; it must NOT depend
            // on the CLI app (the inverted edge this PR's predecessor removed).
            // (`scope:dashboard` also covers dashboard-{api,ui}-e2e.)
            {
              sourceTag: 'scope:dashboard',
              onlyDependOnLibsWithTags: ['scope:dashboard', 'scope:shared'],
            },
            // Agent assets are leaf content — no workspace dependencies.
            { sourceTag: 'scope:agents', onlyDependOnLibsWithTags: ['scope:agents'] },
            // e2e packages currently share their target app's `scope:*`; introduce
            // a `scope:e2e` tag + constraint here if they ever need distinct rules.
          ],
        },
      ],
    },
  },
  {
    // Child-env convergence gate, part 1 (dashboard child-process environment
    // spec): spawn modules must build child env through the child-env builder
    // from the frozen launch snapshot — never from ambient `process.env`,
    // which inside the server is the MUTATED env (NODE_ENV=production) and
    // would silently reopen the leak this posture closes. The dashboard's
    // `child-env.ts` holder is deliberately NOT listed: its capture function
    // is the single sanctioned read. `server/index.ts` is also not listed —
    // it legitimately reads server config (PORT, NODE_ENV) — which is why
    // part 2 below exists: the spawn-shape rule covers it.
    files: [
      'packages/dashboard/src/server/services/ai-cli/claude-adapter.ts',
      'packages/dashboard/src/server/services/ai-cli/opencode-adapter.ts',
      'packages/dashboard/src/server/services/ai-cli/helpers.ts',
      'packages/dashboard/src/server/socket/command-runner.ts',
      'packages/dashboard/src/server/socket/post-handler.ts',
      // routes/team.ts joins the ban; routes/config.ts cannot — it
      // legitimately reads process.env for IDE detection. Its spawn is
      // covered by the spawn-shape rule (part 2) instead.
      'packages/dashboard/src/server/routes/team.ts',
      'packages/shared/platform/src/child-env.ts',
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module' },
    },
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Spawn modules must not read process.env — build child env via ' +
            'the child-env holder/builder (frozen launch-shell snapshot).',
        },
      ],
    },
  },
  {
    // Child-env convergence gate, part 2: the vector that actually reopens
    // the leak is OMITTING `env` on a spawn call (the child then inherits
    // the server's mutated process.env) — which references no process.env
    // token and so cannot be caught by the property ban above. This rule
    // flags any platform spawn/exec call in the dashboard server whose
    // arguments carry no `env` property. Deliberate ambient spawns
    // (argument-only probes like `--version` and `ps`) carry a per-line
    // disable naming the rationale, which is exactly the visibility the
    // spec's documented-exception clause requires.
    files: ['packages/dashboard/src/server/**/*.ts'],
    ignores: ['packages/dashboard/src/server/**/__tests__/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module' },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Vector 1: a spawn with NO env anywhere in its arguments —
          // catches the missing-options and options-without-env spellings.
          selector:
            'CallExpression[callee.name=/^(spawnBinary|execBinary|execBinaryAsync)$/]' +
            ':not(:has(ObjectExpression Property[key.name="env"]))',
          message:
            'Dashboard child spawns must pass env from the child-env builder ' +
            '(env: childEnv().env). If this spawn deliberately uses the ' +
            'ambient env (argument-only probe), add a per-line disable with ' +
            'the rationale.',
        },
        {
          // Vector 2 (options-scoped): an options OBJECT lacking `env` even
          // when an unrelated nested `env:` key elsewhere in the arguments
          // would satisfy vector 1's broad :has — the false-negative mode
          // the round-2 review demonstrated. Both are pinned by the canary
          // in packages/shared/platform/src/__tests__/child-env-gate.test.ts.
          selector:
            'CallExpression[callee.name=/^(spawnBinary|execBinary|execBinaryAsync)$/]' +
            ' > ObjectExpression:not(:has(> Property[key.name="env"]))',
          message:
            'This spawn options object has no env property — pass env from ' +
            'the child-env builder (env: childEnv().env), or add a per-line ' +
            'disable with the rationale for a deliberate ambient probe.',
        },
      ],
    },
  },
]
