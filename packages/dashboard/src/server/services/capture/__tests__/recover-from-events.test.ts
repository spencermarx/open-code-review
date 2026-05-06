/**
 * Tests for the JSONL replay recovery path.
 *
 * The recovery scans the events JSONL files we already write per
 * execution and surfaces any captured `session_id` event that the
 * relational state missed. This test exercises the helper directly
 * (Khorikov classical school — real fs + real sql.js DB).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { insertSession } from '@open-code-review/cli/db'
import { openDb } from '../../../db.js'
import {
  EventJournalAppender,
  eventsDir,
} from '../../event-journal.js'
import { recoverFromEventsJsonl } from '../recover-from-events.js'

let workspace: string
let ocrDir: string

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'recover-events-'))
  ocrDir = join(workspace, '.ocr')
  mkdirSync(join(ocrDir, 'data'), { recursive: true })
})

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true })
})

function seedExecution(
  db: Awaited<ReturnType<typeof openDb>>,
  workflowId: string | null,
  uid: string,
): number {
  db.run(
    `INSERT INTO command_executions
       (uid, command, args, started_at, vendor, last_heartbeat_at, workflow_id)
     VALUES (?, 'review', '[]', datetime('now'), 'claude', datetime('now'), ?)`,
    [uid, workflowId],
  )
  const result = db.exec('SELECT last_insert_rowid() as id')
  return result[0]?.values[0]?.[0] as number
}

async function setup() {
  const db = await openDb(ocrDir)
  return db
}

describe('recoverFromEventsJsonl', () => {
  it('returns empty result when no executions exist for the workflow', async () => {
    const db = await setup()
    const result = recoverFromEventsJsonl(ocrDir, db, 'unknown-wf')
    expect(result).toEqual({ found: null, sessionIdEventsObservedTotal: 0 })
  })

  it('returns empty result when executions exist but no events file is on disk', async () => {
    const db = await setup()
    insertSession(db, {
      id: 'wf-empty',
      branch: 'feat/empty',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-empty'),
    })
    seedExecution(db, 'wf-empty', 'uid-empty')

    const result = recoverFromEventsJsonl(ocrDir, db, 'wf-empty')
    expect(result).toEqual({ found: null, sessionIdEventsObservedTotal: 0 })
  })

  it('finds a session_id event and reports the count', async () => {
    const db = await setup()
    insertSession(db, {
      id: 'wf-recover',
      branch: 'feat/recover',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-recover'),
    })
    const executionId = seedExecution(db, 'wf-recover', 'uid-recover')

    // Write an events JSONL with a session_id event for this execution
    const journal = new EventJournalAppender(ocrDir, executionId)
    journal.append({
      executionId,
      agentId: 'principal-1',
      timestamp: new Date().toISOString(),
      seq: 1,
      type: 'session_id',
      id: 'recovered-vendor-id-abc',
    })
    await journal.close()

    const result = recoverFromEventsJsonl(ocrDir, db, 'wf-recover')
    expect(result.found).toEqual({
      executionId,
      vendorSessionId: 'recovered-vendor-id-abc',
    })
    expect(result.sessionIdEventsObservedTotal).toBe(1)
  })

  it('still counts session_id events on already-bound executions but does not pick them for backfill', async () => {
    const db = await setup()
    insertSession(db, {
      id: 'wf-already',
      branch: 'feat/already',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-already'),
    })
    const executionId = seedExecution(db, 'wf-already', 'uid-already')
    db.run(
      `UPDATE command_executions SET vendor_session_id = 'already-bound' WHERE id = ?`,
      [executionId],
    )

    const journal = new EventJournalAppender(ocrDir, executionId)
    journal.append({
      executionId,
      agentId: 'principal-1',
      timestamp: new Date().toISOString(),
      seq: 1,
      type: 'session_id',
      id: 'different-id',
    })
    await journal.close()

    const result = recoverFromEventsJsonl(ocrDir, db, 'wf-already')
    // No unbound execution → nothing to backfill, but the count
    // reflects what the journal saw.
    expect(result.found).toBeNull()
    expect(result.sessionIdEventsObservedTotal).toBe(1)
  })

  it('returns empty result when the events file has no session_id event', async () => {
    const db = await setup()
    insertSession(db, {
      id: 'wf-no-sid',
      branch: 'feat/no-sid',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-no-sid'),
    })
    const executionId = seedExecution(db, 'wf-no-sid', 'uid-no-sid')

    const journal = new EventJournalAppender(ocrDir, executionId)
    journal.append({
      executionId,
      agentId: 'principal-1',
      timestamp: new Date().toISOString(),
      seq: 1,
      type: 'message',
      text: 'hello',
    })
    await journal.close()

    const result = recoverFromEventsJsonl(ocrDir, db, 'wf-no-sid')
    expect(result).toEqual({ found: null, sessionIdEventsObservedTotal: 0 })
  })

  it('skips malformed JSONL lines without throwing', async () => {
    const db = await setup()
    insertSession(db, {
      id: 'wf-malformed',
      branch: 'feat/malformed',
      workflow_type: 'review',
      session_dir: resolve(ocrDir, 'sessions/wf-malformed'),
    })
    const executionId = seedExecution(db, 'wf-malformed', 'uid-malformed')

    const journalDir = eventsDir(ocrDir)
    writeFileSync(
      join(journalDir, `${executionId}.jsonl`),
      'not-valid-json\n' +
        JSON.stringify({
          executionId,
          agentId: 'principal-1',
          timestamp: new Date().toISOString(),
          seq: 1,
          type: 'session_id',
          id: 'mixed-content-recovered',
        }) +
        '\n',
    )

    const result = recoverFromEventsJsonl(ocrDir, db, 'wf-malformed')
    expect(result.found).toEqual({
      executionId,
      vendorSessionId: 'mixed-content-recovered',
    })
    expect(result.sessionIdEventsObservedTotal).toBe(1)
  })
})
