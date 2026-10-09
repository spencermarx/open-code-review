/**
 * Change notifier for `.ocr/data/ocr.db`.
 *
 * Under node:sqlite + WAL the CLI and dashboard share a single on-disk
 * database with native locking, so there is no in-memory copy to merge —
 * the dashboard's connection reads committed CLI writes live. This watcher's
 * sole remaining job is *notification*: detect external writes (from `ocr
 * state`/`ocr session` CLI commands), diff the live database against its own
 * cached snapshots, and emit the granular Socket.IO events the dashboard UI
 * subscribes to. It also fires the one-shot `onSessionInserted` hook used to
 * auto-link the dashboard's parent execution row to a new workflow, and
 * projects round lifecycle and completion events into the artifact tables.
 *
 * It performs NO merge writes to `sessions`/`orchestration_events` —
 * those are CLI-owned and already authoritative on the shared connection.
 */

import { existsSync } from 'node:fs'
import { dirname, basename } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import type { Server as SocketIOServer } from 'socket.io'
import { resultToRows, type Database } from '@open-code-review/persistence'

type SqlValue = string | number | null
type Row = { [key: string]: SqlValue }

function col(row: Row, key: string): SqlValue {
  return row[key] ?? null
}

export class DbSyncWatcher {
  private watcher: FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  // Snapshots of last-emitted state, so we only emit on genuine changes.
  private seenSessions = new Map<string, string>()
  private maxEventId = 0
  private seenCommandRows = new Map<number, string>()

  constructor(
    private db: Database,
    private dbFilePath: string,
    private io: SocketIOServer,
    /**
     * Fired exactly once per newly-observed `sessions` row (written by the
     * CLI's `ocr state begin`). Used to server-side auto-link the
     * dashboard's parent execution row to the workflow — robust against the
     * AI orchestrator failing to carry `OCR_DASHBOARD_EXECUTION_UID`.
     */
    private onSessionInserted?: (session: {
      id: string
      session_dir: string | null
      started_at: string
    }) => void,
  ) {}

  /**
   * Prime snapshots from the current database so existing state is not
   * re-emitted on first watch tick. (No WASM runtime to initialise under
   * the native engine.)
   */
  async init(): Promise<void> {
    this.materializeStartedRounds()
    this.primeSnapshots()
  }

  /**
   * Backfill review-round shells from lifecycle events that existed before
   * the dashboard started. Without this reconciliation an active round stays
   * absent from the rounds list until its first reviewer artifact is written.
   */
  private materializeStartedRounds(): void {
    const rows = resultToRows<Row>(
      this.db.exec(
        `SELECT DISTINCT session_id, round
           FROM orchestration_events
          WHERE event_type = 'round_started' AND round IS NOT NULL`,
      ),
    )
    for (const row of rows) {
      const sessionId = col(row, 'session_id') as string
      const roundNumber = col(row, 'round') as number
      if (sessionId && roundNumber > 0) {
        this.ensureRoundExists(sessionId, roundNumber)
      }
    }
  }

  private primeSnapshots(): void {
    for (const row of this.readSessions()) {
      const id = col(row, 'id') as string
      if (id) this.seenSessions.set(id, sessionFingerprint(row))
    }
    const maxResult = this.db.exec('SELECT MAX(id) FROM orchestration_events')
    const maxVal = maxResult[0]?.values[0]?.[0]
    this.maxEventId = typeof maxVal === 'number' ? maxVal : 0
    for (const row of this.readCommandRows()) {
      const id = col(row, 'id') as number
      if (id != null) this.seenCommandRows.set(id, commandFingerprint(row))
    }
  }

  /** Start watching the DB file (and its WAL sidecar) for external writes. */
  startWatching(): void {
    if (!existsSync(this.dbFilePath)) return

    // Watch the parent directory and filter to the db file + its `-wal`
    // sidecar (WAL commits land in the sidecar before checkpoint). Polling
    // is platform-uniform and cheap over a tiny directory.
    const watchDir = dirname(this.dbFilePath)
    const dbFile = basename(this.dbFilePath)
    const walFile = `${dbFile}-wal`
    this.watcher = watch(watchDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 0,
      usePolling: true,
      interval: 200,
    })

    const onAnyEvent = (path: string) => {
      const name = basename(path)
      if (name === dbFile || name === walFile) this.debouncedSync()
    }
    this.watcher.on('change', onAnyEvent)
    this.watcher.on('add', onAnyEvent)
    this.watcher.on('unlink', onAnyEvent)
  }

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

  private debouncedSync(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.syncFromDisk()
    }, 300)
  }

  /**
   * Rescan the live database and emit notifications for anything that
   * changed since the last scan. Named `syncFromDisk` for call-site
   * compatibility; under the native engine it performs no merge writes —
   * it diffs the live connection against cached snapshots and emits.
   */
  syncFromDisk(): void {
    try {
      this.detectSessionChanges()
      this.detectNewEvents()
      this.detectCommandChanges()
    } catch (err) {
      console.error('[DbSyncWatcher] Error scanning for changes:', err)
    }
  }

  private readSessions(): Row[] {
    return resultToRows<Row>(this.db.exec('SELECT * FROM sessions'))
  }

  private readCommandRows(): Row[] {
    return resultToRows<Row>(
      this.db.exec(
        `SELECT id, last_heartbeat_at, finished_at, exit_code, workflow_id, vendor_session_id
           FROM command_executions`,
      ),
    )
  }

  private detectSessionChanges(): void {
    for (const row of this.readSessions()) {
      const id = col(row, 'id') as string
      if (!id) continue
      const fp = sessionFingerprint(row)
      const prev = this.seenSessions.get(id)
      if (prev === undefined) {
        this.seenSessions.set(id, fp)
        this.io.emit('session:created', {
          id,
          branch: col(row, 'branch'),
          workflow_type: col(row, 'workflow_type'),
          status: col(row, 'status'),
          current_phase: col(row, 'current_phase'),
        })
        try {
          this.onSessionInserted?.({
            id,
            session_dir: col(row, 'session_dir') as string | null,
            started_at: (col(row, 'started_at') as string | null) ?? '',
          })
        } catch (err) {
          console.error('[DbSyncWatcher] onSessionInserted hook failed:', err)
        }
      } else if (prev !== fp) {
        this.seenSessions.set(id, fp)
        this.io.emit('session:updated', {
          id,
          status: col(row, 'status'),
          current_phase: col(row, 'current_phase'),
          phase_number: col(row, 'phase_number'),
        })
      }
    }
  }

  private detectNewEvents(): void {
    const rows = resultToRows<Row>(
      this.db.exec(
        'SELECT * FROM orchestration_events WHERE id > ? ORDER BY id ASC',
        [this.maxEventId],
      ),
    )
    if (rows.length === 0) return

    const affectedSessions = new Set<string>()
    for (const row of rows) {
      const eventId = col(row, 'id') as number
      const sessionId = col(row, 'session_id') as string
      const eventType = col(row, 'event_type') as string
      const metadataStr = col(row, 'metadata') as string | null
      if (eventId > this.maxEventId) this.maxEventId = eventId
      if (sessionId) affectedSessions.add(sessionId)

      if (eventType === 'round_started') {
        const roundNumber = col(row, 'round') as number | null
        if (sessionId && roundNumber && roundNumber > 0) {
          this.processRoundStartedEvent(sessionId, roundNumber)
        }
      } else if (eventType === 'round_completed') {
        const roundNumber = col(row, 'round') as number | null
        if (sessionId && roundNumber && metadataStr) {
          this.processRoundCompletedEvent(sessionId, roundNumber, metadataStr)
        }
      } else if (eventType === 'map_completed') {
        const runNumber = col(row, 'round') as number | null
        if (sessionId && runNumber && metadataStr) {
          this.processMapCompletedEvent(sessionId, runNumber, metadataStr)
        }
      }
    }

    for (const sessionId of affectedSessions) {
      this.io.to(`session:${sessionId}`).emit('session:events', { session_id: sessionId })
    }
  }

  private ensureRoundExists(sessionId: string, roundNumber: number): void {
    this.db.run(
      `INSERT OR IGNORE INTO review_rounds (session_id, round_number) VALUES (?, ?)`,
      [sessionId, roundNumber],
    )
  }

  /** Materialize an active round before any reviewer artifacts exist. */
  private processRoundStartedEvent(sessionId: string, roundNumber: number): void {
    this.ensureRoundExists(sessionId, roundNumber)
    // Round lists exist both inside a session and on the global Reviews page,
    // so this notification must be global rather than room-scoped.
    this.io.emit('round:updated', {
      sessionId,
      roundNumber,
      source: 'lifecycle',
    })
  }

  private detectCommandChanges(): void {
    const affectedWorkflows = new Set<string>()
    for (const row of this.readCommandRows()) {
      const id = col(row, 'id') as number
      if (id == null) continue
      const fp = commandFingerprint(row)
      if (this.seenCommandRows.get(id) === fp) continue
      this.seenCommandRows.set(id, fp)
      const workflowId = col(row, 'workflow_id') as string | null
      const heartbeat = col(row, 'last_heartbeat_at') as string | null
      if (heartbeat !== null && workflowId) {
        affectedWorkflows.add(workflowId)
      }
    }
    if (affectedWorkflows.size > 0) {
      this.io.emit('agent_session:updated', {
        workflow_ids: Array.from(affectedWorkflows),
      })
    }
  }

  /**
   * Project a `round_completed` event into `review_rounds` (orchestrator
   * source latch) and emit a room-scoped `round:updated`. Idempotent.
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

    const existing = this.db.exec(
      'SELECT source FROM review_rounds WHERE session_id = ? AND round_number = ?',
      [sessionId, roundNumber],
    )
    const rows = resultToRows<Row>(existing)
    if (rows.length > 0 && col(rows[0]!, 'source') === 'orchestrator') {
      return
    }

    this.ensureRoundExists(sessionId, roundNumber)
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
   * Project a `map_completed` event into `map_runs` and emit a room-scoped
   * `map:updated`. Idempotent.
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

    const existing = this.db.exec(
      'SELECT source FROM map_runs WHERE session_id = ? AND run_number = ?',
      [sessionId, runNumber],
    )
    const rows = resultToRows<Row>(existing)
    if (rows.length > 0 && col(rows[0]!, 'source') === 'orchestrator') {
      return
    }

    this.db.run(
      `INSERT OR IGNORE INTO map_runs (session_id, run_number) VALUES (?, ?)`,
      [sessionId, runNumber],
    )
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

    this.io.to(`session:${sessionId}`).emit('map:updated', {
      sessionId,
      runNumber,
      fileCount: metadata.file_count,
      sectionCount: metadata.section_count,
      source: 'orchestrator',
    })
  }

}

function sessionFingerprint(row: Row): string {
  return [
    col(row, 'status'),
    col(row, 'current_phase'),
    col(row, 'phase_number'),
    col(row, 'current_round'),
    col(row, 'current_map_run'),
    col(row, 'updated_at'),
  ].join('|')
}

function commandFingerprint(row: Row): string {
  return [
    col(row, 'last_heartbeat_at'),
    col(row, 'finished_at'),
    col(row, 'exit_code'),
    col(row, 'workflow_id'),
    col(row, 'vendor_session_id'),
  ].join('|')
}
