/**
 * Watches `.ocr/data/ocr.db` on disk for external writes (from the CLI)
 * and syncs CLI-owned tables (sessions, orchestration_events) into the
 * dashboard's in-memory sql.js Database.
 *
 * This bridges the gap between the CLI (which writes to disk) and the
 * dashboard (which reads from an in-memory copy loaded at startup).
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { watch, type FSWatcher } from 'chokidar'
import initSqlJs, { type Database } from 'sql.js'
import type { Server as SocketIOServer } from 'socket.io'

// ── Types ──

type SqlValue = string | number | null

// ── WASM location (shared with db.ts) ──

function locateWasm(): string {
  const require = createRequire(import.meta.url)
  const sqlJsPath = require.resolve('sql.js')
  return join(dirname(sqlJsPath), 'sql-wasm.wasm')
}

// ── Helpers ──

/** Row type with guaranteed key access (returns null for missing keys). */
type Row = { [key: string]: SqlValue }

function resultToRows(
  result: ReturnType<Database['exec']>,
): Row[] {
  if (result.length === 0 || !result[0]) return []
  const { columns, values } = result[0]
  return values.map((row) => {
    const obj: Row = {}
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i] as string] = row[i] as SqlValue
    }
    return obj
  })
}

/** Safe accessor — returns null for missing keys. */
function col(row: Row, key: string): SqlValue {
  return row[key] ?? null
}

// ── Main Service ──

export class DbSyncWatcher {
  private watcher: FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private lastMtime = 0
  private wasmBinary: ArrayBuffer | null = null
  private SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null

  constructor(
    private db: Database,
    private dbFilePath: string,
    private io: SocketIOServer,
    private onSync?: () => void,
  ) {}

  /**
   * Initialize the WASM runtime (called once at startup).
   */
  async init(): Promise<void> {
    const wasmBuffer = readFileSync(locateWasm())
    this.wasmBinary = wasmBuffer.buffer.slice(
      wasmBuffer.byteOffset,
      wasmBuffer.byteOffset + wasmBuffer.byteLength,
    )
    this.SQL = await initSqlJs({ wasmBinary: this.wasmBinary })
  }

  /**
   * Start watching the DB file for external changes.
   */
  startWatching(): void {
    if (!existsSync(this.dbFilePath)) return

    // Record initial mtime so we don't trigger on our own writes
    try {
      this.lastMtime = statSync(this.dbFilePath).mtimeMs
    } catch {
      // File may not exist yet
    }

    this.watcher = watch(this.dbFilePath, {
      // Also watch WAL/SHM files that SQLite may create
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
    })

    this.watcher.on('change', () => {
      this.debouncedSync()
    })
  }

  /**
   * Stop watching.
   */
  stopWatching(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.watcher) {
      void this.watcher.close()
      this.watcher = null
    }
  }

  /**
   * Debounce sync to avoid rapid reloads during multi-statement writes.
   */
  private debouncedSync(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.syncFromDisk()
    }, 300)
  }

  /**
   * Read the on-disk DB and sync CLI-owned tables into the in-memory DB.
   *
   * Only syncs `sessions` and `orchestration_events` — these are the tables
   * the CLI writes to via `ocr state` commands. All other tables are
   * dashboard-owned and untouched.
   */
  private syncFromDisk(): void {
    if (!this.SQL || !existsSync(this.dbFilePath)) return

    // Check if the file actually changed since our last sync
    let currentMtime: number
    try {
      currentMtime = statSync(this.dbFilePath).mtimeMs
    } catch {
      return
    }
    if (currentMtime <= this.lastMtime) return
    this.lastMtime = currentMtime

    let diskDb: Database | null = null
    try {
      const fileBuffer = readFileSync(this.dbFilePath)
      diskDb = new this.SQL.Database(fileBuffer)

      this.syncSessions(diskDb)
      this.syncEvents(diskDb)

      this.onSync?.()
    } catch (err) {
      console.error('[DbSyncWatcher] Error syncing from disk:', err)
    } finally {
      diskDb?.close()
    }
  }

  /**
   * Sync the `sessions` table from disk → in-memory.
   * The CLI is authoritative for: current_phase, phase_number, status,
   * current_round, current_map_run, workflow_type, updated_at.
   */
  private syncSessions(diskDb: Database): void {
    const diskSessions = resultToRows(diskDb.exec('SELECT * FROM sessions'))

    for (const row of diskSessions) {
      const id = col(row, 'id') as string
      if (!id) continue

      // Check if in-memory has this session
      const memResult = this.db.exec(
        'SELECT current_phase, phase_number, status, updated_at FROM sessions WHERE id = ?',
        [id],
      )
      const memRows = resultToRows(memResult)

      if (memRows.length === 0) {
        // Session exists on disk but not in memory — insert it
        this.db.run(
          `INSERT INTO sessions (id, branch, status, workflow_type, current_phase, phase_number, current_round, current_map_run, started_at, updated_at, session_dir)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            col(row, 'id'), col(row, 'branch'), col(row, 'status'), col(row, 'workflow_type'),
            col(row, 'current_phase'), col(row, 'phase_number'), col(row, 'current_round'),
            col(row, 'current_map_run'), col(row, 'started_at'), col(row, 'updated_at'), col(row, 'session_dir'),
          ],
        )
        this.io.emit('session:created', {
          id,
          branch: col(row, 'branch'),
          workflow_type: col(row, 'workflow_type'),
          status: col(row, 'status'),
          current_phase: col(row, 'current_phase'),
        })
      } else {
        const mem = memRows[0]!
        // Only update if disk has newer data
        const diskPhase = col(row, 'phase_number') as number
        const memPhase = col(mem, 'phase_number') as number
        const diskStatus = col(row, 'status') as string
        const memStatus = col(mem, 'status') as string
        const diskCurrent = col(row, 'current_phase') as string
        const memCurrent = col(mem, 'current_phase') as string

        if (diskPhase !== memPhase || diskStatus !== memStatus || diskCurrent !== memCurrent) {
          this.db.run(
            `UPDATE sessions
             SET current_phase = ?, phase_number = ?, status = ?,
                 current_round = ?, current_map_run = ?, workflow_type = ?,
                 updated_at = ?
             WHERE id = ?`,
            [
              col(row, 'current_phase'), col(row, 'phase_number'), col(row, 'status'),
              col(row, 'current_round'), col(row, 'current_map_run'), col(row, 'workflow_type'),
              col(row, 'updated_at'), id,
            ],
          )
          this.io.emit('session:updated', {
            id,
            status: col(row, 'status'),
            current_phase: col(row, 'current_phase'),
            phase_number: col(row, 'phase_number'),
          })
        }
      }
    }
  }

  /**
   * Sync the `orchestration_events` table from disk → in-memory.
   * Events are append-only, so we INSERT any that don't exist yet.
   */
  private syncEvents(diskDb: Database): void {
    // Find the highest event ID currently in memory for each session
    const diskEvents = resultToRows(
      diskDb.exec('SELECT * FROM orchestration_events ORDER BY id ASC'),
    )

    let insertedCount = 0
    const affectedSessions = new Set<string>()

    for (const row of diskEvents) {
      const eventId = col(row, 'id') as number
      const sessionId = col(row, 'session_id') as string

      // Check if this event already exists in memory
      const existing = this.db.exec(
        'SELECT id FROM orchestration_events WHERE id = ?',
        [eventId],
      )
      if (existing.length > 0 && existing[0]?.values.length !== 0) continue

      // Insert the event
      this.db.run(
        `INSERT OR IGNORE INTO orchestration_events (id, session_id, event_type, phase, phase_number, round, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId, sessionId, col(row, 'event_type'),
          col(row, 'phase'), col(row, 'phase_number'), col(row, 'round'),
          col(row, 'metadata'), col(row, 'created_at'),
        ],
      )
      insertedCount++
      affectedSessions.add(sessionId)
    }

    // Emit events for affected sessions so the client refreshes
    if (insertedCount > 0) {
      for (const sessionId of affectedSessions) {
        this.io.emit('session:events', { session_id: sessionId })
      }
    }
  }

  /**
   * Record current mtime after the dashboard writes to disk.
   * Call this after saveDb() to prevent re-syncing our own writes.
   */
  markOwnWrite(): void {
    try {
      this.lastMtime = statSync(this.dbFilePath).mtimeMs
    } catch {
      // File may have been deleted
    }
  }
}
