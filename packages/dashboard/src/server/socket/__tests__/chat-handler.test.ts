/**
 * Ask the Team spawn options.
 *
 * Runs the real `chat:send` handler against a real node:sqlite database; the
 * only fake is the AI CLI adapter (the external process boundary), which
 * records the options it is asked to spawn with.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Database } from '@open-code-review/persistence'
import { makeTempWorkspace, removeTempWorkspace } from '@open-code-review/persistence/test-support'
import { openDb } from '../../db.js'
import type { AiCliService } from '../../services/ai-cli/index.js'
import type { SpawnOptions } from '../../services/ai-cli/types.js'
import { registerChatHandlers } from '../chat-handler.js'

let workspace: string
let ocrDir: string
let db: Database

beforeEach(async () => {
  workspace = makeTempWorkspace('chat-handler-')
  ocrDir = join(workspace, '.ocr')
  mkdirSync(join(ocrDir, 'data'), { recursive: true })
  db = await openDb(ocrDir)
  db.run(
    `INSERT INTO sessions (id, branch, status, workflow_type, current_phase, phase_number, current_round, current_map_run, session_dir)
     VALUES ('s1', 'feat/x', 'active', 'review', 'phase-0', 0, 1, 0, ?)`,
    [join(ocrDir, 'sessions', 's1')],
  )
})

afterEach(() => {
  removeTempWorkspace(workspace)
})

describe('chat:send spawn options', () => {
  it('allows enough turns for read-only tool calls before the answer', () => {
    let spawned: SpawnOptions | undefined
    const aiCliService = {
      isAvailable: () => true,
      getAdapter: () => ({
        // Throwing right after recording keeps the test off the process plumbing;
        // the handler's own try/catch turns it into an `error` socket event.
        spawn: (opts: SpawnOptions) => {
          spawned = opts
          throw new Error('stop after recording options')
        },
      }),
    } as unknown as AiCliService

    const handlers = new Map<string, (payload: unknown) => void>()
    const socket = {
      on: (event: string, fn: (payload: unknown) => void) => handlers.set(event, fn),
      emit: () => true,
    } as unknown as Socket

    registerChatHandlers({} as SocketIOServer, socket, db, ocrDir, aiCliService)
    handlers.get('chat:send')?.({
      conversationId: 'c1',
      sessionId: 's1',
      targetType: 'review_round',
      targetId: 1,
      message: 'why is this a blocker?',
    })

    expect(spawned).toBeDefined()
    expect(spawned?.allowedTools).toEqual(['Read', 'Grep', 'Glob'])
    // Each Read/Grep/Glob call consumes a turn; 1 ends the process ("max turns", exit 1) before the answer.
    expect(spawned?.maxTurns).toBeGreaterThan(1)
  })
})
