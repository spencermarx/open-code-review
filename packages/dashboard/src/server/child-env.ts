/**
 * Child-env base holder — set-once distribution of the frozen launch-shell
 * snapshot to every spawn path.
 *
 * The snapshot is captured BEFORE the dashboard mutates its own
 * `process.env` (the CLI sets `NODE_ENV=production` pre-import), so children
 * see the shell's true environment. Distribution is deliberately rigid:
 * `initChildEnvBase` throws on a second call, `getChildEnvBase` throws
 * before init and NEVER falls back to `process.env` — wrong-order wiring is
 * a startup crash, not a silent leak of the mutated server env. This module
 * replaces the previous module-level allowlist (`cleanEnv`) and is the only
 * sanctioned `process.env` read on the spawn side (the dev direct-run
 * capture below); spawn modules themselves are lint-banned from touching it.
 */

import {
  buildChildEnv,
  type ChildEnvInject,
  type ChildEnvResult,
} from '@open-code-review/platform'

export type ChildEnvSource = 'cli-launch' | 'dev-direct-run'

export type ChildEnvBase = {
  env: Readonly<NodeJS.ProcessEnv>
  source: ChildEnvSource
  /** Full ISO-8601 — dashboards run for days; a time-only stamp cannot
   *  answer the staleness question it exists to answer. */
  capturedAt: string
}

let registered: ChildEnvBase | null = null

/**
 * Freeze a null-prototype copy of `env` so any later write from any module
 * throws in strict mode instead of silently mutating the contract between
 * spawns. Idempotent over already-clean inputs.
 */
function freezeEnvCopy(env: Readonly<NodeJS.ProcessEnv>): Readonly<NodeJS.ProcessEnv> {
  const copy = Object.assign(Object.create(null), env) as NodeJS.ProcessEnv
  return Object.freeze(copy)
}

/**
 * Capture the current `process.env` as a child-env base. The CLI launch path
 * captures before its `NODE_ENV` mutation and passes the result through
 * `startServer`; the dev direct-run path calls this at entry. This is the
 * single sanctioned `process.env` read on the spawn side.
 */
export function captureChildEnvBase(source: ChildEnvSource): ChildEnvBase {
  return {
    env: freezeEnvCopy(process.env),
    source,
    capturedAt: new Date().toISOString(),
  }
}

/** Register the base exactly once. Throws on a second call. */
export function initChildEnvBase(base: ChildEnvBase): void {
  if (registered !== null) {
    throw new Error(
      'child-env base already registered — initChildEnvBase is set-once',
    )
  }
  registered = { ...base, env: freezeEnvCopy(base.env) }
}

/** The registered base. Throws before init; never falls back to process.env. */
export function getChildEnvBase(): ChildEnvBase {
  if (registered === null) {
    throw new Error(
      'child-env base not registered — a spawn path ran before startServer ' +
        'wiring; there is deliberately no fallback to process.env',
    )
  }
  return registered
}

/**
 * Build a child env from the registered base. The one entry point every
 * dashboard spawn path uses (adapters, command runner, gh posting,
 * forward-resume).
 */
export function childEnv(inject?: ChildEnvInject): ChildEnvResult {
  const base = getChildEnvBase()
  return buildChildEnv(base.env, inject)
}

/**
 * One-line env provenance for a per-execution log file, computed from the
 * same builder call that produced the spawn's env — the filtering is the
 * instrument; there is no parallel bookkeeping to drift. Names only.
 */
export function formatChildEnvHeader(result: ChildEnvResult): string {
  const base = getChildEnvBase()
  const minus = result.removed.length > 0 ? result.removed.join(', ') : 'none'
  const plus = result.injected.length > 0 ? result.injected.join(', ') : 'none'
  return `env: shell snapshot ${base.capturedAt} (${base.source}) minus [${minus}] plus [${plus}]`
}

/**
 * Diagnostic sentence(s) for a nonzero child exit: what was removed, when
 * the snapshot was taken, and the remedy. States `NODE_OPTIONS` causality
 * explicitly when the launch shell had it set — the one denylist entry that
 * can carry deliberate user intent.
 */
export function childEnvFailureHint(): string {
  const base = getChildEnvBase()
  const { removed } = buildChildEnv(base.env)
  const lines = [
    `child env: shell snapshot ${base.capturedAt}${
      removed.length > 0 ? `; removed: ${removed.join(', ')}` : ''
    } — variables exported after that are invisible to children; ` +
      `restart 'ocr dashboard' to pick them up.`,
  ]
  if (removed.includes('NODE_OPTIONS')) {
    lines.push(
      'your shell sets NODE_OPTIONS; dashboard children run without it.',
    )
  }
  return lines.join('\n')
}

/** Test-only: clear the registered base so holder semantics are testable. */
export function resetChildEnvBaseForTests(): void {
  registered = null
}
