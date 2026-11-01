/**
 * The Ask the Team stop against REAL processes: a child that reports an
 * out-of-set tool, with a process of its own running alongside it. A fake
 * child can't show what these pin, because `close` depends on Node tracking
 * real stdio and the tree kill on a real process table.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// Raw spawn here is test scaffolding: `process.execPath` with inline scripts
// sidesteps PATH and shell quoting on every OS.
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Database } from '@open-code-review/persistence'
import { isProcessAlive } from '@open-code-review/platform'
import { makeTempWorkspace, removeTempWorkspace } from '@open-code-review/persistence/test-support'
import { getConversation, openDb, updateConversationClaudeSession, upsertConversation } from '../../db.js'
import { cleanupAllChats, registerChatHandlers } from '../chat-handler.js'
import { ClaudeCodeAdapter } from '../../services/ai-cli/claude-adapter.js'
import type { AiCliAdapter, AiCliService } from '../../services/ai-cli/index.js'

const LONG_LIVED = 'setInterval(() => {}, 1000)'

/** Reports a Bash call and stays alive, as a CLI would until it is killed. */
const REPORT_BASH_AND_WAIT = `
  const line = (event) => console.log(JSON.stringify({ type: 'stream_event', event }))
  line({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: {} } })
  line({ type: 'content_block_stop', index: 0 })
  ${LONG_LIVED}
`

/** The child starts a grandchild, tells the test its pid, then reports Bash. */
const TREE_SCRIPT = `
  const { spawn } = require('node:child_process')
  const grandchild = spawn(process.execPath, ['-e', ${JSON.stringify(LONG_LIVED)}], { stdio: 'ignore' })
  process.stdout.write(grandchild.pid + '\\n')
  ${REPORT_BASH_AND_WAIT}
`

/**
 * An intermediate process starts a holder that inherits the child's stdout and
 * stderr, then exits. The holder is reparented, so no walk from the child can
 * find it, and it keeps the child's pipes open.
 */
const PIPE_HOLDER_SCRIPT = `
  const { spawn } = require('node:child_process')
  const intermediate = \`
    const { spawn } = require('node:child_process')
    const holder = spawn(process.execPath, ['-e', ${JSON.stringify(JSON.stringify(LONG_LIVED)).slice(1, -1)}], { stdio: 'inherit', detached: true })
    process.stdout.write(holder.pid + '\\\\n')
    holder.unref()
  \`
  spawn(process.execPath, ['-e', intermediate], { stdio: 'inherit' }).on('exit', () => {
    ${REPORT_BASH_AND_WAIT}
  })
`

let workspace: string
let ocrDir: string
let db: Database
const started: number[] = []

function serviceSpawning(script: string): { service: AiCliService; child: ChildProcess } {
  const child = spawn(process.execPath, ['-e', script], { stdio: ['pipe', 'pipe', 'pipe'] })
  const vendor = new ClaudeCodeAdapter()
  const adapter = {
    spawn: () => ({ process: child, detached: false }),
    createParser: () => vendor.createParser(),
  } as unknown as AiCliAdapter
  return {
    service: { isAvailable: () => true, getAdapter: () => adapter } as unknown as AiCliService,
    child,
  }
}

/**
 * Runs a turn and resolves with the pid the script printed first on stdout,
 * which the turn's parser skips as non-JSON. Read here, ahead of the handler's
 * listener, because the same chunk may carry the line that triggers the stop.
 */
function startTurn(script: string) {
  const { service, child } = serviceSpawning(script)
  const handlers = new Map<string, (payload: unknown) => void>()
  const errors: string[] = []
  const socket = {
    on: (event: string, fn: (payload: unknown) => void) => handlers.set(event, fn),
    emit: (event: string, payload: { error?: string }) => {
      if (event === 'chat:error' && payload.error) errors.push(payload.error)
    },
  } as unknown as Socket
  const io = { emit: () => true } as unknown as SocketIOServer
  const childPid = new Promise<number>((resolve) => {
    child.stdout?.once('data', (chunk) => resolve(Number(String(chunk).split('\n')[0])))
  })
  registerChatHandlers(io, socket, db, ocrDir, service)
  handlers.get('chat:send')!({
    conversationId: 'conv-1',
    sessionId: 'sess-1',
    targetType: 'review_round',
    targetId: 1,
    message: 'What did the reviewers flag?',
  })
  return { child, errors, childPid }
}

async function eventually(check: () => boolean, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return check()
}

beforeEach(async () => {
  workspace = makeTempWorkspace('chat-handler-process-')
  ocrDir = join(workspace, '.ocr')
  mkdirSync(join(ocrDir, 'data'), { recursive: true })
  db = await openDb(ocrDir)
  db.run(
    `INSERT INTO sessions (id, branch, workflow_type, status, current_phase, phase_number, current_round, current_map_run, session_dir)
     VALUES ('sess-1', 'main', 'review', 'closed', 'complete', 8, 1, 0, ?)`,
    [join(ocrDir, 'sessions', 'sess-1')],
  )
  upsertConversation(db, 'conv-1', 'sess-1', 'review_round', 1)
  updateConversationClaudeSession(db, 'conv-1', 'claude-sess-0')
})

afterEach(() => {
  cleanupAllChats()
  for (const pid of started.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
  removeTempWorkspace(workspace)
})

describe('Ask the Team stop, real processes', () => {
  it('kills the CLI and what it started', async () => {
    const { child, errors, childPid } = startTurn(TREE_SCRIPT)
    const grandchild = await childPid
    expect(Number.isInteger(grandchild)).toBe(true)
    started.push(grandchild)
    expect(await eventually(() => errors.length > 0)).toBe(true)
    expect(errors[0]).toContain("outside the chat's read-only set (Bash)")
    expect(await eventually(() => !isProcessAlive(child.pid!))).toBe(true)
    expect(await eventually(() => !isProcessAlive(grandchild))).toBe(true)
  }, 20_000)

  it('still reports the stop when another process holds the pipes', async () => {
    const { errors, childPid } = startTurn(PIPE_HOLDER_SCRIPT)
    const holder = await childPid
    expect(Number.isInteger(holder)).toBe(true)
    started.push(holder)
    expect(await eventually(() => errors.length > 0)).toBe(true)
    expect(errors[0]).toContain("outside the chat's read-only set (Bash)")
    // The holder outlives the stop: this path can't reach it, and doesn't need to.
    expect(isProcessAlive(holder)).toBe(true)
    expect(getConversation(db, 'conv-1')?.claude_session_id ?? null).toBeNull()
  }, 20_000)
})
