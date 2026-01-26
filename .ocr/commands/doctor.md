---
description: Check OCR installation and verify all dependencies are available.
name: "OCR: Doctor"
category: Code Review
tags: [ocr, setup, diagnostics]
---

**Usage**
```
/ocr-doctor
```

**Steps**

1. **Check OCR Installation**
   - Verify `.ocr/skills/SKILL.md` exists and is readable
   - Verify `references/` directory contains required workflow files

2. **Check Git**
   - Verify `git` is available in PATH
   - Verify current directory is a git repository

3. **Check GitHub CLI** (optional)
   - Check if `gh` is available
   - If available, verify authentication with `gh auth status`

4. **Report Status**
   ```
   ✓ OCR skill installed
   ✓ Git available (version X.X.X)
   ✓ GitHub CLI available and authenticated
   
   Ready for code review!
   ```

**Reference**
- Run `/ocr-review` to start a code review
