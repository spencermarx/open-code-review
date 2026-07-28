/**
 * Spawn-shape pinning suite for BOTH adapters.
 *
 * Until this file existed, neither adapter's spawn contract (argv + prompt
 * delivery) was pinned by any test — a comment in opencode-adapter claimed
 * otherwise but referred only to the resume *display* shape. These pins are
 * what make the prompt-to-stdin change (issue #43) and any future spawn
 * refactor safe:
 *
 *   - the NEGATIVE invariant that no argv element contains the prompt
 *     (argv leaks the prompt to process listings, was an injection surface
 *     under Windows shell:true, and hits cmd.exe's ~8191-char limit);
 *   - stdin receives the exact prompt bytes and is ended;
 *   - stdin survives an EPIPE-style error without throwing (a child dying
 *     before draining must not crash the dashboard);
 *   - resume/model/detached/stdio shapes per adapter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PassThrough } from 'node:stream'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'

vi.mock('@open-code-review/platform', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return { ...original, spawnBinary: vi.fn(), execBinary: vi.fn() }
})

import { spawnBinary } from '@open-code-review/platform'
import { ClaudeCodeAdapter } from '../claude-adapter.js'
import { OpenCodeAdapter } from '../opencode-adapter.js'
import {
  initChildEnvBase,
  resetChildEnvBaseForTests,
} from '../../../child-env.js'

const spawnMock = vi.mocked(spawnBinary)

type FakeChild = {
  proc: ChildProcess
  stdin: PassThrough
  written: () => string
  unref: ReturnType<typeof vi.fn>
}

function fakeChild(): FakeChild {
  const stdin = new PassThrough()
  const chunks: Buffer[] = []
  stdin.on('data', (c: Buffer) => chunks.push(c))
  const unref = vi.fn()
  const proc = {
    stdin,
    stdout: null,
    stderr: null,
    pid: 4242,
    unref,
  } as unknown as ChildProcess
  return { proc, stdin, written: () => Buffer.concat(chunks).toString('utf-8'), unref }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Adapters build child env from the registered launch snapshot; register a
  // minimal one the way startServer does.
  resetChildEnvBaseForTests()
  initChildEnvBase({
    env: { PATH: '/usr/bin' },
    source: 'cli-launch',
    capturedAt: '2026-07-28T00:00:00.000Z',
  })
})

const PROMPT = 'Review this diff & report | findings > here\nmultiline body'

describe.each([
  {
    name: 'claude',
    make: () => new ClaudeCodeAdapter(),
    binary: 'claude',
    resumeArgs: (id: string) => ['--resume', id],
  },
  {
    name: 'opencode',
    make: () => new OpenCodeAdapter(),
    binary: 'opencode',
    resumeArgs: (id: string) => ['--session', id, '--continue'],
  },
])('$name adapter spawn shape', ({ make, binary, resumeArgs }) => {
  it('never puts the prompt (or any part of it) in argv; delivers it on stdin and ends the stream', () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child.proc)

    make().spawn({ prompt: PROMPT, cwd: '/tmp', mode: 'query' })

    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [spawnedBinary, args] = spawnMock.mock.calls[0]!
    expect(spawnedBinary).toBe(binary)
    for (const arg of args) {
      expect(arg).not.toBe(PROMPT)
      expect(arg.includes('Review this diff')).toBe(false)
    }
    expect(child.written()).toBe(PROMPT)
    expect(child.stdin.writableEnded).toBe(true)
  })

  it('passes --model only when a model override is set', () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child.proc)
    make().spawn({ prompt: PROMPT, cwd: '/tmp', mode: 'query' })
    expect(spawnMock.mock.calls[0]![1]).not.toContain('--model')

    const child2 = fakeChild()
    spawnMock.mockReturnValue(child2.proc)
    make().spawn({ prompt: PROMPT, cwd: '/tmp', mode: 'query', model: 'sonnet' })
    const args = spawnMock.mock.calls[1]![1]
    const i = args.indexOf('--model')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(args[i + 1]).toBe('sonnet')
  })

  it('resume spawns carry the vendor resume argv AND still deliver the prompt via stdin', () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child.proc)
    make().spawn({ prompt: PROMPT, cwd: '/tmp', mode: 'workflow', resumeSessionId: 'sess-123' })

    const args = spawnMock.mock.calls[0]![1]
    const expected = resumeArgs('sess-123')
    for (const piece of expected) expect(args).toContain(piece)
    expect(child.written()).toBe(PROMPT)
  })

  it('workflow mode spawns detached + unref; query mode does not', () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child.proc)
    make().spawn({ prompt: PROMPT, cwd: '/tmp', mode: 'workflow' })
    expect(spawnMock.mock.calls[0]![2]).toMatchObject({ detached: true })
    expect(child.unref).toHaveBeenCalled()

    const child2 = fakeChild()
    spawnMock.mockReturnValue(child2.proc)
    make().spawn({ prompt: PROMPT, cwd: '/tmp', mode: 'query' })
    expect(spawnMock.mock.calls[1]![2]).toMatchObject({ detached: false })
    expect(child2.unref).not.toHaveBeenCalled()
  })

  it('query mode uses an all-pipe stdio triple; workflow+logFile redirects fd 1/2 to the file', () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child.proc)
    make().spawn({ prompt: PROMPT, cwd: '/tmp', mode: 'query' })
    expect(spawnMock.mock.calls[0]![2]).toMatchObject({ stdio: ['pipe', 'pipe', 'pipe'] })

    const dir = mkdtempSync(join(tmpdir(), 'spawn-shape-'))
    try {
      const child2 = fakeChild()
      spawnMock.mockReturnValue(child2.proc)
      make().spawn({
        prompt: PROMPT,
        cwd: '/tmp',
        mode: 'workflow',
        logFile: join(dir, 'exec.log'),
      })
      const stdio = (spawnMock.mock.calls[1]![2] as { stdio: unknown[] }).stdio
      expect(stdio[0]).toBe('pipe') // stdin carries the prompt for BOTH vendors
      expect(typeof stdio[1]).toBe('number') // fd 1 → log file
      expect(stdio[2]).toBe(stdio[1]) // fd 2 → same file
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })

  it('survives a stdin error after spawn (EPIPE from a child dying early) without throwing', () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child.proc)
    make().spawn({ prompt: PROMPT, cwd: '/tmp', mode: 'query' })
    expect(() =>
      child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })),
    ).not.toThrow()
  })

  it('rejects an empty prompt BEFORE spawning — no child process is created (blocker B1)', () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child.proc)
    // The throw alone is not the contract: the old guard fired inside
    // deliverPrompt, AFTER spawnBinary + unref, orphaning a detached child.
    // The fix rejects before the spawn, so spawnBinary must never be called.
    expect(() => make().spawn({ prompt: '', cwd: '/tmp', mode: 'workflow' })).toThrow(
      /empty prompt/,
    )
    expect(spawnMock).not.toHaveBeenCalled()
    expect(child.unref).not.toHaveBeenCalled()
  })
})
