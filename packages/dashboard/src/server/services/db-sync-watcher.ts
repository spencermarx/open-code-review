/**
 * Watches `.ocr/data/ocr.db` on disk for external writes (from the CLI)
 * and syncs CLI-owned tables (sessions, orchestration_events) into the
 * dashboard's in-memory sql.js Database.
 *
 * This bridges the gap between the CLI (which writes to disk) and the
 * dashboard (which reads from an in-memory copy loaded at startup).
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, basename } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import initSqlJs, { type Database } from 'sql.js'
import type { Server as SocketIOServer } from 'socket.io'
import { locateWasm, resultToRows } from '@open-code-review/cli/db'

// ── Types ──

type SqlValue = string | number | null

// ── Helpers ──

/** Row type with guaranteed key access (returns null for missing keys). */
type Row = { [key: string]: SqlValue }

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

    // Watch the parent directory rather than the file itself.
    //
    // The CLI's `saveDatabase` uses the atomic-rename pattern: write to a
    // temp file (`ocr.db.<pid>.tmp`), then rename over `ocr.db`. When you
    // watch a single file path, the watch handle is bound to the original
    // inode — atomic rename replaces the inode and the watcher loses the
    // file silently on some platforms (notably macOS FSEvents). Watching
    // the directory and filtering by name catches the rename uniformly
    // across macOS/Linux/Windows.
    // Watch the parent directory and filter to events on `ocr.db`.
    //
    // Why directory-level: the CLI's `saveDatabase` uses atomic rename
    // (write to `ocr.db.<pid>.tmp`, rename over `ocr.db`). A single-file
    // watch binds to the original inode — atomic rename replaces the inode
    // and the watcher loses the file silently on macOS FSEvents.
    //
    // Why polling: chokidar's native FSEvents in macOS tmp directories
    // (used by e2e harnesses) is unreliable. Polling is platform-uniform
    // and the cost is one stat per interval over a tiny directory.
    const watchDir = dirname(this.dbFilePath)
    const watchedFile = basename(this.dbFilePath)
    this.watcher = watch(watchDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 0,
      usePolling: true,
      interval: 200,
    })

    const onAnyEvent = (path: string) => {
      if (basename(path) === watchedFile) this.debouncedSync()
    }
    this.watcher.on('change', onAnyEvent)
    this.watcher.on('add', onAnyEvent)
    this.watcher.on('unlink', onAnyEvent)
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
   *
   * Public for direct use; also called automatically via registered save hooks
   * to avoid overwriting CLI changes.
   */
  syncFromDisk(): void {
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
      this.syncAgentSessions(diskDb)

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
    const diskSessions = resultToRows<Row>(diskDb.exec('SELECT * FROM sessions'))

    for (const row of diskSessions) {
      const id = col(row, 'id') as string
      if (!id) continue

      // Check if in-memory has this session
      const memResult = this.db.exec(
        'SELECT current_phase, phase_number, status, updated_at FROM sessions WHERE id = ?',
        [id],
      )
      const memRows = resultToRows<Row>(memResult)

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
    const diskEvents = resultToRows<Row>(
      diskDb.exec('SELECT * FROM orchestration_events ORDER BY id ASC'),
    )

    const newEvents: Row[] = []
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
      newEvents.push(row)
      affectedSessions.add(sessionId)
    }

    // Process only newly inserted completion events (not historical ones)
    for (const row of newEvents) {
      const eventType = col(row, 'event_type') as string
      const sessionId = col(row, 'session_id') as string
      const metadataStr = col(row, 'metadata') as string | null

      if (eventType === 'round_completed') {
        const roundNumber = col(row, 'round') as number | null
        if (sessionId && roundNumber && metadataStr) {
          this.processRoundCompletedEvent(sessionId, roundNumber, metadataStr)
        }
      } else if (eventType === 'map_completed') {
        const runNumber = col(row, 'round') as number | null // round column stores map run #
        if (sessionId && runNumber && metadataStr) {
          this.processMapCompletedEvent(sessionId, runNumber, metadataStr)
        }
      }
    }

    // Emit events for affected sessions so the client refreshes
    if (newEvents.length > 0) {
      for (const sessionId of affectedSessions) {
        this.io.to(`session:${sessionId}`).emit('session:events', { session_id: sessionId })
      }
    }
  }

  /**
   * Sync the `command_executions` table from disk → in-memory.
   *
   * Migration v11 unified `agent_sessions` into `command_executions`. The
   * journal fields (`vendor`, `vendor_session_id`, `persona`, `resolved_model`,
   * `last_heartbeat_at`, `notes`, …) live on the same table. Rows the CLI
   * writes via `ocr session start-instance` / `bind-vendor-id` / `beat` /
   * `end-instance` flow through atomic file rename, so the disk file is the
   * source of truth.
   *
   * Strategy: full mirror via `INSERT OR REPLACE` keyed on the integer
   * primary key. The table is small enough that copying every row each
   * sync is cheap. Emits `agent_session:updated` with affected workflow ids
   * so the dashboard's query cache invalidates selectively.
   */
  private syncAgentSessions(diskDb: Database): void {
    const diskRows = resultToRows<Row>(
      diskDb.exec('SELECT * FROM command_executions'),
    )
    if (diskRows.length === 0) return

    const affectedWorkflows = new Set<string>()
    let changed = 0

    for (const row of diskRows) {
      const id = col(row, 'id') as number
      const workflowId = col(row, 'workflow_id') as string | null
      const heartbeat = col(row, 'last_heartbeat_at') as string | null
      const finishedAt = col(row, 'finished_at') as string | null
      const exitCode = col(row, 'exit_code') as number | null

      const existing = this.db.exec(
        'SELECT last_heartbeat_at, finished_at, exit_code FROM command_executions WHERE id = ?',
        [id],
      )
      const existingRow = existing[0]?.values?.[0]
      const sameHeartbeat = (existingRow?.[0] ?? null) === heartbeat
      const sameFinished = (existingRow?.[1] ?? null) === finishedAt
      const sameExit = (existingRow?.[2] ?? null) === exitCode
      if (existingRow && sameHeartbeat && sameFinished && sameExit) continue

      this.db.run(
        `INSERT OR REPLACE INTO command_executions
           (id, uid, command, args, exit_code, started_at, finished_at, output,
            pid, is_detached, workflow_id, parent_id, vendor, vendor_session_id,
            persona, instance_index, name, resolved_model, last_heartbeat_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          col(row, 'uid'),
          col(row, 'command'),
          col(row, 'args'),
          exitCode,
          col(row, 'started_at'),
          finishedAt,
          col(row, 'output'),
          col(row, 'pid'),
          col(row, 'is_detached'),
          workflowId,
          col(row, 'parent_id'),
          col(row, 'vendor'),
          col(row, 'vendor_session_id'),
          col(row, 'persona'),
          col(row, 'instance_index'),
          col(row, 'name'),
          col(row, 'resolved_model'),
          heartbeat,
          col(row, 'notes'),
        ],
      )
      // Only emit invalidation for rows that participate in the journal
      // (i.e. AI-spawned commands with heartbeat). Vanilla utility command
      // rows still sync (so the history view stays current) but don't
      // trigger agent_session:updated.
      if (heartbeat !== null && workflowId) {
        affectedWorkflows.add(workflowId)
      }
      changed++
    }

    if (changed > 0 && affectedWorkflows.size > 0) {
      this.io.emit('agent_session:updated', {
        workflow_ids: Array.from(affectedWorkflows),
      })
    }
  }

  /**
   * Process a `round_completed` orchestration event.
   * Upserts review_rounds with orchestrator data for real-time dashboard updates.
   * Idempotent — skips if round already has source='orchestrator'.
   */
  private processRoundCompletedEvent(
    sessionId: string,
    roundNumber: number,
    metadataStr: string,
  ): void {
    let metadata: Record<string, unknown>
    try {
      metadata = JSON.parse(metadataStr)
    } catch {
      return
    }

    // Check if orchestrator already populated this round
    const existing = this.db.exec(
      'SELECT source FROM review_rounds WHERE session_id = ? AND round_number = ?',
      [sessionId, roundNumber],
    )
    const rows = resultToRows<Row>(existing)
    if (rows.length > 0 && col(rows[0]!, 'source') === 'orchestrator') {
      return // Already populated — idempotent
    }

    // Ensure round row exists
    this.db.run(
      `INSERT OR IGNORE INTO review_rounds (session_id, round_number)
       VALUES (?, ?)`,
      [sessionId, roundNumber],
    )

    // Update with orchestrator data
    this.db.run(
      `UPDATE review_rounds
       SET verdict = ?, blocker_count = ?, suggestion_count = ?, should_fix_count = ?,
           reviewer_count = ?, total_finding_count = ?, source = 'orchestrator',
           parsed_at = datetime('now')
       WHERE session_id = ? AND round_number = ?`,
      [
        (metadata.verdict as string) ?? null,
        (metadata.blocker_count as number) ?? 0,
        (metadata.suggestion_count as number) ?? 0,
        (metadata.should_fix_count as number) ?? 0,
        (metadata.reviewer_count as number) ?? 0,
        (metadata.total_finding_count as number) ?? 0,
        sessionId,
        roundNumber,
      ],
    )

    // Emit real-time update (room-scoped to avoid cross-session noise)
    this.io.to(`session:${sessionId}`).emit('round:updated', {
      sessionId,
      roundNumber,
      verdict: metadata.verdict,
      blockerCount: metadata.blocker_count,
      shouldFixCount: metadata.should_fix_count,
      suggestionCount: metadata.suggestion_count,
      source: 'orchestrator',
    })
  }

  /**
   * Process a `map_completed` orchestration event.
   * Upserts map_runs with orchestrator data for real-time dashboard updates.
   * Idempotent — skips if run already has source='orchestrator'.
   */
  private processMapCompletedEvent(
    sessionId: string,
    runNumber: number,
    metadataStr: string,
  ): void {
    let metadata: Record<string, unknown>
    try {
      metadata = JSON.parse(metadataStr)
    } catch {
      return
    }

    // Check if orchestrator already populated this run
    const existing = this.db.exec(
      'SELECT source FROM map_runs WHERE session_id = ? AND run_number = ?',
      [sessionId, runNumber],
    )
    const rows = resultToRows<Row>(existing)
    if (rows.length > 0 && col(rows[0]!, 'source') === 'orchestrator') {
      return // Already populated — idempotent
    }

    // Ensure run row exists
    this.db.run(
      `INSERT OR IGNORE INTO map_runs (session_id, run_number)
       VALUES (?, ?)`,
      [sessionId, runNumber],
    )

    // Update with orchestrator data
    this.db.run(
      `UPDATE map_runs
       SET file_count = ?, section_count = ?, source = 'orchestrator',
           parsed_at = datetime('now')
       WHERE session_id = ? AND run_number = ?`,
      [
        (metadata.file_count as number) ?? 0,
        (metadata.section_count as number) ?? 0,
        sessionId,
        runNumber,
      ],
    )

    // Emit real-time update (room-scoped to avoid cross-session noise)
    this.io.to(`session:${sessionId}`).emit('map:updated', {
      sessionId,
      runNumber,
      fileCount: metadata.file_count,
      sectionCount: metadata.section_count,
      source: 'orchestrator',
    })
  }

  /**
   * Record current mtime after the dashboard writes to disk.
   * Called automatically via registered save hooks after saveDb().
   */
  markOwnWrite(): void {
    try {
      this.lastMtime = statSync(this.dbFilePath).mtimeMs
    } catch {
      // File may have been deleted
    }
  }
}
