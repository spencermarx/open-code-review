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
  freezeEnvSnapshot,
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
 * Capture the current `process.env` as a child-env base. The CLI launch path
 * captures before its `NODE_ENV` mutation and passes the result through
 * `startServer`; the dev direct-run path calls this at entry. This is the
 * single sanctioned `process.env` read on the spawn side. The freeze
 * primitive lives in the platform package so the CLI's capture and this one
 * cannot diverge.
 */
export function captureChildEnvBase(source: ChildEnvSource): ChildEnvBase {
  return {
    env: freezeEnvSnapshot(process.env),
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
  // Defensive re-freeze: the invariant survives a caller that skipped it.
  registered = { ...base, env: freezeEnvSnapshot(base.env) }
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
 * One-line env provenance for a per-execution log file, formatted from the
 * SAME builder result that spawned the child — the filtering is the
 * instrument; there is no parallel bookkeeping to drift. Names only.
 * Vocabulary ("shell snapshot", "removed", "injected") is shared with the
 * startup line and failure hint so the three surfaces correlate directly.
 */
export function formatChildEnvHeader(result: ChildEnvResult): string {
  const base = getChildEnvBase()
  const removed = result.removed.length > 0 ? result.removed.join(', ') : 'none'
  const injected =
    result.injected.length > 0 ? result.injected.join(', ') : 'none'
  return `env: shell snapshot ${base.capturedAt} (${base.source}) removed [${removed}] injected [${injected}]`
}

/**
 * Diagnostic sentence(s) for a nonzero child exit: what was removed, when
 * the snapshot was taken, and the remedy. States `NODE_OPTIONS` causality
 * explicitly when the launch shell had it set — the one denylist entry that
 * can carry deliberate user intent.
 *
 * Recomputes the builder result rather than reusing the spawn's (which is
 * out of scope at the close handler): `removed` is a deterministic function
 * of the frozen base and the compiled-in constants, so the recomputation is
 * identical by construction. Injections are deliberately not reported here —
 * they are irrelevant to a "why didn't my variable reach the child"
 * diagnosis (they only ever ADD the execution UID).
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
