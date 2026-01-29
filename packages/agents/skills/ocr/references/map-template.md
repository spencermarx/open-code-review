# Code Review Map Template

Template for the final map output (`map.md`). Optimized for reviewer workflow: understand context first, then track per-file review progress.

---

## Complete Template

```markdown
# Code Review Map

**Session**: {session_id} | **Generated**: {timestamp} | **Files**: {file_count} | **Sections**: {section_count}

> Mark `X` in Done column as you complete review. Requirements: ✅ full | ⚠️ partial | ❌ none

---

## Executive Summary

{1-2 paragraph narrative explaining what this changeset accomplishes. Frame as a hypothesis.}

**Hypothesis**: {One sentence summary of inferred intent}

**Key Approaches**:
- {Approach 1}: {Brief description}
- {Approach 2}: {Brief description}

---

## Questions & Clarifications

> Ambiguities and assumptions that need verification with the author.

### Questions for Author

- {Question about unclear intent or ambiguous requirement}
- {Question about design choice or deferred work}

### Assumptions Made

- {Assumption 1 — verify if uncertain}
- {Assumption 2 — verify if uncertain}

---

## Requirements Coverage

{Only include if requirements were provided}

| Requirement | Status | Implementing Files |
|-------------|--------|-------------------|
| REQ-1: {description} | ✅ Full | `file1.ts`, `file2.ts` |
| REQ-2: {description} | ⚠️ Partial | `file3.ts` |
| REQ-3: {description} | ❌ Not covered | — |

**Gaps**: {Brief note on unaddressed requirements, if any}

---

## Critical Review Focus

> High-value areas where human judgment matters most. Review these carefully.

| Focus Area | Files | Why It Matters | Req / Concern |
|------------|-------|----------------|---------------|
| {Area, e.g., "Business Logic"} | `file1.ts`, `file2.ts` | {Reason, e.g., "Complex pricing conditionals"} | REQ-1 |
| {Area, e.g., "Security"} | `auth.ts` | {Reason, e.g., "Token validation"} | Security |
| {Area, e.g., "Edge Cases"} | `processor.ts:78` | {Reason, e.g., "Empty array returns null"} | Correctness |

---

## Manual Verification

> Run these tests before or during code review to verify the changeset works.

### Critical Path

- [ ] **{Test Name}** (REQ-1) — {Steps} → Expected: {outcome}
- [ ] **{Test Name}** (REQ-2) — {Steps} → Expected: {outcome}

### Edge Cases & Error Handling

- [ ] **{Edge case}** (`file.ts:42`) — {Steps} → Expected: {behavior}
- [ ] **{Error scenario}** — Trigger: {how} → Expected: {handling}

### Non-Functional

- [ ] **Performance**: {Specific check}
- [ ] **Security**: {Specific check}

---

## File Review

{Main tracking section. Review files in section order, checking boxes as you go.}

### Section 1: {Section Title}

{1-2 sentence narrative hypothesis about this section's purpose}

| Done | File | Role |
|:----:|------|------|
|  | `path/to/file1.ts` | {brief role description} |
|  | `path/to/file2.ts` | {brief role description} |
|  | `path/to/file3.test.ts` | {brief role description} |

**Flow**: {Entry point} → {calls} → {tests}

**Requirements**: REQ-1 ✅, REQ-2 ⚠️

**Review Suggestions**:
- {Specific area to pay attention to, mapped to requirement or concern}
- {Only include if there are key things reviewer should watch for}

---

### Section 2: {Section Title}

{1-2 sentence narrative hypothesis}

| Done | File | Role |
|:----:|------|------|
|  | `path/to/file.ts` | {role} |

**Flow**: {flow summary}

**Requirements**: {coverage}

---

{Repeat for each section}

---

### Unrelated Changes

> Files that don't fit the main sections — opportunistic fixes or supporting changes.

| Done | File | Description |
|:----:|------|-------------|
|  | `path/to/unrelated1.ts` | {description} |
|  | `path/to/unrelated2.ts` | {description} |

---

## File Index

| File | Section |
|------|---------|
| `path/to/api/auth.ts` | 1: {name} |
| `path/to/services/auth.service.ts` | 1: {name} |
| `path/to/utils/helper.ts` | Unrelated |

**Total**: {file_count} files

---

## Map Metadata

**Run**: {run_number} | **Flow Analysts**: {count} | **Requirements Mappers**: {count} | **Completeness**: {file_count}/{file_count} ✅
```

---

## Format Guidelines

### Section Structure

```markdown
### Section {n}: {Title}

{1-2 sentence narrative hypothesis}

| Done | File | Role |
|:----:|------|------|
|  | `path/to/file.ts` | {role} |

**Flow**: {entry} → {calls} → {tests}

**Requirements**: REQ-1 ✅, REQ-2 ⚠️

**Review Suggestions**:
- {Only if key things to watch for}
```

**Titles**: Use descriptive names (✅ "Authentication Flow", ❌ "Files 1-5")

**Role descriptions**: 3-10 words explaining what the file does

### Review Suggestions (per section)

Include ONLY if there are specific areas worth highlighting:
- Business logic requiring human judgment
- Security-sensitive code paths
- Edge cases spotted during mapping
- Architectural decisions to verify

Map suggestions to requirements or concerns. Do NOT perform code review — just flag areas for the reviewer's attention.

**Good**: "Complex pricing conditionals — verify tier logic matches REQ-4"
**Bad**: "This function has a bug on line 42" (that's code review)

### Requirements Coverage Indicators

- ✅ Full coverage
- ⚠️ Partial coverage
- ❌ Not covered
- ❓ Cannot assess

### Writing Hypotheses

Frame as hypotheses, not assertions:

❌ "This changeset adds authentication."
✅ "This changeset appears to add authentication based on new auth handlers."

### Critical Review Focus

Focus on areas where **human judgment adds value**:

**Good candidates**:
- Business logic correctness
- Algorithm matching spec
- Security-sensitive code
- Edge case handling

**NOT candidates** (automated):
- Code style
- Type safety
- Test coverage

### Manual Verification Tests

Derive from:
- **Requirements** → Critical path happy-path tests
- **Implementation** → Edge cases (boundary conditions, null checks, error handling)

Omit ONLY if changeset is purely docs/config with no behavioral changes.

---

## Completeness Validation

The map MUST include every changed file:

```bash
EXPECTED=$(git diff --cached --name-only | sort)
MAPPED=$(grep -oE '\| `[^`]+` \|' map.md | sed 's/.*`\([^`]*\)`.*/\1/' | sort)
diff <(echo "$EXPECTED") <(echo "$MAPPED")
```

If any files are missing, add them to "Unrelated Changes" section.
