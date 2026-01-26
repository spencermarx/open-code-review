---
description: List past OCR review sessions.
name: "OCR: History"
category: Code Review
tags: [ocr, history, sessions]
---

**Usage**
```
/ocr-history
```

**Steps**

1. Read `.ocr/sessions/` directory
2. List sessions in reverse chronological order
3. For each session, show:
   - Session ID (date-branch)
   - Branch/target reviewed
   - Number of reviewers
   - Final verdict (if complete)

**Output Format**
```
| Session                    | Target        | Reviewers | Verdict |
|----------------------------|---------------|-----------|---------|
| 2025-01-26-feature-auth    | feature/auth  | 4         | Approve |
| 2025-01-25-fix-bug         | fix/bug-123   | 2         | Block   |
```

**Reference**
- Use `/ocr-show <session>` to view a past review
