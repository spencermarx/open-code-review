/**
 * DbSyncWatcher resilience regressions.
 *
 * Specifically guards against the WASM `memory access out of bounds`
 * crash that surfaced when `readFileSync` raced an in-flight atomic
 * rename and got back a partial / temp / zero-byte file. The watcher
 * now validates the SQLite magic header before handing the buffer to
 * sql.js and only advances `lastMtime` on a successful load.
 *
 * The header validator is a private constant; we test it through the
 * watcher's behavior — torn reads must not throw and must leave the
 * watermark untouched so the next change event retries.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'sql.js'
import type { Server as SocketIOServer } from 'socket.io'
import { DbSyncWatcher } from '../db-sync-watcher.js'

// Minimal fakes — the watcher's `init()` loads the real sql.js wasm
// module. We only test syncFromDisk's resilience here, so we
// monkey-construct a watcher with the SQL field manually populated to a
// trampoline that throws if ever called. A torn read should NEVER reach
// sql.js — the header validator should reject the buffer first.

let workspace: string
let dbPath: string
let watcher: DbSyncWatcher

class ThrowingDatabase {
  constructor() {
    throw new Error('SQL.Database should not be constructed for invalid headers')
  }
  close(): void {}
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'ocr-watcher-'))
  dbPath = join(workspace, 'ocr.db')

  const fakeDb = {
    run: () => {},
    exec: () => [],
    close: () => {},
  } as unknown as Database

  const fakeIo = {
    emit: () => {},
    to: () => ({ emit: () => {} }),
  } as unknown as SocketIOServer

  watcher = new DbSyncWatcher(fakeDb, dbPath, fakeIo)
  ;(watcher as unknown as { SQL: unknown }).SQL = {
    Database: ThrowingDatabase,
  }
})

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('syncFromDisk resilience', () => {
  it('returns silently when the file does not start with the SQLite magic header', () => {
    // Write a plausible-looking but invalid db file: zero-padded buffer.
    writeFileSync(dbPath, Buffer.alloc(4096), { mode: 0o644 })
    expect(() => watcher.syncFromDisk()).not.toThrow()
  })

  it('returns silently for a zero-byte file', () => {
    writeFileSync(dbPath, '', { mode: 0o644 })
    expect(() => watcher.syncFromDisk()).not.toThrow()
  })

  it('returns silently for a truncated file (header partially written)', () => {
    // Only the first 8 bytes of the 16-byte magic — simulates the worst-case
    // mid-rename window where we read a few bytes of the new file.
    writeFileSync(dbPath, Buffer.from('SQLite f', 'utf-8'), { mode: 0o644 })
    expect(() => watcher.syncFromDisk()).not.toThrow()
  })

  it('does not advance lastMtime when the load short-circuits on bad header', () => {
    writeFileSync(dbPath, Buffer.alloc(2048), { mode: 0o644 })
    const before = (watcher as unknown as { lastMtime: number }).lastMtime
    watcher.syncFromDisk()
    const after = (watcher as unknown as { lastMtime: number }).lastMtime
    expect(after).toBe(before)
  })
})

describe('syncAgentSessions — CLI-mutable column equality check', () => {
  // Regression for the cross-process write loss bug:
  //
  // The CLI's `state init` UPDATEs `command_executions.workflow_id` on
  // disk. The dashboard's syncAgentSessions used to compare only
  // (last_heartbeat_at, finished_at, exit_code). When the CLI changed
  // `workflow_id` without touching those three, the sync skipped the
  // in-memory UPDATE — the dashboard's stale in-memory copy was then
  // written back to disk on the next saveDb, wiping the link.
  //
  // The fix includes `workflow_id` and `vendor_session_id` in the
  // diff. We test by exercising the equality check through the
  // private method directly — the test substitutes a real-shaped
  // disk db via the fake adapter pattern.
  it('detects workflow_id changes on disk and updates in-memory', () => {
    // Track whether `db.run(INSERT OR REPLACE...)` was called for the
    // synced row. The bug was that it WASN'T called.
    let replaceCalled = false
    const memoryDb = {
      run: (sql: string) => {
        if (sql.includes('INSERT OR REPLACE INTO command_executions')) {
          replaceCalled = true
        }
      },
      exec: (sql: string) => {
        // Simulate the in-memory row: same heartbeat/finished/exit as
        // disk, but workflow_id is NULL (the bug shape — CLI just
        // wrote workflow_id, dashboard's memory hasn't seen it).
        if (sql.includes('SELECT last_heartbeat_at')) {
          return [{
            columns: ['last_heartbeat_at', 'finished_at', 'exit_code', 'workflow_id', 'vendor_session_id'],
            values: [['2026-05-04T14:00:00Z', null, null, null, 'vendor-abc']],
          }]
        }
        return []
      },
      close: () => {},
    } as unknown as Database

    const fakeIo = {
      emit: () => {},
      to: () => ({ emit: () => {} }),
    } as unknown as SocketIOServer

    const w = new DbSyncWatcher(memoryDb, dbPath, fakeIo)
    // Disk row: same heartbeat/finished/exit as memory, but
    // workflow_id is now SET (CLI just wrote it).
    const diskDb = {
      exec: () => [{
        columns: [
          'id', 'uid', 'command', 'args', 'exit_code', 'started_at',
          'finished_at', 'output', 'pid', 'is_detached', 'workflow_id',
          'parent_id', 'vendor', 'vendor_session_id', 'persona',
          'instance_index', 'name', 'resolved_model', 'last_heartbeat_at', 'notes',
        ],
        values: [[
          1, 'uid-1', 'ocr review', '[]', null, '2026-05-04T13:00:00Z',
          null, null, 12345, 0, 'wf-link-from-cli',
          null, 'claude', 'vendor-abc', null,
          null, null, null, '2026-05-04T14:00:00Z', null,
        ]],
      }],
      close: () => {},
    } as unknown as Database

    ;(w as unknown as { syncAgentSessions: (d: Database) => void }).syncAgentSessions(diskDb)

    expect(replaceCalled).toBe(true)
  })
})
