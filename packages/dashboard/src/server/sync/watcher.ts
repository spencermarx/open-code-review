/**
 * Real-time SQLite change detection for cross-process updates.
 *
 * Uses a dual strategy:
 * 1. WAL file watching (chokidar on .ocr/data/ocr.db-wal) for instant detection
 * 2. Polling fallback (500ms interval) for reliability
 *
 * When changes are detected, emits Socket.IO events to connected clients.
 */

import { watch, type FSWatcher } from 'chokidar'
import { join } from 'node:path'
import type { Database } from 'sql.js'
import type { Server as SocketIOServer } from 'socket.io'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import initSqlJs from 'sql.js'
import { emitToSession, emitGlobal } from '../socket/handlers.js'

// ── Types ──

interface SessionSnapshot {
  id: string
  status: string
  current_phase: string
  phase_number: number
  current_round: number
  current_map_run: number
  updated_at: string
}

interface WatcherState {
  lastEventId: number
  sessions: Map<string, SessionSnapshot>
}

// ── Change detection ──

const POLL_INTERVAL_MS = 500

/**
 * Reads the latest event ID from the database.
 */
function getLatestEventId(db: Database): number {
  const result = db.exec('SELECT MAX(id) as id FROM orchestration_events')
  if (result.length === 0 || !result[0] || result[0].values.length === 0) {
    return 0
  }
  const val = result[0].values[0]?.[0]
  return typeof val === 'number' ? val : 0
}

/**
 * Reads all current session snapshots for diffing.
 */
function getSessionSnapshots(db: Database): Map<string, SessionSnapshot> {
  const result = db.exec(
    'SELECT id, status, current_phase, phase_number, current_round, current_map_run, updated_at FROM sessions'
  )
  const map = new Map<string, SessionSnapshot>()
  if (result.length === 0 || !result[0]) {
    return map
  }
  const { columns, values } = result[0]
  for (const row of values) {
    const obj: Record<string, unknown> = {}
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i] as string] = row[i]
    }
    const snap = obj as unknown as SessionSnapshot
    map.set(snap.id, snap)
  }
  return map
}

/**
 * Reloads the in-memory database from the on-disk file.
 * Returns a fresh Database instance, or null if file doesn't exist.
 */
async function reloadDb(dbPath: string): Promise<Database | null> {
  if (!existsSync(dbPath)) {
    return null
  }

  const require = createRequire(import.meta.url)
  const sqlJsPath = require.resolve('sql.js')
  const wasmPath = join(dirname(sqlJsPath), 'sql-wasm.wasm')
  const wasmBuffer = readFileSync(wasmPath)
  const wasmBinary = wasmBuffer.buffer.slice(
    wasmBuffer.byteOffset,
    wasmBuffer.byteOffset + wasmBuffer.byteLength
  )

  const SQL = await initSqlJs({ wasmBinary })
  const fileBuffer = readFileSync(dbPath)
  const db = new SQL.Database(fileBuffer)
  db.run('PRAGMA foreign_keys = ON;')
  return db
}

/**
 * Compares snapshots and emits Socket.IO events for any changes.
 */
function diffAndEmit(
  io: SocketIOServer,
  oldSessions: Map<string, SessionSnapshot>,
  newSessions: Map<string, SessionSnapshot>
): void {
  // Detect new sessions
  for (const [id, snap] of newSessions) {
    if (!oldSessions.has(id)) {
      emitGlobal(io, 'session:created', snap)
    }
  }

  // Detect updated sessions
  for (const [id, newSnap] of newSessions) {
    const oldSnap = oldSessions.get(id)
    if (!oldSnap) continue

    if (oldSnap.updated_at !== newSnap.updated_at) {
      emitToSession(io, id, 'session:updated', newSnap)
      emitGlobal(io, 'session:updated', newSnap)
    }

    // Detect session closed
    if (oldSnap.status !== 'closed' && newSnap.status === 'closed') {
      emitToSession(io, id, 'session:closed', { session_id: id })
      emitGlobal(io, 'session:closed', { session_id: id })
    }

    if (oldSnap.current_phase !== newSnap.current_phase || oldSnap.phase_number !== newSnap.phase_number) {
      emitToSession(io, id, 'phase:changed', {
        session_id: id,
        phase: newSnap.current_phase,
        phase_number: newSnap.phase_number,
      })
    }
  }

  // Detect deleted sessions
  for (const [id] of oldSessions) {
    if (!newSessions.has(id)) {
      emitGlobal(io, 'session:deleted', { id })
    }
  }
}

// ── Watcher class ──

export class ChangeWatcher {
  private fsWatcher: FSWatcher | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private state: WatcherState = { lastEventId: 0, sessions: new Map() }
  private checkInProgress = false
  private watcherDb: Database | null = null

  constructor(
    private readonly ocrDir: string,
    private readonly io: SocketIOServer,
    private readonly db: Database
  ) {}

  /**
   * Starts both WAL file watching and polling fallback.
   */
  start(): void {
    // Initialize state from current DB
    this.state.lastEventId = getLatestEventId(this.db)
    this.state.sessions = getSessionSnapshots(this.db)

    // WAL file watching
    const walPath = join(this.ocrDir, 'data', 'ocr.db-wal')
    this.fsWatcher = watch(walPath, {
      persistent: false,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    })

    this.fsWatcher.on('change', () => {
      void this.checkForChanges()
    })

    this.fsWatcher.on('add', () => {
      void this.checkForChanges()
    })

    // Polling fallback
    this.pollTimer = setInterval(() => {
      void this.checkForChanges()
    }, POLL_INTERVAL_MS)

    console.log('Change watcher started')
  }

  /**
   * Checks for database changes and emits events.
   */
  private async checkForChanges(): Promise<void> {
    if (this.checkInProgress) return
    this.checkInProgress = true

    try {
      const dbPath = join(this.ocrDir, 'data', 'ocr.db')

      // Close previous watcher DB if exists
      if (this.watcherDb) {
        this.watcherDb.close()
        this.watcherDb = null
      }

      // Reload from disk to see cross-process changes
      const freshDb = await reloadDb(dbPath)
      if (!freshDb) return
      this.watcherDb = freshDb

      const newEventId = getLatestEventId(freshDb)
      const newSessions = getSessionSnapshots(freshDb)

      // Check if anything changed
      if (newEventId !== this.state.lastEventId) {
        emitGlobal(this.io, 'events:new', {
          previous_event_id: this.state.lastEventId,
          latest_event_id: newEventId,
        })
      }

      diffAndEmit(this.io, this.state.sessions, newSessions)

      // Update state
      this.state.lastEventId = newEventId
      this.state.sessions = newSessions
    } catch {
      // Silently ignore -- file may be in the middle of being written
    } finally {
      this.checkInProgress = false
    }
  }

  /**
   * Stops all watchers and cleans up.
   */
  stop(): void {
    if (this.fsWatcher) {
      void this.fsWatcher.close()
      this.fsWatcher = null
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }

    if (this.watcherDb) {
      this.watcherDb.close()
      this.watcherDb = null
    }

    console.log('Change watcher stopped')
  }
}
