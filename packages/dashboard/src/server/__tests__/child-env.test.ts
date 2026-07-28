import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  captureChildEnvBase,
  childEnv,
  childEnvFailureHint,
  formatChildEnvHeader,
  getChildEnvBase,
  initChildEnvBase,
  resetChildEnvBaseForTests,
} from '../child-env.js'

// Pins the "Single Frozen Snapshot With Set-Once Distribution" requirement:
// use-before-init and re-init are loud failures (never a silent fallback to
// the server's mutated process.env), the snapshot is frozen at registration,
// and the observability strings carry names only.

const BASE = {
  env: { PATH: '/usr/bin', AWS_REGION: 'us-west-2', NODE_OPTIONS: '--inspect' },
  source: 'cli-launch' as const,
  capturedAt: '2026-07-28T14:02:11.000Z',
}

beforeEach(() => {
  resetChildEnvBaseForTests()
})

afterEach(() => {
  resetChildEnvBaseForTests()
})

describe('child-env base holder', () => {
  it('throws on use before init, with no process.env fallback', () => {
    expect(() => getChildEnvBase()).toThrow(/not registered/)
    expect(() => childEnv()).toThrow(/not registered/)
  })

  it('throws on a second init', () => {
    initChildEnvBase(BASE)
    expect(() => initChildEnvBase(BASE)).toThrow(/set-once/)
  })

  it('freezes the registered snapshot so later writes throw', () => {
    initChildEnvBase(BASE)
    const { env } = getChildEnvBase()
    expect(() => {
      ;(env as NodeJS.ProcessEnv).INJECTED_LATER = 'x'
    }).toThrow()
  })

  it('builds child env from the registered base, not process.env', () => {
    process.env.CHILD_ENV_TEST_AMBIENT = 'should-not-leak'
    try {
      initChildEnvBase(BASE)
      const result = childEnv()
      expect(result.env.AWS_REGION).toBe('us-west-2')
      expect(result.env.CHILD_ENV_TEST_AMBIENT).toBeUndefined()
      expect(result.removed).toEqual(['NODE_OPTIONS'])
    } finally {
      delete process.env.CHILD_ENV_TEST_AMBIENT
    }
  })

  it('applies the closed inject channel through the builder', () => {
    initChildEnvBase(BASE)
    const result = childEnv({ OCR_DASHBOARD_EXECUTION_UID: 'uid-1' })
    expect(result.env.OCR_DASHBOARD_EXECUTION_UID).toBe('uid-1')
    expect(result.injected).toEqual(['OCR_DASHBOARD_EXECUTION_UID'])
  })

  it('captureChildEnvBase snapshots the current process.env, frozen', () => {
    process.env.CHILD_ENV_TEST_CAPTURE = 'v'
    try {
      const base = captureChildEnvBase('dev-direct-run')
      expect(base.env.CHILD_ENV_TEST_CAPTURE).toBe('v')
      expect(base.source).toBe('dev-direct-run')
      expect(Object.isFrozen(base.env)).toBe(true)
      // ISO-8601 with date — the staleness question needs the day.
      expect(base.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    } finally {
      delete process.env.CHILD_ENV_TEST_CAPTURE
    }
  })
})

describe('observability strings', () => {
  it('formats the per-execution header with names only', () => {
    initChildEnvBase(BASE)
    const header = formatChildEnvHeader(
      childEnv({ OCR_DASHBOARD_EXECUTION_UID: 'uid-1' }),
    )
    expect(header).toBe(
      'env: shell snapshot 2026-07-28T14:02:11.000Z (cli-launch) ' +
        'removed [NODE_OPTIONS] injected [OCR_DASHBOARD_EXECUTION_UID]',
    )
    expect(header).not.toContain('us-west-2')
    expect(header).not.toContain('uid-1')
  })

  it('failure hint carries removed names, timestamp, remedy, and NODE_OPTIONS causality', () => {
    initChildEnvBase(BASE)
    const hint = childEnvFailureHint()
    expect(hint).toContain('2026-07-28T14:02:11.000Z')
    expect(hint).toContain('removed: NODE_OPTIONS')
    expect(hint).toContain("restart 'ocr dashboard'")
    expect(hint).toContain('your shell sets NODE_OPTIONS')
    expect(hint).not.toContain('--inspect')
  })

  it('failure hint omits the causality sentence when NODE_OPTIONS was not set', () => {
    initChildEnvBase({ ...BASE, env: { PATH: '/usr/bin' } })
    const hint = childEnvFailureHint()
    expect(hint).not.toContain('your shell sets NODE_OPTIONS')
  })
})
