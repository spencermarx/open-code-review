import { describe, it, expect } from 'vitest'
import { compareEntries } from '../command-history'
import type { CommandHistoryEntry } from '../../hooks/use-commands'

/**
 * Pins the date sort against the mixed-timestamp-format hazard.
 *
 * `command_executions.started_at` arrives in TWO formats, both UTC:
 *   - ISO-8601 with `Z`            — dashboard writes (`new Date().toISOString()`)
 *   - `YYYY-MM-DD HH:MM:SS`        — CLI writes (SQLite `CURRENT_TIMESTAMP`)
 *
 * V8 parses the space-separated form as LOCAL time, so a bare `new Date()`
 * shifts only the CLI rows by the runner's UTC offset. Sorting then inverts
 * for any pair that straddles the two formats — the dates DISPLAY correctly
 * (every formatter already routes through `parseUtcDate`), only the order is
 * wrong, which is what made this hard to spot.
 *
 * These tests fix the process TZ so they fail on a machine in any offset
 * rather than passing by luck at UTC.
 */

const entry = (started_at: string, command = 'ocr review'): CommandHistoryEntry =>
  ({ started_at, command }) as CommandHistoryEntry

/** 15:39 local in UTC-7, written by the dashboard. */
const ISO_LATER = entry('2026-09-21T22:39:02.230Z', 'ocr address')
/** 12:06 local in UTC-7, written by the CLI — genuinely EARLIER. */
const SQLITE_EARLIER = entry('2026-09-21 19:06:44', 'ocr session start-instance')

describe('compareEntries — date', () => {
  it('orders a SQLite timestamp before a later ISO one', () => {
    expect(compareEntries(SQLITE_EARLIER, ISO_LATER, 'date', 'asc')).toBeLessThan(0)
    expect(compareEntries(ISO_LATER, SQLITE_EARLIER, 'date', 'asc')).toBeGreaterThan(0)
  })

  it('honors descending direction', () => {
    expect(compareEntries(SQLITE_EARLIER, ISO_LATER, 'date', 'desc')).toBeGreaterThan(0)
    expect(compareEntries(ISO_LATER, SQLITE_EARLIER, 'date', 'desc')).toBeLessThan(0)
  })

  it('treats the two formats as equal when they denote the same instant', () => {
    expect(
      compareEntries(entry('2026-09-21 19:06:44'), entry('2026-09-21T19:06:44Z'), 'date', 'asc'),
    ).toBe(0)
  })

  it('sorts a full mixed-format list into true chronological order', () => {
    const items = [
      entry('2026-09-21T22:39:02.230Z', 'd'), // 22:39:02 UTC
      entry('2026-09-21 19:06:44', 'b'), //      19:06:44 UTC
      entry('2026-09-21T09:00:00.000Z', 'a'), // 09:00:00 UTC
      entry('2026-09-21 21:30:00', 'c'), //      21:30:00 UTC
    ]
    const sorted = [...items].sort((x, y) => compareEntries(x, y, 'date', 'asc'))
    expect(sorted.map((i) => i.command)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('does not regress the plain all-ISO case', () => {
    expect(
      compareEntries(
        entry('2026-09-21T09:00:00.000Z'),
        entry('2026-09-21T22:39:02.230Z'),
        'date',
        'asc',
      ),
    ).toBeLessThan(0)
  })
})
