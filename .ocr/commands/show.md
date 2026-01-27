---
description: Display a past OCR review session.
name: "OCR: Show"
category: Code Review
tags: [ocr, history, sessions]
---

**Usage**
```
/ocr-show [session]
```

**Arguments**
- `session` (optional): Session ID to display. Defaults to most recent.

**Steps**

1. If no session specified, find most recent in `.ocr/sessions/`
2. Determine current round from `state.json` → `current_round` (or enumerate `rounds/` directory)
3. Read and display `rounds/round-{current_round}/final.md` (synthesized review)
4. Optionally show individual reviewer files from `rounds/round-{n}/reviews/` if requested

**Reference**
- Use `/ocr-history` to list all sessions
- Use `/ocr-post` to post a review to GitHub
