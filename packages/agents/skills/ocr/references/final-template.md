# Final Review Template & Synthesis Guide

> **Output file**: `rounds/round-{n}/final.md`
> **Manifest**: See `references/session-files.md` for authoritative file names

This guide describes how to synthesize all findings into a unified final review. Save output to `rounds/round-{n}/final.md`.

## Philosophy: Model Real Engineering Teams

This synthesis process is designed to mirror how high-performing engineering teams (Google, Stripe, etc.) conduct code review, following principles articulated by Martin Fowler and the continuous delivery community:

1. **Any reviewer can block** — A single engineer identifying a critical issue (security vulnerability, data integrity risk, correctness bug) can block a merge. This is non-negotiable.

2. **No feedback is lost** — Every comment from every reviewer surfaces in the final output, fully attributed. Just like PR comments, individual perspectives are preserved—not averaged away.

3. **Suggestions are suggestions** — Non-blocking feedback (style preferences, refactoring ideas, minor improvements) is presented for consideration but doesn't prevent merge.

4. **Tech Lead synthesizes, doesn't override** — The Tech Lead aggregates and presents all feedback with a recommendation, but doesn't suppress minority opinions or "outvote" blockers.

5. **Trust and autonomy** — Authors are trusted to address feedback appropriately. Reviews are collaborative conversations, not gatekeeping.

## Purpose

- **Preserve all feedback** — Every finding from every reviewer appears, attributed
- **Identify blockers** — Surface anything that should prevent merge
- **Present suggestions** — Non-blocking improvements for author consideration
- **Assess requirements** — Evaluate against provided requirements (if any)
- **Recommend action** — Clear verdict with rationale

## Synthesis Process

### Step 1: Gather All Feedback

Collect without filtering (see `references/session-files.md` for file names):
- All individual reviews from current round (`rounds/round-{n}/reviews/{type}-{n}.md`)
- Discourse results (`rounds/round-{n}/discourse.md`) if available
- Requirements context (`requirements.md`) if provided
- Tech Lead's original analysis from `context.md`

**Critical**: Do not discard or "deduplicate away" any reviewer feedback at this stage.

### Step 2: Identify Blockers

A finding is a **blocker** if ANY of the following are true:

| Blocker Criteria | Examples |
|------------------|----------|
| **Security vulnerability** | SQL injection, auth bypass, secrets exposure |
| **Data integrity risk** | Race conditions causing data loss, silent failures |
| **Correctness bug** | Logic errors that produce wrong results |
| **Breaking change without migration** | API contract violations, schema changes without rollback |
| **Compliance violation** | GDPR, HIPAA, PCI-DSS requirements not met |

**Any single reviewer can flag a blocker.** This is not subject to consensus—one engineer seeing a security hole is sufficient to block.

### Step 3: Collect Suggestions

All non-blocking feedback is preserved and attributed:

```markdown
## Suggestions

### Code Quality
- "Consider extracting this into a separate function for testability" — @principal-1
- "The variable naming could be more descriptive" — @quality-1

### Performance
- "This could be optimized with memoization" — @principal-2

### Style
- "Prefer `const` over `let` here" — @quality-2

### Testing
- "Edge case for empty input not covered" — @testing-1
```

**No suggestion is lost.** Even if only one reviewer mentions something, it surfaces.

### Step 4: Note Consensus and Dissent

When multiple reviewers comment on the same area:

```markdown
### Finding: Error handling in auth flow

**Reviewers**: @principal-1, @principal-2, @quality-2

@principal-1: "Missing try-catch around the OAuth callback"
@principal-2: "Agreed — this will crash on token refresh failure"
@quality-2: "The error handling exists but doesn't propagate to the UI"

**Consensus**: All agree error handling needs improvement
**Dissent**: None
```

When reviewers disagree:

```markdown
### Finding: Caching strategy

**Reviewers**: @principal-1, @security-1

@principal-1: "Should add Redis caching for performance"
@security-1: "Caching user data introduces staleness risks for permissions"

**Consensus**: None — valid tradeoff
**Tech Lead note**: Present both perspectives to author for decision
```

### Step 5: Assess Requirements (if provided)

If requirements were provided, evaluate each against the implementation:

```markdown
## Requirements Assessment

| Requirement | Status | Notes | Flagged By |
|-------------|--------|-------|------------|
| Users can log in via OAuth | ✓ Met | Implementation complete | @principal-1 |
| Session tokens expire after 24h | ? Unclear | Expiry logic not visible in diff | @security-1 |
| Failed logins are rate-limited | ✗ Gap | No rate limiting found | @security-1 |

**Gaps identified**: 1 requirement not met (rate limiting)
**Needs clarification**: 1 requirement unclear (token expiry)
```

A requirements gap MAY be a blocker if it represents a critical feature. The reviewer who identifies the gap makes the blocking determination.

### Step 6: Collect Clarifying Questions

Preserve all questions from all reviewers:

```markdown
## Clarifying Questions

Every question below was raised by a reviewer. Please address each.

### From @principal-1
- "The spec says 'fast response' — what's the target latency?"

### From @security-1
- "Should this include rate limiting, or is that a separate PR?"
- "Was account lockout intentionally left out?"

### From @testing-1
- "How should concurrent login attempts be handled?"
```

### Step 7: Synthesize Verdict

The Tech Lead determines the verdict based on simple rules:

| Condition | Verdict | Rationale |
|-----------|---------|-----------|
| **Any blocker exists** | REQUEST CHANGES | Blockers must be resolved before merge |
| **Unanswered questions about requirements** | NEEDS DISCUSSION | Author should clarify intent |
| **Suggestions only, no blockers** | APPROVE | Trust author to consider suggestions |
| **No findings** | APPROVE | Code is ready to merge |

**Important**: The Tech Lead does NOT override blockers. If any reviewer flags a blocker, the verdict is REQUEST CHANGES regardless of other opinions.

---

## Final Review Template

```markdown
# Code Review: {branch/PR}

**Date**: {YYYY-MM-DD}
**Reviewers**: @principal-1, @principal-2, @quality-1, @security-1
**Mode**: Full (with discourse) | Quick (no discourse)

---

## Verdict

**APPROVE** | **REQUEST CHANGES** | **NEEDS DISCUSSION**

{One sentence rationale}

---

## Blockers

{If any blockers exist, they appear here. Each blocker must be resolved before merge.}

### 🚫 {Blocker Title}
**Flagged by**: @security-1
**Type**: Security vulnerability
**Location**: `path/to/file.ts:42-50`

**Issue**: {Description of the problem}

**Why this blocks**: {Impact if merged as-is}

**Suggested fix**: 
```{language}
{code suggestion if applicable}
```

---

## Suggestions

{All non-blocking feedback, preserved and attributed}

### Code Quality
- "Consider extracting the validation logic into a separate function" — @principal-1
- "The error messages could be more user-friendly" — @quality-1

### Performance  
- "This query could benefit from an index on `user_id`" — @principal-2

### Testing
- "Edge case for empty array not covered" — @testing-1

### Style
- "Prefer early returns to reduce nesting" — @quality-1

---

## Consensus & Dissent

{When multiple reviewers commented on the same topic}

### Topic: Error handling approach
**Reviewers**: @principal-1, @principal-2, @quality-1

| Reviewer | Position |
|----------|----------|
| @principal-1 | "Wrap in try-catch and log to monitoring" |
| @principal-2 | "Agree with try-catch approach" |
| @quality-1 | "Consider custom error types for better debugging" |

**Consensus**: All agree on try-catch; @quality-1 adds refinement suggestion

---

## What's Working Well

- "Clean separation of concerns in the service layer" — @principal-1
- "Good test coverage for the happy path" — @testing-1
- "Proper input validation on all endpoints" — @security-1

---

## Requirements Assessment

{If requirements were provided}

| Requirement | Status | Notes | Reviewer |
|-------------|--------|-------|----------|
| Users can log in via OAuth | ✓ Met | Implementation complete | @principal-1 |
| Rate limiting on login | ✗ Gap | Not implemented | @security-1 |

---

## Clarifying Questions

{All questions from all reviewers — author should address each}

### From @principal-1
- "What's the expected latency target for the auth flow?"

### From @security-1  
- "Is rate limiting planned for a follow-up PR?"

---

## Individual Reviews

Full reviews available in session directory:

| Reviewer | Blockers | Suggestions | File |
|----------|----------|-------------|------|
| @principal-1 | 0 | 3 | `rounds/round-{n}/reviews/principal-1.md` |
| @principal-2 | 0 | 2 | `rounds/round-{n}/reviews/principal-2.md` |
| @quality-1 | 0 | 4 | `rounds/round-{n}/reviews/quality-1.md` |
| @security-1 | 1 | 2 | `rounds/round-{n}/reviews/security-1.md` |

**Session**: `.ocr/sessions/{session-id}/`
**Discourse**: `rounds/round-{n}/discourse.md`
```

---

## Key Principles Recap

1. **Blockers are binary** — Something either blocks merge or it doesn't. No "severity scoring."

2. **One reviewer can block** — Security engineer sees a vulnerability? That's a blocker, period.

3. **Suggestions don't block** — Style preferences, refactoring ideas, and minor improvements are presented but don't prevent merge.

4. **All feedback surfaces** — Every comment from every reviewer appears in the final output. Nothing is "averaged away."

5. **Author has autonomy** — For suggestions, the author decides what to address. Trust the engineer.

6. **Tech Lead facilitates** — The Tech Lead synthesizes and recommends, but doesn't override individual blockers or suppress feedback.
