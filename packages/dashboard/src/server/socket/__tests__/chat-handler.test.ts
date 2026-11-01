/**
 * Ask the Team `chat:send` against a real database and a stub adapter whose
 * child is a fake process fed real Claude Code stream-json lines. Pins the
 * chat-side guards around the adapter's read-only restriction: a refused spawn
 * surfaces as `chat:error`, a call to a tool outside Read/Grep/Glob stops the
 * turn without keeping its answer or session, and a conversation runs one turn
 * at a time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Database } from '@open-code-review/persistence'
import { makeTempWorkspace, removeTempWorkspace } from '@open-code-review/persistence/test-support'
import {
  getConversation,
  getMessages,
  openDb,
  updateConversationClaudeSession,
  upsertConversation,
} from '../../db.js'
import { cleanupAllChats, registerChatHandlers } from '../chat-handler.js'
import { ClaudeCodeAdapter } from '../../services/ai-cli/claude-adapter.js'
import { OpenCodeAdapter } from '../../services/ai-cli/opencode-adapter.js'
import { UnsupportedCliVersionError } from '../../services/ai-cli/helpers.js'
import type { AiCliAdapter, AiCliService } from '../../services/ai-cli/index.js'

type Emitted = { event: string; payload: Record<string, unknown> }

let workspace: string
let ocrDir: string
let db: Database

function fakeSocket() {
  const handlers = new Map<string, (payload: unknown) => void>()
  const emitted: Emitted[] = []
  const socket = {
    on: (event: string, fn: (payload: unknown) => void) => handlers.set(event, fn),
    emit: (event: string, payload: Record<string, unknown>) => emitted.push({ event, payload }),
  } as unknown as Socket
  return { socket, handlers, emitted }
}

function fakeChild() {
  const proc = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill: vi.fn(() => true),
  })
  return proc
}

function serviceWith(
  spawn: AiCliAdapter['spawn'],
  vendor: AiCliAdapter = new ClaudeCodeAdapter(),
): AiCliService {
  const adapter = { spawn, createParser: () => vendor.createParser() } as unknown as AiCliAdapter
  return { isAvailable: () => true, getAdapter: () => adapter } as unknown as AiCliService
}

function send(handlers: Map<string, (payload: unknown) => void>) {
  handlers.get('chat:send')!({
    conversationId: 'conv-1',
    sessionId: 'sess-1',
    targetType: 'review_round',
    targetId: 1,
    message: 'What did the reviewers flag?',
  })
}

/**
 * Claude stream-json for a turn that says something, calls one tool (block 1),
 * gets its result and answers. The text before the call is what a stopped turn
 * must not keep.
 */
function toolTurn(name: string, isError: boolean): string {
  return [
    { type: 'system', subtype: 'init', session_id: 'claude-sess-1' },
    { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Let me check.' } } },
    {
      type: 'stream_event',
      event: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name, input: {} } },
    },
    { type: 'stream_event', event: { type: 'content_block_stop', index: 1 } },
    {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'out', is_error: isError }] },
    },
    { type: 'stream_event', event: { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'Answer.' } } },
  ]
    .map((line) => JSON.stringify(line))
    .join('\n') + '\n'
}

function recordedExitCode(): unknown {
  return db.exec('SELECT exit_code FROM command_executions ORDER BY id DESC LIMIT 1')[0]?.values[0]?.[0]
}

beforeEach(async () => {
  workspace = makeTempWorkspace('chat-handler-')
  ocrDir = join(workspace, '.ocr')
  mkdirSync(join(ocrDir, 'data'), { recursive: true })
  db = await openDb(ocrDir)
  db.run(
    `INSERT INTO sessions (id, branch, workflow_type, status, current_phase, phase_number, current_round, current_map_run, session_dir)
     VALUES ('sess-1', 'main', 'review', 'closed', 'complete', 8, 1, 0, ?)`,
    [join(ocrDir, 'sessions', 'sess-1')],
  )
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  cleanupAllChats()
  vi.useRealTimers()
  removeTempWorkspace(workspace)
})

const io = { emit: () => true } as unknown as SocketIOServer

describe('chat:send spawn options', () => {
  function spawnSpy() {
    return vi.fn<AiCliAdapter['spawn']>(() => ({
      process: fakeChild() as unknown as ChildProcess,
      detached: false,
    }))
  }

  it('runs a new turn in query mode', () => {
    const { socket, handlers } = fakeSocket()
    const spawn = spawnSpy()
    registerChatHandlers(io, socket, db, ocrDir, serviceWith(spawn))
    send(handlers)
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ mode: 'query', maxTurns: 1 }))
  })

  it('runs a resumed turn in query mode', () => {
    upsertConversation(db, 'conv-1', 'sess-1', 'review_round', 1)
    updateConversationClaudeSession(db, 'conv-1', 'claude-sess-0')
    const { socket, handlers } = fakeSocket()
    const spawn = spawnSpy()
    registerChatHandlers(io, socket, db, ocrDir, serviceWith(spawn))
    send(handlers)
    expect(spawn).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'query', maxTurns: 1, resumeSessionId: 'claude-sess-0' }),
    )
  })
})

describe('chat:send while a turn is running', () => {
  function sendTwice(first: ReturnType<typeof fakeChild>) {
    const { socket, handlers, emitted } = fakeSocket()
    const spawn = vi.fn<AiCliAdapter['spawn']>(() => ({
      process: first as unknown as ChildProcess,
      detached: false,
    }))
    registerChatHandlers(io, socket, db, ocrDir, serviceWith(spawn))
    send(handlers)
    return { spawn, emitted, sendAgain: () => send(handlers) }
  }

  it('refuses the message without storing it or spawning', () => {
    const { spawn, emitted, sendAgain } = sendTwice(fakeChild())
    sendAgain()
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(getMessages(db, 'conv-1')).toHaveLength(1)
    expect(emitted).toContainEqual({
      event: 'chat:error',
      payload: { conversationId: 'conv-1', error: 'A response is already in progress for this conversation.' },
    })
  })

  it.each([
    ['exited', { exitCode: 0 }],
    ['been killed', { signalCode: 'SIGKILL' as const }],
  ])('accepts the message once the child has %s, even if close never fired', (_label, state) => {
    const child = fakeChild()
    const { spawn, sendAgain } = sendTwice(child)
    Object.assign(child, state)
    sendAgain()
    expect(spawn).toHaveBeenCalledTimes(2)
  })
})

describe('chat:send when an earlier turn closes late', () => {
  /** Turn A exits with its `close` pending, so turn B replaces it. */
  function supersede() {
    const a = fakeChild()
    const b = fakeChild()
    const { socket, handlers, emitted } = fakeSocket()
    const spawn = vi.fn<AiCliAdapter['spawn']>()
    spawn.mockReturnValueOnce({ process: a as unknown as ChildProcess, detached: false })
    spawn.mockReturnValueOnce({ process: b as unknown as ChildProcess, detached: false })
    registerChatHandlers(io, socket, db, ocrDir, serviceWith(spawn))
    send(handlers)
    a.exitCode = 0
    send(handlers)
    expect(spawn).toHaveBeenCalledTimes(2)
    return { a, b, spawn, emitted, sendAgain: () => send(handlers) }
  }

  async function finish(child: ReturnType<typeof fakeChild>, stream: string, code: number) {
    child.stdout.write(stream)
    await new Promise((resolve) => setImmediate(resolve))
    child.emit('close', code)
  }

  it('leaves the running turn visible to the one-turn guard', async () => {
    const { a, spawn, sendAgain } = supersede()
    await finish(a, toolTurn('Read', false), 0)
    sendAgain()
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('keeps its answer and tells its own tab, but leaves the session to the newer turn', async () => {
    const { a, emitted } = supersede()
    await finish(a, toolTurn('Read', false), 0)
    expect(getMessages(db, 'conv-1').at(-1)?.role).toBe('assistant')
    expect(emitted.some((e) => e.event === 'chat:done')).toBe(true)
    expect(getConversation(db, 'conv-1')?.claude_session_id ?? null).toBeNull()
  })

  it('does not restore a session that the newer turn stopped and cleared', async () => {
    const { a, b } = supersede()
    await finish(b, toolTurn('Bash', false), 1)
    await finish(a, toolTurn('Read', false), 0)
    expect(getConversation(db, 'conv-1')?.claude_session_id ?? null).toBeNull()
  })

  it('does not replace the session the newer turn stored', async () => {
    const { a, b } = supersede()
    const newer = JSON.stringify({ type: 'system', subtype: 'init', session_id: 'claude-sess-b' })
    await finish(b, `${newer}\n`, 0)
    await finish(a, toolTurn('Read', false), 0)
    expect(getConversation(db, 'conv-1')?.claude_session_id).toBe('claude-sess-b')
  })
})

describe('chat:send spawn refusal', () => {
  it('reports an unsupported CLI version to the user as a chat:error', () => {
    const { socket, handlers, emitted } = fakeSocket()
    registerChatHandlers(io, socket, db, ocrDir, serviceWith(() => {
      throw new UnsupportedCliVersionError('Ask the Team requires claude >= 2.1.295 (found 2.1.200).')
    }))
    send(handlers)
    expect(emitted).toContainEqual({
      event: 'chat:error',
      payload: { conversationId: 'conv-1', error: 'Ask the Team requires claude >= 2.1.295 (found 2.1.200).' },
    })
  })

  it('does not forward other spawn errors verbatim', () => {
    const { socket, handlers, emitted } = fakeSocket()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerChatHandlers(io, socket, db, ocrDir, serviceWith(() => {
      throw new Error('EACCES /usr/local/bin/claude')
    }))
    send(handlers)
    expect(emitted).toContainEqual({
      event: 'chat:error',
      payload: { conversationId: 'conv-1', error: 'Failed to spawn AI CLI' },
    })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('chat:send read-only backstop', () => {
  async function run(stream: string, vendor?: AiCliAdapter) {
    const child = fakeChild()
    const { socket, handlers, emitted } = fakeSocket()
    registerChatHandlers(io, socket, db, ocrDir, serviceWith(() => ({
      process: child as unknown as ChildProcess,
      detached: false,
    }), vendor))
    send(handlers)
    child.stdout.write(stream)
    await new Promise((resolve) => setImmediate(resolve))
    child.emit('close', child.kill.mock.calls.length > 0 ? null : 0)
    return { child, emitted }
  }

  function expectStopped(child: ReturnType<typeof fakeChild>, emitted: Emitted[], tool: string) {
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    const error = emitted.find((e) => e.event === 'chat:error')
    expect(error?.payload.error).toContain(`outside the chat's read-only set (${tool})`)
    expect(emitted.some((e) => e.event === 'chat:done')).toBe(false)
    expect(getConversation(db, 'conv-1')?.claude_session_id ?? null).toBeNull()
    expect(getMessages(db, 'conv-1').map((m) => m.role)).toEqual(['user'])
    expect(recordedExitCode()).toBe(1)
  }

  it('clears the session and releases the pipes without waiting for close', async () => {
    upsertConversation(db, 'conv-1', 'sess-1', 'review_round', 1)
    updateConversationClaudeSession(db, 'conv-1', 'claude-sess-0')
    const child = fakeChild()
    const { socket, handlers } = fakeSocket()
    registerChatHandlers(io, socket, db, ocrDir, serviceWith(() => ({
      process: child as unknown as ChildProcess,
      detached: false,
    })))
    send(handlers)
    child.stdout.write(toolTurn('Bash', false))
    await new Promise((resolve) => setImmediate(resolve))
    expect(getConversation(db, 'conv-1')?.claude_session_id ?? null).toBeNull()
    expect(child.stdout.destroyed).toBe(true)
    expect(child.stderr.destroyed).toBe(true)
  })

  it('still kills the CLI and reports the stop when the session clear fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = db.run.bind(db)
    const dbRun = vi.spyOn(db, 'run').mockImplementation((sql, params) => {
      if (sql.startsWith('UPDATE chat_conversations SET claude_session_id')) {
        throw new Error('database is locked')
      }
      return run(sql, params)
    })
    const child = fakeChild()
    const { socket, handlers, emitted } = fakeSocket()
    registerChatHandlers(io, socket, db, ocrDir, serviceWith(() => ({
      process: child as unknown as ChildProcess,
      detached: false,
    })))
    send(handlers)
    child.stdout.write(toolTurn('Bash', false))
    await new Promise((resolve) => setImmediate(resolve))
    child.emit('close', null)
    dbRun.mockRestore()
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(child.stdout.destroyed).toBe(true)
    expect(emitted.some((e) => e.event === 'chat:error')).toBe(true)
    expect(recordedExitCode()).toBe(1)
    consoleError.mockRestore()
  })

  it('leaves parallel reads alone, in the order a real CLI streams them', async () => {
    // Captured from Claude Code with two parallel Reads: the first result
    // arrives while the second block is still open.
    const block = (type: string, index: number, extra: object = {}) => ({
      type: 'stream_event',
      event: { type, index, ...extra },
    })
    const start = (index: number, id: string) =>
      block('content_block_start', index, { content_block: { type: 'tool_use', id, name: 'Read', input: {} } })
    const result = (id: string) => ({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'out' }] },
    })
    const stream = [
      start(0, 'toolu_1'),
      block('content_block_stop', 0),
      start(1, 'toolu_2'),
      result('toolu_1'),
      block('content_block_stop', 1),
      result('toolu_2'),
      block('content_block_delta', 0, { delta: { type: 'text_delta', text: 'Both read.' } }),
    ].map((line) => JSON.stringify(line)).join('\n')
    const { child, emitted } = await run(`${stream}\n`)
    expect(child.kill).not.toHaveBeenCalled()
    expect(emitted.some((e) => e.event === 'chat:done')).toBe(true)
  })

  it('starts the next message fresh after a stop', async () => {
    upsertConversation(db, 'conv-1', 'sess-1', 'review_round', 1)
    updateConversationClaudeSession(db, 'conv-1', 'claude-sess-0')
    const child = fakeChild()
    const { socket, handlers } = fakeSocket()
    const spawn = vi.fn<AiCliAdapter['spawn']>(() => ({
      process: child as unknown as ChildProcess,
      detached: false,
    }))
    registerChatHandlers(io, socket, db, ocrDir, serviceWith(spawn))
    send(handlers)
    child.stdout.write(toolTurn('Bash', false))
    await new Promise((resolve) => setImmediate(resolve))
    child.emit('close', null)
    send(handlers)
    expect(spawn).toHaveBeenCalledTimes(2)
    const next = spawn.mock.calls[1]![0]
    expect(next.resumeSessionId).toBeUndefined()
    expect(next.prompt).toContain('User: What did the reviewers flag?')
    expect(next.prompt).not.toBe('What did the reviewers flag?')
  })

  it.each([
    ['its result succeeded', false],
    ['the CLI rejected it', true],
  ])('stops the turn when a tool outside Read/Grep/Glob is called (%s)', async (_label, isError) => {
    const { child, emitted } = await run(toolTurn('Bash', isError))
    expectStopped(child, emitted, 'Bash')
  })

  it('drops the stored session of a resumed conversation when it stops', async () => {
    upsertConversation(db, 'conv-1', 'sess-1', 'review_round', 1)
    updateConversationClaudeSession(db, 'conv-1', 'claude-sess-0')
    const { child, emitted } = await run(toolTurn('Write', false))
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(emitted.some((e) => e.event === 'chat:error')).toBe(true)
    expect(getConversation(db, 'conv-1')?.claude_session_id ?? null).toBeNull()
  })

  it('stops the turn on a tool result for a call that was never announced', async () => {
    const orphan = JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_x', content: 'out', is_error: false }] },
    })
    const { child, emitted } = await run(`${orphan}\n`)
    expectStopped(child, emitted, 'unannounced tool')
  })

  it('stops an OpenCode turn that reports an out-of-set tool', async () => {
    const line = JSON.stringify({
      type: 'tool_use',
      sessionID: 'ses_1',
      part: { tool: 'bash', callID: 'call_1', state: { status: 'completed', input: {}, output: '' } },
    })
    const { child, emitted } = await run(`${line}\n`, new OpenCodeAdapter())
    expectStopped(child, emitted, 'Bash')
  })

  async function runUnterminated(stream: string) {
    const child = fakeChild()
    const { socket, handlers, emitted } = fakeSocket()
    registerChatHandlers(io, socket, db, ocrDir, serviceWith(() => ({
      process: child as unknown as ChildProcess,
      detached: false,
    })))
    send(handlers)
    child.stdout.write(stream)
    await new Promise((resolve) => setImmediate(resolve))
    child.emit('close', 0)
    return emitted
  }

  it('stops the turn when the out-of-set call is on an unterminated last line', async () => {
    const emitted = await runUnterminated(toolTurn('Bash', true).split('\n').slice(0, 4).join('\n'))
    const error = emitted.find((e) => e.event === 'chat:error')
    expect(error?.payload.error).toContain("outside the chat's read-only set (Bash)")
    expect(emitted.some((e) => e.event === 'chat:done')).toBe(false)
    expect(getConversation(db, 'conv-1')?.claude_session_id ?? null).toBeNull()
    expect(getMessages(db, 'conv-1').map((m) => m.role)).toEqual(['user'])
    expect(recordedExitCode()).toBe(1)
  })

  it('stops the turn when an unannounced result is on an unterminated last line', async () => {
    const orphan = JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_x', content: 'out', is_error: false }] },
    })
    const emitted = await runUnterminated(orphan)
    const error = emitted.find((e) => e.event === 'chat:error')
    expect(error?.payload.error).toContain("outside the chat's read-only set (unannounced tool)")
    expect(emitted.some((e) => e.event === 'chat:done')).toBe(false)
  })

  it('matches an announced call to one result only, even when a block index repeats', async () => {
    // Claude block indexes restart per message: the second call never reports
    // a stop, so its result lands on the first call's already-used correlator.
    const start = (id: string) => ({
      type: 'stream_event',
      event: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id, name: 'Read', input: {} } },
    })
    const result = (id: string) => ({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'out', is_error: false }] },
    })
    const stream = [
      start('toolu_1'),
      { type: 'stream_event', event: { type: 'content_block_stop', index: 1 } },
      result('toolu_1'),
      start('toolu_2'),
      result('toolu_2'),
    ].map((line) => JSON.stringify(line)).join('\n')
    const { child, emitted } = await run(`${stream}\n`)
    expectStopped(child, emitted, 'unannounced tool')
  })

  it.each(['read', 'grep', 'glob'])('leaves an OpenCode turn alone when it uses %s', async (tool) => {
    const lines = [
      { type: 'tool_use', sessionID: 'ses_1', part: { tool, callID: 'call_1', state: { status: 'completed', input: {}, output: 'x' } } },
      { type: 'text', sessionID: 'ses_1', part: { type: 'text', text: 'Answer.' } },
    ].map((line) => JSON.stringify(line)).join('\n')
    const { child, emitted } = await run(`${lines}\n`, new OpenCodeAdapter())
    expect(child.kill).not.toHaveBeenCalled()
    expect(emitted.some((e) => e.event === 'chat:done')).toBe(true)
    expect(getMessages(db, 'conv-1').map((m) => m.role)).toEqual(['user', 'assistant'])
  })

  it.each(['Read', 'Grep', 'Glob'])('leaves a turn alone when %s ran', async (tool) => {
    const { child, emitted } = await run(toolTurn(tool, false))
    expect(child.kill).not.toHaveBeenCalled()
    expect(emitted.some((e) => e.event === 'chat:done')).toBe(true)
    expect(getConversation(db, 'conv-1')?.claude_session_id).toBe('claude-sess-1')
    expect(getMessages(db, 'conv-1').map((m) => m.role)).toEqual(['user', 'assistant'])
  })
})
