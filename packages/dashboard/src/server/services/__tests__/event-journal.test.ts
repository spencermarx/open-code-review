/**
 * Event journal — round-trip + edge-case tests for the JSONL persistence
 * helper that backs `command:event` rehydration.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  EventJournalAppender,
  eventJournalPath,
  readEventJournal,
} from '../event-journal.js'
import type { StreamEvent } from '../ai-cli/types.js'

let workspace: string
let ocrDir: string

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'ocr-events-'))
  ocrDir = join(workspace, '.ocr')
})

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true })
})

function makeEvent(seq: number, overrides: Partial<StreamEvent> = {}): StreamEvent {
  return {
    type: 'text_delta',
    text: `chunk ${seq}`,
    executionId: 1,
    agentId: 'orchestrator',
    timestamp: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
    seq,
    ...overrides,
  } as StreamEvent
}

describe('event-journal', () => {
  it('appends each event as one JSON line and reads them back in order', async () => {
    const appender = new EventJournalAppender(ocrDir, 1)
    appender.append(makeEvent(1))
    appender.append(makeEvent(2, { type: 'message', text: 'final', executionId: 1 } as never))
    await appender.close()

    const path = eventJournalPath(ocrDir, 1)
    const raw = readFileSync(path, 'utf-8')
    const lines = raw.trim().split('\n')
    expect(lines).toHaveLength(2)

    const events = readEventJournal(ocrDir, 1)
    expect(events).toHaveLength(2)
    expect(events[0]?.seq).toBe(1)
    expect(events[1]?.seq).toBe(2)
  })

  it('returns an empty array when no journal exists', () => {
    expect(readEventJournal(ocrDir, 999)).toEqual([])
  })

  it('skips malformed lines rather than throwing', async () => {
    // Initialize directory by appending one valid event, then close.
    const appender = new EventJournalAppender(ocrDir, 7)
    appender.append(makeEvent(1))
    await appender.close()
    // Inject a malformed line at the end of the file.
    const path = eventJournalPath(ocrDir, 7)
    const original = readFileSync(path, 'utf-8')
    writeFileSync(path, original + '{this is not json}\n', 'utf-8')

    const events = readEventJournal(ocrDir, 7)
    expect(events).toHaveLength(1)
    expect(events[0]?.seq).toBe(1)
  })

  it('append after close is a no-op rather than throwing', () => {
    const appender = new EventJournalAppender(ocrDir, 11)
    appender.close()
    expect(() => appender.append(makeEvent(1))).not.toThrow()
  })

  it('lazily creates the events directory on first appender', async () => {
    // The appender's constructor should have created the directory; the
    // path is what we care about.
    const appender = new EventJournalAppender(ocrDir, 42)
    appender.append(makeEvent(1))
    await appender.close()
    const path = eventJournalPath(ocrDir, 42)
    expect(readFileSync(path, 'utf-8').length).toBeGreaterThan(0)
  })
})
