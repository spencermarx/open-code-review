import { describe, it, expect } from 'vitest'
import { parseFinalMd } from '../parsers/final-parser.js'

describe('parseFinalMd', () => {
  it('parses standard final.md format', () => {
    const content = `# Final Review Synthesis

## Verdict

**REQUEST CHANGES**

---

## Blockers

### 1. Phase Naming Inconsistency

**Flagged by**: @principal-1
Issue description here.

---

## Should Fix

### 1. Missing .js Import Extension
### 2. Unused Import
### 3. Dead Code

---

## Suggestions

### Code Quality
- suggestion 1
- suggestion 2
`
    const result = parseFinalMd(content)
    expect(result.verdict).toBe('REQUEST CHANGES')
    // Note: counts come from section sub-heading counting
    // since there are no explicit **Blockers**: N lines
  })

  it('parses explicit count format', () => {
    const content = `# Final Review Synthesis

## Verdict: APPROVE

**Blockers**: 0
**Should Fix**: 3
**Suggestions**: 5

Everything looks good.
`
    const result = parseFinalMd(content)
    expect(result.verdict).toBe('APPROVE')
    expect(result.blockerCount).toBe(0)
    expect(result.shouldFixCount).toBe(3)
    expect(result.suggestionCount).toBe(5)
  })

  it('parses verdict with bold markers', () => {
    const content = `# Code Review

## Verdict

**NEEDS DISCUSSION**

Some explanation.
`
    const result = parseFinalMd(content)
    expect(result.verdict).toBe('NEEDS DISCUSSION')
  })

  it('handles real-world final.md from OCR', () => {
    const content = `# Code Review: feat/add-code-review-maps

**Date**: 2026-01-29
**Reviewers**: @principal-1, @principal-2, @quality-1, @quality-2

---

## Verdict

**REQUEST CHANGES**

The implementation is architecturally sound.

---

## Blockers

### 1. Phase Naming Inconsistency (Documentation vs CLI)

**Flagged by**: @principal-1, @principal-2
Description of the blocker.

---

## Should Fix

### 1. Missing .js Import Extension
### 2. Unused Import
### 3. Dead Code
### 4. Unused Type Export
### 5. Config File Mirror Discrepancy

---

## Suggestions

### Code Quality
- suggestion A
- suggestion B
`
    const result = parseFinalMd(content)
    expect(result.verdict).toBe('REQUEST CHANGES')
  })

  it('handles empty content', () => {
    const result = parseFinalMd('')
    expect(result.verdict).toBeNull()
    expect(result.blockerCount).toBe(0)
    expect(result.shouldFixCount).toBe(0)
    expect(result.suggestionCount).toBe(0)
  })

  it('handles content with no verdict', () => {
    const content = `# Some Review

Just some text without a verdict line.
`
    const result = parseFinalMd(content)
    expect(result.verdict).toBeNull()
  })

  it('parses inline verdict format', () => {
    const content = `# Review

**Verdict**: APPROVE

**Blockers**: 2
**Should Fix**: 1
**Suggestions**: 4
`
    const result = parseFinalMd(content)
    expect(result.verdict).toBe('APPROVE')
    expect(result.blockerCount).toBe(2)
    expect(result.shouldFixCount).toBe(1)
    expect(result.suggestionCount).toBe(4)
  })
})
