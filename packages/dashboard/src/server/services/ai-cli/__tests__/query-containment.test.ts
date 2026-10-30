/**
 * Query-mode (Ask the Team) containment pins for BOTH adapters.
 *
 * Dashboard spec "Ask the Team Chat → Allowed tools": only Read, Grep and
 * Glob may be used, and every other tool MUST be rejected — whatever the
 * user's or the reviewed repo's vendor configuration says. These tests pin
 * the exact restriction each adapter hands its CLI, the fail-closed version
 * gate, and that workflow spawns keep their full tool set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'

vi.mock('@open-code-review/platform', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return { ...original, spawnBinary: vi.fn(), execBinary: vi.fn() }
})

import { execBinary, spawnBinary } from '@open-code-review/platform'
import { ClaudeCodeAdapter, MIN_QUERY_CONTAINMENT_VERSION } from '../claude-adapter.js'
import { OpenCodeAdapter, QUERY_CONTAINMENT_VERSION_RANGE } from '../opencode-adapter.js'
import { UnsupportedCliVersionError } from '../helpers.js'
import { createRegisteredAdapters } from '../index.js'
import { initChildEnvBase, resetChildEnvBaseForTests } from '../../../child-env.js'

const spawnMock = vi.mocked(spawnBinary)
const execMock = vi.mocked(execBinary)

const PROMPT = 'What did the security reviewer flag?'

function fakeChild(): ChildProcess {
  return {
    stdin: new PassThrough(),
    stdout: null,
    stderr: null,
    pid: 4242,
    unref: vi.fn(),
  } as unknown as ChildProcess
}

function lastSpawn(): { args: string[]; env: NodeJS.ProcessEnv } {
  const call = spawnMock.mock.calls.at(-1)!
  return { args: call[1], env: (call[2] as { env: NodeJS.ProcessEnv }).env }
}

/** A launch-shell snapshot that already sets the OpenCode variables. */
const AMBIENT_ENV = {
  PATH: '/usr/bin',
  OPENCODE_CONFIG_CONTENT: '{"agent":{"build":{"permission":{"*":"allow"}}}}',
  OPENCODE_DISABLE_PROJECT_CONFIG: '0',
  OPENCODE_PURE: '0',
  OPENCODE_DISABLE_CLAUDE_CODE: '0',
}

beforeEach(() => {
  vi.clearAllMocks()
  spawnMock.mockImplementation(() => fakeChild())
  resetChildEnvBaseForTests()
  initChildEnvBase({
    env: AMBIENT_ENV,
    source: 'cli-launch',
    capturedAt: '2026-10-30T00:00:00.000Z',
  })
})

describe('every registered adapter', () => {
  it.each(createRegisteredAdapters().map((adapter) => [adapter.name, adapter] as const))(
    '%s refuses a query spawn when its CLI version is unknown',
    (_name, adapter) => {
      execMock.mockReturnValue('unknown')
      expect(() => adapter.spawn({ prompt: PROMPT, cwd: '/repo', mode: 'query' })).toThrow(
        UnsupportedCliVersionError,
      )
      expect(spawnMock).not.toHaveBeenCalled()
    },
  )
})

describe('Claude Code query containment', () => {
  const CONTAINMENT = [
    '--tools=Read,Grep,Glob',
    '--permission-mode=dontAsk',
    '--setting-sources=user',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--settings={"disableAllHooks":true,"permissions":{"blockReadsOutsideWorkingDirectories":true}}',
  ]

  beforeEach(() => {
    execMock.mockReturnValue('2.1.308 (Claude Code)')
  })

  it('spawns a chat turn with exactly the read-only restriction flags', () => {
    new ClaudeCodeAdapter().spawn({ prompt: PROMPT, cwd: '/repo', mode: 'query', maxTurns: 1 })
    expect(lastSpawn().args).toEqual([
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--max-turns', '1',
      ...CONTAINMENT,
    ])
  })

  it('gives a chat turn its tool set through --tools alone', () => {
    new ClaudeCodeAdapter().spawn({ prompt: PROMPT, cwd: '/repo', mode: 'query' })
    const { args } = lastSpawn()
    expect(args.some((a) => a.startsWith('--allowedTools'))).toBe(false)
    expect(args.some((a) => /bypass|dangerously/i.test(a))).toBe(false)
  })

  it('re-applies the full restriction on a resumed chat turn', () => {
    new ClaudeCodeAdapter().spawn({
      prompt: PROMPT,
      cwd: '/repo',
      mode: 'query',
      resumeSessionId: 'sess-1',
    })
    const { args } = lastSpawn()
    for (const flag of CONTAINMENT) expect(args).toContain(flag)
    expect(args.slice(-2)).toEqual(['--resume', 'sess-1'])
  })

  it('leaves workflow spawns on their full tool set', () => {
    new ClaudeCodeAdapter().spawn({ prompt: PROMPT, cwd: '/repo', mode: 'workflow' })
    const { args } = lastSpawn()
    expect(args).toEqual(expect.arrayContaining(['--allowedTools', 'Bash', 'Write', 'Edit', 'Task']))
    expect(args.some((a) => a.startsWith('--tools'))).toBe(false)
  })

  it.each([
    ['an older CLI', '2.1.294 (Claude Code)'],
    ['an unparseable version', 'Claude Code'],
  ])('refuses a chat turn on %s without spawning', (_label, output) => {
    execMock.mockReturnValue(output)
    expect(() =>
      new ClaudeCodeAdapter().spawn({ prompt: PROMPT, cwd: '/repo', mode: 'query' }),
    ).toThrow(/Ask the Team requires claude >= 2\.1\.295/)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('refuses a chat turn when the binary cannot be probed', () => {
    execMock.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    expect(() =>
      new ClaudeCodeAdapter().spawn({ prompt: PROMPT, cwd: '/repo', mode: 'query' }),
    ).toThrow(/unknown version/)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('accepts the minimum version and reuses the startup detection', () => {
    execMock.mockReturnValue(`${MIN_QUERY_CONTAINMENT_VERSION} (Claude Code)`)
    const adapter = new ClaudeCodeAdapter()
    adapter.detect()
    adapter.spawn({ prompt: PROMPT, cwd: '/repo', mode: 'query' })
    adapter.spawn({ prompt: PROMPT, cwd: '/repo', mode: 'query' })
    expect(execMock).toHaveBeenCalledTimes(1)
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })

  it('probes an unparseable version once, then keeps refusing without re-probing', () => {
    execMock.mockReturnValue('Claude Code (dev build)')
    const adapter = new ClaudeCodeAdapter()
    adapter.detect()
    for (let i = 0; i < 3; i++) {
      expect(() => adapter.spawn({ prompt: PROMPT, cwd: '/repo', mode: 'query' })).toThrow(
        UnsupportedCliVersionError,
      )
    }
    expect(execMock).toHaveBeenCalledTimes(1)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('does not gate workflow spawns on the containment version', () => {
    execMock.mockReturnValue('2.0.0 (Claude Code)')
    new ClaudeCodeAdapter().spawn({ prompt: PROMPT, cwd: '/repo', mode: 'workflow' })
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })
})

describe('OpenCode query containment', () => {
  type ContainedConfig = {
    default_agent: string
    agent: Record<string, { disable?: boolean; mode?: string; permission?: Record<string, unknown> }>
  }

  beforeEach(() => {
    execMock.mockReturnValue('1.19.5')
  })

  function spawnQuery(extra: { resumeSessionId?: string } = {}) {
    new OpenCodeAdapter().spawn({ prompt: PROMPT, cwd: '/repo', mode: 'query', ...extra })
    const { args, env } = lastSpawn()
    const agent = args[args.indexOf('--agent') + 1]!
    const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT!) as ContainedConfig
    return { args, env, agent, config }
  }

  it('runs a chat turn on a per-spawn contained agent, never build or plan', () => {
    const { args, agent } = spawnQuery()
    expect(args).toEqual(['run', '--format', 'json', '--agent', agent])
    expect(agent).toMatch(/^ocr-ask-[0-9a-f]{8}$/)
  })

  it("denies every tool except read, grep and glob in the agent's own permission", () => {
    const { agent, config } = spawnQuery()
    const permission = config.agent[agent]!.permission!
    // "*" first: OpenCode evaluates the LAST matching rule, so the specific
    // allows that follow are the only exceptions to the deny.
    expect(Object.keys(permission)).toEqual(['*', 'read', 'grep', 'glob', 'external_directory'])
    expect(permission['*']).toBe('deny')
    expect(permission.grep).toBe('allow')
    expect(permission.glob).toBe('allow')
    expect(permission.external_directory).toBe('deny')
    expect(permission.read).toEqual({
      '*': 'allow',
      '*.env': 'deny',
      '*.env.*': 'deny',
      '*.env.example': 'allow',
    })
  })

  it('makes the contained agent the default and disables the built-in agents', () => {
    const { agent, config } = spawnQuery()
    expect(config.default_agent).toBe(agent)
    expect(config.agent[agent]!.mode).toBe('primary')
    expect(config.agent.build).toEqual({ disable: true })
    expect(config.agent.plan).toEqual({ disable: true })
  })

  it("isolates the child from the reviewed repo's config and plugins, overriding ambient values", () => {
    const { env } = spawnQuery()
    expect(env.OPENCODE_DISABLE_PROJECT_CONFIG).toBe('1')
    expect(env.OPENCODE_PURE).toBe('1')
    expect(env.OPENCODE_DISABLE_CLAUDE_CODE).toBe('1')
    expect(env.OPENCODE_CONFIG_CONTENT).not.toBe(AMBIENT_ENV.OPENCODE_CONFIG_CONTENT)
  })

  it('names a fresh agent per spawn and re-applies containment on resume', () => {
    const first = spawnQuery()
    const resumed = spawnQuery({ resumeSessionId: 'ses_1' })
    expect(resumed.agent).not.toBe(first.agent)
    expect(resumed.args).toEqual(expect.arrayContaining(['--session', 'ses_1', '--agent', resumed.agent]))
    expect(resumed.config.default_agent).toBe(resumed.agent)
  })

  it('leaves workflow spawns on the build agent with no containment env', () => {
    new OpenCodeAdapter().spawn({ prompt: PROMPT, cwd: '/repo', mode: 'workflow' })
    const { args, env } = lastSpawn()
    expect(args).toEqual(['run', '--format', 'json', '--agent', 'build'])
    expect(env.OPENCODE_CONFIG_CONTENT).toBe(AMBIENT_ENV.OPENCODE_CONFIG_CONTENT)
  })

  it.each([
    ['below the floor', '1.3.3'],
    ['the first 2.x release', '2.0.0'],
    ['a later 2.x CLI', '2.2.3'],
    ['an unparseable (local) build', 'local'],
  ])('refuses a chat turn on %s without spawning', (_label, output) => {
    execMock.mockReturnValue(output)
    expect(() =>
      new OpenCodeAdapter().spawn({ prompt: PROMPT, cwd: '/repo', mode: 'query' }),
    ).toThrow(/Ask the Team requires opencode >= 1\.3\.4 and < 2\.0\.0/)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it.each([QUERY_CONTAINMENT_VERSION_RANGE.min, '1.99.9'])('accepts %s', (version) => {
    execMock.mockReturnValue(version)
    new OpenCodeAdapter().spawn({ prompt: PROMPT, cwd: '/repo', mode: 'query' })
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })
})
