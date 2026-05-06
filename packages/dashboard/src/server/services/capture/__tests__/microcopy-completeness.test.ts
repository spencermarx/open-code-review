/**
 * Microcopy completeness lint.
 *
 * Every variant of `UnresumableReason` must have a microcopy entry. The
 * test iterates `ALL_UNRESUMABLE_REASONS` — the same const that derives
 * the type — so adding a variant in one place propagates to every
 * surface that consumes it (lint included). Adding a variant without a
 * microcopy entry fails CI.
 *
 * Previously this test hardcoded a literal array of three strings,
 * which made the lint guarantee illusory: appending a variant to the
 * type without updating the test passed green. Round-1 Blocker 2 fix.
 */
import { describe, expect, it } from 'vitest'
import {
  ALL_UNRESUMABLE_REASONS,
  UNRESUMABLE_MICROCOPY,
  microcopyFor,
} from '../unresumable-microcopy.js'

describe('UNRESUMABLE_MICROCOPY', () => {
  it.each(ALL_UNRESUMABLE_REASONS)(
    'has a complete entry for reason "%s"',
    (reason) => {
      const entry = UNRESUMABLE_MICROCOPY[reason]
      expect(entry).toBeDefined()
      expect(entry.headline.length).toBeGreaterThan(0)
      expect(entry.cause.length).toBeGreaterThan(0)
      expect(entry.remediation.length).toBeGreaterThan(0)
    },
  )

  it.each(ALL_UNRESUMABLE_REASONS)(
    'microcopyFor("%s") returns the same entry as the map lookup',
    (reason) => {
      expect(microcopyFor(reason)).toBe(UNRESUMABLE_MICROCOPY[reason])
    },
  )

  it('has no extra entries for reasons outside the union', () => {
    // Convert the map keys back to the canonical list and ensure parity.
    const keys = Object.keys(UNRESUMABLE_MICROCOPY).sort()
    const expected = [...ALL_UNRESUMABLE_REASONS].sort()
    expect(keys).toEqual(expected)
  })
})
