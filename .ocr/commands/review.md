---
description: Run an AI-powered multi-agent code review on your changes.
name: "OCR: Review"
category: Code Review
tags: [ocr, review, code-review]
---

**Usage**
```
/ocr-review [target] [--fresh]
```

**Arguments**
- `target` (optional): Branch, commit, or file to review. Defaults to staged changes.
- `--fresh` (optional): Clear any existing session for today's date and start from scratch.

**Examples**
```
/ocr-review                    # Review staged changes
/ocr-review --fresh            # Clear today's session and start fresh
/ocr-review HEAD~3             # Review last 3 commits
/ocr-review feature/auth       # Review branch vs main
/ocr-review src/api/           # Review specific directory
```

**Steps**

1. **Session State Check** (CRITICAL - do this first!)
2. Load the OCR skill from `.ocr/skills/SKILL.md`
3. Execute the 8-phase review workflow defined in `.ocr/skills/references/workflow.md`
4. Store results in `.ocr/sessions/{date}-{branch}/`

---

## 🔍 Session State Check (Phase 0)

Before starting any review work, you MUST verify the current session state:

### Step 1: Check for existing session

```bash
# Find today's session directory
ls -la .ocr/sessions/$(date +%Y-%m-%d)-* 2>/dev/null
```

### Step 2: If session exists, verify state

Read `state.json` AND verify actual files match (see `references/session-files.md` for authoritative names):

| Phase | state.json says | Verify file exists |
|-------|-----------------|-------------------|
| context | `completed_phases` includes "context" | `.ocr/sessions/{id}/discovered-standards.md` |
| requirements | `completed_phases` includes "requirements" | `.ocr/sessions/{id}/context.md` |
| analysis | `completed_phases` includes "analysis" | `.ocr/sessions/{id}/context.md` (with guidance) |
| reviews | `completed_phases` includes "reviews" | At least 2 files in `.ocr/sessions/{id}/reviews/` |
| discourse | `completed_phases` includes "discourse" | `.ocr/sessions/{id}/discourse.md` |
| synthesis | `completed_phases` includes "synthesis" | `.ocr/sessions/{id}/final.md` |

### Step 3: Determine action

- **If `--fresh` flag**: Delete the session directory and start from Phase 1
- **If state.json missing but files exist**: Recreate state.json from file existence
- **If state.json exists and files match**: Resume from `current_phase`
- **If state.json and files mismatch**: Report discrepancy and ask user which to trust
- **If no session exists**: Start fresh from Phase 1

---

## ⚠️ CRITICAL: Required Artifacts (Must Create In Order)

> **See `references/session-files.md` for the authoritative file manifest.**

You MUST create these files sequentially. **Do NOT skip to `final.md`.**

```
.ocr/sessions/{YYYY-MM-DD}-{branch}/
├── state.json              # Phase 1: session state (REQUIRED)
├── discovered-standards.md # Phase 1: merged project standards  
├── requirements.md         # Phase 1: user requirements (if provided)
├── context.md              # Phase 2: change summary + Tech Lead guidance
├── reviews/
│   ├── principal-1.md      # Phase 4: reviewer output
│   ├── principal-2.md      # Phase 4: reviewer output
│   ├── quality-1.md        # Phase 4: reviewer output
│   └── {reviewer}-{n}.md   # Phase 4: reviewer output
├── discourse.md            # Phase 6: reviewer cross-discussion
└── final.md                # Phase 7: ONLY after all above exist
```

### Checkpoint Rules

1. **Before Phase 2** (Change Analysis): `discovered-standards.md` MUST exist
2. **Before Phase 4** (Spawn Reviewers): `context.md` MUST exist
3. **Before Phase 6** (Discourse): At least 2 files in `reviews/` MUST exist
4. **Before Phase 7** (Synthesis): `discourse.md` MUST exist
5. **NEVER** write `final.md` without completing Phases 1-6

### Why This Matters

The `ocr progress` CLI watches these files to show real-time progress. If you skip files, the progress display breaks and users see incorrect state.

---

**Reference**
- See `.ocr/skills/SKILL.md` for full Tech Lead instructions
- See `.ocr/skills/references/workflow.md` for detailed workflow phases
