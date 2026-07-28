/**
 * Fitness-function self-test for the child-env convergence gate (round-2
 * review should-fix): proves the `no-restricted-syntax` spawn-shape rules in
 * the root `eslint.config.mjs` are actually ARMED. Round 1 of the PR-58
 * review found, verbatim, a lint gate that could not enforce its claim — a
 * gate verified only at authoring time can rot back into a no-op (selector
 * typo, error→warn downgrade, glob drift) while CI stays green. Mirrors
 * `module-boundary-gate.test.ts`.
 *
 * Cases pinned:
 *  - an env-less spawn in the dashboard server FAILS (vector 1);
 *  - an options object without `env` FAILS even when an unrelated nested
 *    `env:` key would satisfy the broad :has (vector 2 — the false-negative
 *    mode the round-2 review demonstrated);
 *  - a builder-compliant spawn PASSES;
 *  - the documented-exception mechanism (per-line disable) PASSES.
 *
 * The part-1 `no-restricted-properties` ban is file-list-scoped to real,
 * always-linted files, so a regression there fails CI lint directly; its
 * disarm case is covered by the config-shape assertion at the bottom.
 */

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { writeFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const require = createRequire(import.meta.url)
const REPO_ROOT = resolve(import.meta.dirname, '../../../../..')

function resolveEslintEntry(): string {
  try {
    return join(dirname(require.resolve('eslint/package.json')), 'bin/eslint.js')
  } catch {
    return resolve(REPO_ROOT, 'node_modules/eslint/bin/eslint.js')
  }
}
const ESLINT_JS = resolveEslintEntry()

// Planted files must live inside the dashboard server tree so the
// spawn-shape rules' `files` glob picks them up.
const DASHBOARD_SRC = resolve(REPO_ROOT, 'packages/dashboard/src/server')

type LintResult = { code: number; output: string }

function lintSnippet(fileName: string, contents: string): LintResult {
  const file = join(DASHBOARD_SRC, fileName)
  writeFileSync(file, contents)
  try {
    execFileSync(process.execPath, [ESLINT_JS, file], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      env: { ...process.env, NX_DAEMON: 'false' },
    })
    return { code: 0, output: '' }
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer; stderr?: Buffer }
    return {
      code: e.status ?? 1,
      output: `${e.stdout?.toString() ?? ''}\n${e.stderr?.toString() ?? ''}`,
    }
  } finally {
    rmSync(file, { force: true })
  }
}

describe('child-env spawn-shape gate is armed', () => {
  it('FAILS on an env-less spawn (vector 1)', () => {
    const result = lintSnippet(
      '__child_env_canary_envless__.ts',
      "import { spawnBinary } from '@open-code-review/platform'\n" +
        "spawnBinary('ocr', ['--version'], { cwd: '/tmp' })\n",
    )
    expect(result.code).not.toBe(0)
    expect(result.output).toMatch(/no-restricted-syntax/)
  }, 60_000)

  it('FAILS on an options object without env despite a nested env key elsewhere (vector 2)', () => {
    const result = lintSnippet(
      '__child_env_canary_nested__.ts',
      "import { execBinary } from '@open-code-review/platform'\n" +
        "execBinary('ocr', ['team', 'set'], {\n" +
        "  cwd: '/tmp',\n" +
        '  input: JSON.stringify({ env: 1 }),\n' +
        '})\n',
    )
    expect(result.code).not.toBe(0)
    expect(result.output).toMatch(/no-restricted-syntax/)
  }, 60_000)

  it('PASSES on a builder-compliant spawn', () => {
    const result = lintSnippet(
      '__child_env_canary_ok__.ts',
      "import { spawnBinary } from '@open-code-review/platform'\n" +
        "spawnBinary('ocr', ['--version'], { cwd: '/tmp', env: {} })\n",
    )
    expect(result.code, result.output).toBe(0)
  }, 60_000)

  it('PASSES on a documented per-line exception', () => {
    const result = lintSnippet(
      '__child_env_canary_disabled__.ts',
      "import { execBinary } from '@open-code-review/platform'\n" +
        '// Deliberate ambient spawn: canary for the documented-exception path.\n' +
        '// eslint-disable-next-line no-restricted-syntax\n' +
        "execBinary('ps', ['-p', '1'], { cwd: '/tmp' })\n",
    )
    expect(result.code, result.output).toBe(0)
  }, 60_000)
})

describe('child-env process.env ban is configured', () => {
  it('keeps the part-1 rule at error severity over the spawn modules', async () => {
    const config = (await import(
      /* @vite-ignore */ resolve(REPO_ROOT, 'eslint.config.mjs')
    )) as { default: Array<Record<string, unknown>> }
    const block = config.default.find(
      (b) =>
        typeof b === 'object' &&
        b !== null &&
        'rules' in b &&
        (b.rules as Record<string, unknown>)['no-restricted-properties'] !==
          undefined &&
        Array.isArray(b.files) &&
        (b.files as string[]).some((f) => f.includes('command-runner.ts')),
    )
    expect(block, 'part-1 process.env ban block missing').toBeDefined()
    const rule = (block!.rules as Record<string, unknown>)[
      'no-restricted-properties'
    ] as [string, { object: string; property: string }]
    expect(rule[0]).toBe('error')
    expect(rule[1]).toMatchObject({ object: 'process', property: 'env' })
    expect(block!.files as string[]).toEqual(
      expect.arrayContaining([
        expect.stringContaining('routes/team.ts'),
        expect.stringContaining('post-handler.ts'),
      ]),
    )
  })
})
