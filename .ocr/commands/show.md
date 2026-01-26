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
2. Read and display `final.md` (synthesized review)
3. Optionally show individual reviewer files if requested

**Reference**
- Use `/ocr-history` to list all sessions
- Use `/ocr-post` to post a review to GitHub
