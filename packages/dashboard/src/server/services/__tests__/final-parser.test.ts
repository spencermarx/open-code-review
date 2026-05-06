import { describe, it, expect } from 'vitest'
import { parseFinalMd } from '../parsers/final-parser.js'

describe('parseFinalMd', () => {
  it('parses standard final.md format with numbered headings', () => {
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
    expect(result.blockerCount).toBe(1)
    expect(result.shouldFixCount).toBe(3)
    expect(result.suggestionCount).toBe(2)
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

  it('reduces a long inline rationale to just the leading verdict keyword', () => {
    // Real-world shape: reviewers like to put the verdict + rationale
    // on the same line. The card badge must stay short, so the parser
    // strips the rationale.
    const content = `# Final Review

**Verdict**: REQUEST CHANGES** — the architectural shape is well-delivered, but two findings must resolve before merge: a vendor-protocol bug (Blocker 1) and a same-process bypass (Blocker 2).
`
    const result = parseFinalMd(content)
    expect(result.verdict).toBe('REQUEST CHANGES')
  })

  it('handles unknown verdict phrasings by clipping at the first sentence break', () => {
    const content = `## Verdict: Hold for follow-up — needs more discussion next week.`
    const result = parseFinalMd(content)
    // Not a known keyword; clipped at the em-dash, no paragraph in the badge.
    expect(result.verdict).toBe('Hold for follow-up')
  })

  it('counts bullet items under category sub-headings', () => {
    const content = `# Code Review

## Verdict

**NEEDS DISCUSSION**

---

## Blockers

*No hard blockers identified.*

---

## Suggestions

### Architecture

- **Refactor graph validator to per-node mode branching** — @principal-1, @principal-2, @quality-1 *(3 reviewers agree)*

- **Add fail-fast or warning for null-populated BookingService** — @principal-1, @principal-2, @quality-1

- **Add explicit handling in extractStepCreateDto** — @principal-1, @testing-1

### Code Quality

- **Extract WET reducer pattern into helper** — @quality-1, @quality-2

- **Use PopulatedField utility** — @quality-1

### Testing

- **Write tests for getNextStepId/getPreviousStepId** — @testing-1

- **Write reducer integration test** — @testing-1

---

## Consensus & Dissent
`
    const result = parseFinalMd(content)
    expect(result.verdict).toBe('NEEDS DISCUSSION')
    expect(result.blockerCount).toBe(0)
    expect(result.suggestionCount).toBe(7)
  })

  it('counts emoji-prefixed blocker headings', () => {
    const content = `# Code Review

## Verdict

**REQUEST CHANGES**

---

## Blockers

### 🚫 SQL Injection in user query

**Flagged by**: @security-1
Description.

### 🚫 Auth bypass on admin route

**Flagged by**: @security-1
Description.

---

## Suggestions

### Code Quality
- Consider renaming variable — @quality-1
`
    const result = parseFinalMd(content)
    expect(result.blockerCount).toBe(2)
    expect(result.suggestionCount).toBe(1)
  })

  it('handles real-world final.md with numbered should-fix', () => {
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
    expect(result.blockerCount).toBe(1)
    expect(result.shouldFixCount).toBe(5)
    expect(result.suggestionCount).toBe(2)
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

  it('stops counting at --- separator', () => {
    const content = `# Review

## Verdict

**APPROVE**

---

## Suggestions

- fix A — @principal-1
- fix B — @quality-1

---

## What's Working Well

- great code — @principal-1
- nice tests — @testing-1
`
    const result = parseFinalMd(content)
    expect(result.suggestionCount).toBe(2)
  })

  it('does not count prose lines starting with "No" as items', () => {
    const content = `# Review

## Verdict

**APPROVE**

---

## Blockers

*No hard blockers identified.* All findings are suggestions.

---

## Suggestions

- one item — @quality-1
`
    const result = parseFinalMd(content)
    expect(result.blockerCount).toBe(0)
    expect(result.suggestionCount).toBe(1)
  })

  // ── Real-world pattern tests (from analysis of all 9 final.md files) ──

  it('handles 2-section format with no Should Fix section (Generation 2+)', () => {
    const content = `# Code Review: feat/next-version-ocr

## Verdict

**REQUEST CHANGES**

---

## Blockers

### 1. Missing WAL Mode and Busy Timeout Pragmas

**Flagged by**: @principal-1 (Critical)
Description here.

### 2. Missing Backward-Compatible state.json Writes

**Flagged by**: @principal-1 (High)
Description here.

### 3. Map Parser Cascade-Deletes User Progress

**Flagged by**: @principal-2 (High)
Description here.

---

## Suggestions

### Security Hardening

- "Add one-time-use nonce to auth endpoint" — @security-1 [**High**]
- "Use cleanEnv() for utility commands too" — @security-1, @principal-2 [**Medium**]

### Architecture

- "Change ON DELETE CASCADE to ON DELETE RESTRICT on orchestration_events" — @principal-1 [**High**]
- "Add phase transition validation" — @principal-1 [**High**]

### Code Quality

- "Extract shared createNdjsonParser() utility" — @quality-2 [**Medium**]

---

## Consensus & Dissent
`
    const result = parseFinalMd(content)
    expect(result.verdict).toBe('REQUEST CHANGES')
    expect(result.blockerCount).toBe(3)
    expect(result.shouldFixCount).toBe(0) // No ## Should Fix section → 0
    expect(result.suggestionCount).toBe(5)
  })

  it('handles APPROVE verdict with resolved blockers (round 4 pattern)', () => {
    const content = `# Code Review: feat/next-version-ocr (Round 4)

## Verdict

**APPROVE**

All three Round 3 blockers are resolved.

---

## Blockers

None. All three Round 3 blockers have been resolved:

### Round 3 Blocker 1 — WAL Pragmas (REQ-DB-3): RESOLVED
**Verified by**: All 5 reviewers (unanimous)
**Fix commit**: \`b1b84a5\`

Description of the fix.

### Round 3 Blocker 2 — state.json Writes (REQ-DB-7): SPEC AMENDMENT NEEDED
**Verified by**: principal-1, principal-2, quality-1

Description.

### Round 3 Blocker 3 — Cascade-Delete: RESOLVED
**Verified by**: All 5 reviewers (unanimous)

Description.

---

## Suggestions

### Environment Sanitization

- "Add GH_TOKEN to cleanEnv() allowlist" — @security-1, @principal-1, @principal-2

### Server Lifecycle

- "Call flushSave() in shutdown handler" — @principal-2, @principal-1

---

## Consensus & Dissent
`
    const result = parseFinalMd(content)
    expect(result.verdict).toBe('APPROVE')
    // Resolved blockers use "### Round 3 Blocker 1 —" format (not ### N.)
    // and are not counted as active blockers
    expect(result.blockerCount).toBe(0)
    expect(result.shouldFixCount).toBe(0)
    expect(result.suggestionCount).toBe(2)
  })

  it('handles NEEDS DISCUSSION with no blockers and topic-grouped suggestions', () => {
    const content = `# Code Review: feat/preselected-service-selection

## Verdict

**NEEDS DISCUSSION**

The architecture is excellent. Three areas need author clarification.

---

## Blockers

*No hard blockers identified.* All findings are either suggestions or need-discussion items.

---

## Suggestions

### Architecture

- **Refactor graph validator to per-node mode branching** — @principal-1, @principal-2, @quality-1 *(3 reviewers agree)*

- **Add fail-fast or warning for null-populated BookingService** — @principal-1, @principal-2, @quality-1

- **Add explicit handling in extractStepCreateDto for PRE_SELECTED** — @principal-1, @testing-1

- **Audit RESET_BOOKING call sites** — @principal-1

### Code Quality

- **Extract WET reducer pattern into helper** — @quality-1, @quality-2

- **Use PopulatedField utility for ServiceSelectionPreSelectedTypeConfigPopulated** — @quality-1

- **Extract duplicated Tailwind class string** — @quality-2

- **Extract duplicated selection_mode data-access pattern** — @quality-2

### Testing

- **Write tests for getNextStepId/getPreviousStepId helpers** — @testing-1

- **Write reducer integration test for pre-selected initialization** — @testing-1

- **Write tests for usePreSelectedServiceTracking hook** — @testing-1

- **Write tests for mode-switch-command.ts** — @testing-1

### Style / Info

- **Add break in pre-save hook default case** — @quality-1

- **Root-level change-spec.md / change-spec-2.md** — @quality-1

---

## Consensus & Dissent
`
    const result = parseFinalMd(content)
    expect(result.verdict).toBe('NEEDS DISCUSSION')
    expect(result.blockerCount).toBe(0)
    expect(result.shouldFixCount).toBe(0)
    // 4 Architecture + 4 Code Quality + 4 Testing + 2 Style = 14
    expect(result.suggestionCount).toBe(14)
  })

  it('handles 5 numbered blockers with security-heavy review', () => {
    const content = `# Code Review: feat/next-version-ocr

## Verdict

**REQUEST CHANGES**

---

## Blockers

### 1. AI Commands Grant Unrestricted Bash Access via Spawned Claude CLI
**Flagged by**: @security-1
Description.

### 2. Zero Authentication + All-Interface Server Binding
**Flagged by**: @security-1, @principal-1
Description.

### 3. Wildcard CORS Enables Cross-Origin Attacks
**Flagged by**: @security-1
Description.

### 4. Concurrent Write Data Loss via In-Memory sql.js
**Flagged by**: @principal-1, @principal-2, @quality-2
Description.

### 5. Schema Duplication Between CLI and Dashboard Will Drift
**Flagged by**: ALL 5 reviewers
Description.

---

## Suggestions

### Security
- "Write temp files with mode 0o600" — @security-1
- "Validate requirements file path" — @security-1

### Architecture
- "Remove ChangeWatcher dead code" — @principal-2, @quality-2
- "Refactor server to createApp() factory" — @principal-1

---

## Consensus & Dissent
`
    const result = parseFinalMd(content)
    expect(result.blockerCount).toBe(5)
    expect(result.shouldFixCount).toBe(0)
    expect(result.suggestionCount).toBe(4)
  })

  it('skips "None" sentinel bullets in blocker section', () => {
    const content = `# Review

## Verdict

**APPROVE**

---

## Blockers

- None identified

---

## Should Fix

- N/A for this change

---

## Suggestions

- "Consider adding a debug flag" — @quality-1
`
    const result = parseFinalMd(content)
    expect(result.blockerCount).toBe(0)
    expect(result.shouldFixCount).toBe(0)
    expect(result.suggestionCount).toBe(1)
  })

  it('counts quoted and bold suggestion formats equally', () => {
    const content = `# Review

## Verdict

**APPROVE**

---

## Suggestions

### Security
- "Validate session ID format" — @security-1 [**Low**]
- "Mask bearer token in console" — @security-1 [**Low**]

### Code Quality
- **Extract resultToRows into shared utility** — @quality-1
- **Fix hardcoded version string** — @quality-1, @principal-1

---

## What's Working Well
`
    const result = parseFinalMd(content)
    expect(result.suggestionCount).toBe(4)
  })
})
