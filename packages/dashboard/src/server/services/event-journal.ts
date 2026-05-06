/**
 * Event journal — JSONL persistence for live command streams.
 *
 * Each command_executions row gets one journal file at
 * `.ocr/data/events/<execution_id>.jsonl`. The command-runner appends one
 * `StreamEvent` per JSON line as the AI CLI emits them; the dashboard's
 * `GET /api/commands/:id/events` route reads the file back for rehydration
 * (page reload mid-run) and history-replay.
 *
 * Why JSONL on disk rather than a sqlite table:
 *   1. Append-only writes avoid the sql.js merge-before-write rename dance
 *      under high event throughput
 *   2. The format is trivially `tail -f`-able for humans debugging a run
 *   3. Event volume per execution is bounded but non-trivial (hundreds to
 *      low-thousands per active review) — keeping it out of the DB keeps
 *      the in-memory sql.js DB small
 *   4. No schema migration needed if the event union evolves
 *
 * Writes are best-effort and intentionally non-blocking — if the journal
 * write fails, the live socket emit still happens, and the user just loses
 * the ability to replay/reload-rehydrate that one event. The command itself
 * does NOT fail because of a journal error.
 */

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  type WriteStream,
} from 'node:fs'
import { join } from 'node:path'
import type { StreamEvent } from './ai-cli/types.js'

/**
 * Resolves the directory where event journals live for a given workspace.
 * Lazily creates the directory so first-run installs work without setup.
 */
export function eventsDir(ocrDir: string): string {
  const dir = join(ocrDir, 'data', 'events')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Resolves the journal file path for a single execution.
 * The file may or may not exist yet — appendEvent creates it on first write.
 */
export function eventJournalPath(ocrDir: string, executionId: number): string {
  return join(eventsDir(ocrDir), `${executionId}.jsonl`)
}

/**
 * Per-execution append handle. Keeps a write stream open for the lifetime
 * of the execution so we don't pay the open/close cost on every event.
 *
 * Call `close()` when the execution finishes. Idempotent.
 */
export class EventJournalAppender {
  private stream: WriteStream | null
  readonly path: string

  constructor(ocrDir: string, executionId: number) {
    this.path = eventJournalPath(ocrDir, executionId)
    // 'a' = append, creates if missing
    this.stream = createWriteStream(this.path, { flags: 'a' })
    // Errors on the stream are logged but don't crash the runner — this is
    // a best-effort journal, not a load-bearing path.
    this.stream.on('error', (err) => {
      console.error(`[event-journal] write error for ${this.path}:`, err)
      this.stream = null
    })
  }

  append(event: StreamEvent): void {
    if (!this.stream) return
    this.stream.write(JSON.stringify(event) + '\n')
  }

  /**
   * Close the underlying write stream. Returns a promise that resolves
   * once the OS has flushed all pending writes, so callers that need
   * to read the file back synchronously (tests, the events route on
   * a just-finished execution) can await this.
   *
   * Idempotent — calling close after the stream is already closed is
   * a no-op that resolves immediately.
   */
  close(): Promise<void> {
    if (!this.stream) return Promise.resolve()
    const stream = this.stream
    this.stream = null
    return new Promise<void>((resolve) => {
      stream.end(() => resolve())
    })
  }
}

/**
 * Reads all events for a given execution. Returns an empty array when no
 * journal exists yet (pre-AI command, journal write failed, or execution
 * predates the event-stream feature).
 *
 * The events are returned in write order. Malformed lines are skipped with
 * a warning rather than throwing — partial recovery is more useful than
 * an all-or-nothing failure for a debug surface.
 */
export function readEventJournal(ocrDir: string, executionId: number): StreamEvent[] {
  const path = eventJournalPath(ocrDir, executionId)
  if (!existsSync(path)) return []
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch {
    return []
  }
  const events: StreamEvent[] = []
  const lines = raw.split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line) as StreamEvent)
    } catch (err) {
      console.warn(`[event-journal] malformed line in ${path}:`, err)
    }
  }
  return events
}
