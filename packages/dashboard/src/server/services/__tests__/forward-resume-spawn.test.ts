import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ChildProcess } from 'node:child_process'

vi.mock('@open-code-review/platform', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return { ...original, spawnBinary: vi.fn() }
})

import { spawnBinary } from '@open-code-review/platform'
import { makeSpawnResume } from '../forward-resume-spawn.js'
import {
  initChildEnvBase,
  resetChildEnvBaseForTests,
} from '../../child-env.js'

const spawnMock = vi.mocked(spawnBinary)

let fakeChild: { on: ReturnType<typeof vi.fn>; unref: ReturnType<typeof vi.fn> }

// Pins the spec scenario "Forward-resume spawn uses the builder": the sweep's
// resume child receives the frozen launch-snapshot env — no dashboard-mutated
// NODE_ENV, no ambient OCR_* — not the server's process.env. This was the one
// builder-converged spawn site with no automated guard (round-1 review).
describe('makeSpawnResume', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetChildEnvBaseForTests()
    initChildEnvBase({
      env: {
        PATH: '/usr/bin',
        AWS_REGION: 'us-west-2',
        OCR_DASHBOARD_EXECUTION_UID: 'stale-ambient',
        NODE_OPTIONS: '--inspect',
      },
      source: 'cli-launch',
      capturedAt: '2026-07-28T00:00:00.000Z',
    })
    fakeChild = { on: vi.fn(), unref: vi.fn() }
    spawnMock.mockReturnValue(fakeChild as unknown as ChildProcess)
  })

  afterEach(() => {
    resetChildEnvBaseForTests()
  })

  it('spawns ocr review --resume with the builder env, detached from the project root', () => {
    // Simulate the server's own mutated env being ambient at spawn time.
    process.env.FORWARD_RESUME_TEST_AMBIENT = 'server-only'
    try {
      makeSpawnResume('/proj/.ocr')('session-123')
    } finally {
      delete process.env.FORWARD_RESUME_TEST_AMBIENT
    }

    expect(spawnMock).toHaveBeenCalledTimes(1)
    const call = spawnMock.mock.calls[0]
    if (!call) throw new Error('spawnBinary was not called')
    const [binary, args, opts] = call as [
      string,
      string[],
      { cwd: string; env: NodeJS.ProcessEnv; stdio: string; detached: boolean },
    ]

    expect(binary).toBe('ocr')
    expect(args).toEqual(['review', '--resume', 'session-123'])
    expect(opts.cwd).toBe('/proj')
    expect(opts.detached).toBe(true)
    expect(opts.stdio).toBe('ignore')

    // The builder's output, not the server's process.env:
    expect(opts.env.AWS_REGION).toBe('us-west-2')
    expect(opts.env.PATH).toBe('/usr/bin')
    expect(opts.env.NODE_OPTIONS).toBeUndefined()
    expect(opts.env.OCR_DASHBOARD_EXECUTION_UID).toBeUndefined()
    expect(opts.env.NODE_ENV).toBeUndefined()
    expect(opts.env.FORWARD_RESUME_TEST_AMBIENT).toBeUndefined()

    // Fire-and-forget contract: error listener attached (a dead `ocr`
    // binary must not crash the server) and the child is unref'd so it
    // never holds the dashboard's event loop open.
    expect(fakeChild.on).toHaveBeenCalledWith('error', expect.any(Function))
    expect(fakeChild.unref).toHaveBeenCalledTimes(1)
  })

  it('throws (never falls back to process.env) if the snapshot is unregistered', () => {
    resetChildEnvBaseForTests()
    expect(() => makeSpawnResume('/proj/.ocr')('session-123')).toThrow(
      /not registered/,
    )
    expect(spawnMock).not.toHaveBeenCalled()
  })
})
