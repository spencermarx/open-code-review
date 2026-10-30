/**
 * DbSyncWatcher change-notifier behavior.
 *
 * Under node:sqlite + WAL the watcher no longer merges a separate disk
 * copy — it diffs the live shared database against cached snapshots and
 * emits granular Socket.IO events. These tests exercise that contract:
 * new sessions emit `session:created` + fire the auto-link hook exactly
 * once; mutated sessions emit `session:updated`; unchanged scans are silent.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import {
  openDatabase,
  runMigrations,
  insertEvent,
  insertSession,
  updateSession,
  type Database,
} from '@open-code-review/persistence'
import { makeTempWorkspace, removeTempWorkspace } from '@open-code-review/persistence/test-support'
import type { Server as SocketIOServer } from 'socket.io'
import { DbSyncWatcher } from '../db-sync-watcher.js'

type Emit = { event: string; payload: unknown }

function makeIo(emits: Emit[]): SocketIOServer {
  return {
    emit: (event: string, payload: unknown) => {
      emits.push({ event, payload })
    },
    to: () => ({
      emit: (event: string, payload: unknown) => {
        emits.push({ event, payload })
      },
    }),
  } as unknown as SocketIOServer
}

let workspace: string
let dbPath: string
let db: Database
let emits: Emit[]

beforeEach(async () => {
  workspace = makeTempWorkspace('ocr-watcher-')
  dbPath = join(workspace, 'ocr.db')
  db = await openDatabase(dbPath)
  runMigrations(db)
  emits = []
})

afterEach(() => {
  removeTempWorkspace(workspace)
})

describe('DbSyncWatcher change notification', () => {
  it('emits session:created and fires onSessionInserted once for a new session', async () => {
    const inserted: string[] = []
    const watcher = new DbSyncWatcher(db, dbPath, makeIo(emits), (s) =>
      inserted.push(s.id),
    )
    await watcher.init() // primes snapshots — nothing seen yet

    insertSession(db, {
      id: 'sess-1',
      branch: 'feat/x',
      workflow_type: 'review',
      session_dir: '.ocr/sessions/sess-1',
    })

    watcher.syncFromDisk()
    expect(emits.filter((e) => e.event === 'session:created')).toHaveLength(1)
    expect(inserted).toEqual(['sess-1'])

    // A second scan with no changes is silent and does not re-fire the hook.
    watcher.syncFromDisk()
    expect(emits.filter((e) => e.event === 'session:created')).toHaveLength(1)
    expect(inserted).toEqual(['sess-1'])
  })

  it('does not re-emit sessions that existed at prime time', async () => {
    insertSession(db, {
      id: 'pre-existing',
      branch: 'feat/y',
      workflow_type: 'review',
      session_dir: '.ocr/sessions/pre-existing',
    })
    const watcher = new DbSyncWatcher(db, dbPath, makeIo(emits))
    await watcher.init() // session already present → snapshotted

    watcher.syncFromDisk()
    expect(emits.filter((e) => e.event === 'session:created')).toHaveLength(0)
  })

  it('emits session:updated when a session changes', async () => {
    insertSession(db, {
      id: 'sess-2',
      branch: 'feat/z',
      workflow_type: 'review',
      session_dir: '.ocr/sessions/sess-2',
    })
    const watcher = new DbSyncWatcher(db, dbPath, makeIo(emits))
    await watcher.init()

    updateSession(db, 'sess-2', {
      current_phase: 'reviews',
      phase_number: 4,
    })

    watcher.syncFromDisk()
    const updates = emits.filter((e) => e.event === 'session:updated')
    expect(updates).toHaveLength(1)
    expect((updates[0]!.payload as { current_phase: string }).current_phase).toBe('reviews')
  })

  it('materializes and announces a newly started review round before artifacts exist', async () => {
    insertSession(db, {
      id: 'sess-round-live',
      branch: 'feat/round-live',
      workflow_type: 'review',
      session_dir: '.ocr/sessions/sess-round-live',
    })
    const watcher = new DbSyncWatcher(db, dbPath, makeIo(emits))
    await watcher.init()

    insertEvent(db, {
      session_id: 'sess-round-live',
      event_type: 'round_started',
      phase: 'context',
      phase_number: 1,
      round: 2,
    })
    watcher.syncFromDisk()

    const rows = db.exec(
      'SELECT round_number FROM review_rounds WHERE session_id = ?',
      ['sess-round-live'],
    )
    expect(rows[0]?.values).toEqual([[2]])
    expect(emits).toContainEqual({
      event: 'round:updated',
      payload: {
        sessionId: 'sess-round-live',
        roundNumber: 2,
        source: 'lifecycle',
      },
    })
  })

  it('backfills a started review round that predates dashboard startup', async () => {
    insertSession(db, {
      id: 'sess-round-existing',
      branch: 'feat/round-existing',
      workflow_type: 'review',
      session_dir: '.ocr/sessions/sess-round-existing',
    })
    insertEvent(db, {
      session_id: 'sess-round-existing',
      event_type: 'round_started',
      phase: 'context',
      phase_number: 1,
      round: 2,
    })

    const watcher = new DbSyncWatcher(db, dbPath, makeIo(emits))
    await watcher.init()

    const rows = db.exec(
      'SELECT round_number FROM review_rounds WHERE session_id = ?',
      ['sess-round-existing'],
    )
    expect(rows[0]?.values).toEqual([[2]])
    expect(emits.filter((event) => event.event === 'round:updated')).toHaveLength(0)
  })
})
