---
description: Post the current OCR review to a GitHub PR.
name: "OCR: Post"
category: Code Review
tags: [ocr, github, pr]
---

**Usage**
```
/ocr-post [session]
```

**Arguments**
- `session` (optional): Session ID to post. Defaults to most recent.

**Prerequisites**
- GitHub CLI (`gh`) must be installed and authenticated
- Must be on a branch with an open PR

**Steps**

1. Verify `gh` is available and authenticated
2. Find the PR for current branch
3. Read the session's `final.md`
4. Post as PR comment via `gh pr comment`

**Reference**
- Run `/ocr-doctor` to check GitHub CLI status
