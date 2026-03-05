import { describe, it, expect } from 'vitest'
import { parseReviewerOutput } from '../parsers/reviewer-parser.js'

describe('parseReviewerOutput', () => {
  it('parses findings with standard format', () => {
    const content = `# Principal-1 Review

## Finding: Inconsistent Import Extensions
**Severity**: Low
**File**: \`packages/cli/src/lib/progress/review-strategy.ts\`
**Lines**: 26

The import for render-utils lacks the .js extension.

## Finding: Detector Fallback Returns Review
**Severity**: Medium
**File**: \`packages/cli/src/lib/progress/detector.ts\`
**Lines**: 85-87

When no artifacts exist the function returns "review" as default.
`
    const result = parseReviewerOutput(content)
    expect(result.findings).toHaveLength(2)

    expect(result.findings[0]?.title).toBe('Inconsistent Import Extensions')
    expect(result.findings[0]?.severity).toBe('low')
    expect(result.findings[0]?.filePath).toBe('packages/cli/src/lib/progress/review-strategy.ts')
    expect(result.findings[0]?.lineStart).toBe(26)
    expect(result.findings[0]?.isBlocker).toBe(false)

    expect(result.findings[1]?.title).toBe('Detector Fallback Returns Review')
    expect(result.findings[1]?.severity).toBe('medium')
    expect(result.findings[1]?.lineStart).toBe(85)
    expect(result.findings[1]?.lineEnd).toBe(87)
  })

  it('parses findings with numbered format', () => {
    const content = `# Security Review

## Finding 1: SQL Injection Risk
**Severity**: critical
**File**: \`src/db/queries.ts\`
**Lines**: 42-58

User input is concatenated directly into SQL.

## Finding 2: Missing Input Validation
**Severity**: high
**File**: \`src/api/handler.ts\`
**Lines**: 10

No validation on request body.
`
    const result = parseReviewerOutput(content)
    expect(result.findings).toHaveLength(2)
    expect(result.findings[0]?.severity).toBe('critical')
    expect(result.findings[0]?.isBlocker).toBe(true)
    expect(result.findings[1]?.severity).toBe('high')
    expect(result.findings[1]?.isBlocker).toBe(false)
  })

  it('handles Issue and Suggestion headings', () => {
    const content = `# Quality Review

## Issue: Dead Code
**Severity**: low
**File**: \`src/utils.ts\`

Unused function found.

## Suggestion: Add Tests
**Severity**: info

Consider adding unit tests for the parser module.
`
    const result = parseReviewerOutput(content)
    expect(result.findings).toHaveLength(2)
    expect(result.findings[0]?.title).toBe('Dead Code')
    expect(result.findings[0]?.severity).toBe('low')
    expect(result.findings[1]?.title).toBe('Add Tests')
    expect(result.findings[1]?.severity).toBe('info')
    expect(result.findings[1]?.filePath).toBeNull()
  })

  it('handles missing fields gracefully', () => {
    const content = `# Review

## Finding: Something Wrong

Just a description without severity or file info.
`
    const result = parseReviewerOutput(content)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]?.title).toBe('Something Wrong')
    expect(result.findings[0]?.severity).toBe('info') // default
    expect(result.findings[0]?.filePath).toBeNull()
    expect(result.findings[0]?.lineStart).toBeNull()
    expect(result.findings[0]?.summary).toBe('Just a description without severity or file info.')
  })

  it('handles empty content', () => {
    const result = parseReviewerOutput('')
    expect(result.findings).toHaveLength(0)
  })

  it('handles content with no findings', () => {
    const content = `# Review

## Summary

Everything looks good!

## What's Working Well

1. Good code quality
2. Nice tests
`
    const result = parseReviewerOutput(content)
    expect(result.findings).toHaveLength(0)
  })

  it('parses real-world finding with Location field', () => {
    const content = `# Quality-1 Review

## Finding: Unused PHASE_NUMBER_TO_KEY Constant
- **Severity**: Low
- **Location**: \`packages/cli/src/lib/progress/map-strategy.ts:L48-56\`

The constant is defined but never referenced anywhere.
`
    const result = parseReviewerOutput(content)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]?.severity).toBe('low')
    expect(result.findings[0]?.filePath).toBe('packages/cli/src/lib/progress/map-strategy.ts')
  })

  it('collects multiline summary text', () => {
    const content = `# Review

## Finding: Complex Issue
**Severity**: medium
**File**: \`src/main.ts\`

This is the first line of the summary.

This is a second paragraph that provides more detail
about what the issue is and why it matters.
`
    const result = parseReviewerOutput(content)
    expect(result.findings[0]?.summary).toContain('first line of the summary')
    expect(result.findings[0]?.summary).toContain('second paragraph')
  })
})
