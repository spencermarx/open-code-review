---
description: Address code review feedback — corroborate, validate, and implement changes from a review's final.md.
name: "OCR: Address Feedback"
category: Code Review
tags: [ocr, address, feedback, review]
---

**Usage**
```
/ocr-address [path-to-final.md]
```

**Arguments**
- `path-to-final.md` (optional): Explicit path to a `final.md` review document. If omitted, auto-detects the current session's latest round `final.md`.

**Examples**
```
/ocr-address                                                         # Auto-detect current session's latest final.md
/ocr-address .ocr/sessions/2026-03-06-feat-auth/rounds/round-1/final.md  # Explicit path
```

**Guardrails**

- You are a distinguished software engineer with deep understanding of software architecture and design patterns.
- Think step by step — favor composition, clear boundaries, minimal scope, and root-cause fixes.
- Verify every assumption by reading actual code; never guess at behavior.
- Do NOT blindly accept every piece of feedback. Use your expertise to corroborate each point against the actual implementation before acting.
- If feedback is incorrect or based on a misunderstanding of the code, say so clearly with evidence.
- If feedback is valid but the suggested fix is suboptimal, propose a better alternative.
- Direct cutover rewrites only — remove all deprecated/dead/unused code; leave nothing behind.

---

## Steps

### 1. Resolve Inputs

Determine the `final.md` to address:

1. If the user provided an explicit file path, use it directly.
2. If no path is provided, auto-detect the current session:
   ```bash
   ocr state show
   ```
   Parse the output to find the session directory and current round, then construct the path:
   ```
   .ocr/sessions/{session-id}/rounds/round-{N}/final.md
   ```
3. Read the `final.md` file in its entirety.
4. If the file does not exist or cannot be found, stop and inform the user.

Also read any available OCR session context for project awareness:
- `.ocr/sessions/{session-id}/discovered-standards.md` — project standards
- `.ocr/sessions/{session-id}/context.md` — change analysis and Tech Lead guidance

### 2. Parse and Catalog Feedback Items

Break the review into discrete, actionable feedback items.

For each item, record:
- The feedback point (what the reviewer is saying)
- The file(s) and line(s) referenced (if any)
- Severity/type: blocker, should-fix, suggestion, nitpick, architecture, performance, security, etc.
- The originating reviewer persona (if identifiable)

Present a concise numbered summary of all feedback items to the user before proceeding.

### 3. Gather Implementation Context

- Read ALL files referenced by the review feedback.
- Read any additional files needed to understand the surrounding context (callers, consumers, types, tests).
- Read project standards from `discovered-standards.md` if available.
- **DO NOT skip any referenced files** — thorough context is critical for accurate corroboration.

### 4. Corroborate and Validate Each Feedback Item

For each feedback item from Step 2:

- **Read the actual code** at the referenced location.
- **Assess validity**: Is the feedback accurate? Does the code actually exhibit the issue described?
- **Classify** each item as one of:
  - **Valid — Will Address**: Feedback is correct and should be implemented.
  - **Valid — Alternative Approach**: Feedback identifies a real issue but the suggested fix is suboptimal; propose a better solution.
  - **Invalid — Respectfully Decline**: Feedback is based on a misunderstanding or is incorrect; explain why with code evidence.
  - **Needs Clarification**: Feedback is ambiguous or requires more context to evaluate.

Present the corroboration results to the user as a summary table or list before implementing. Wait for user acknowledgment.

### 5. Address Feedback

For all items classified as **Valid — Will Address** or **Valid — Alternative Approach**:

- **Spawn sub-agents in parallel** for independent feedback items. Group items that touch the same files or have logical dependencies, and assign independent groups to separate sub-agents.
- Each sub-agent should:
  - Implement changes following project coding standards and existing patterns
  - Ensure every change is minimal, focused, and does not introduce regressions
  - For **Alternative Approach** items, implement the better solution proposed in Step 4
- After all sub-agents complete, review the combined changes for consistency and conflicts.

### 6. Report and Verify

**Report** a completion summary:
- Total feedback items reviewed
- Items addressed (with brief description of each change)
- Items declined (with reasoning)
- Items needing clarification (if any)

**Verify** correctness by running project checks:
```bash
# Run type-checking (adapt to project toolchain)
npx tsc --noEmit

# Run tests (adapt to project toolchain)
npm test
```

If verification fails, fix the issues before reporting completion.
