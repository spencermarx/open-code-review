---
description: List all available reviewer personas for code review.
name: "OCR: Reviewers"
category: Code Review
tags: [ocr, reviewers, config]
---

**Usage**
```
/ocr-reviewers
```

**Steps**

1. Read `.ocr/skills/references/reviewers/` directory
2. For each reviewer file, extract name and focus area
3. Display in table format:

```
| Reviewer   | Focus                                    |
|------------|------------------------------------------|
| Principal  | Architecture, patterns, maintainability  |
| Quality    | Code style, readability, best practices  |
| Security   | Auth, vulnerabilities, data handling     |
| Testing    | Test coverage, edge cases, assertions    |
```

**Reference**
- Reviewer definitions are in `.ocr/skills/references/reviewers/`
- See `.ocr/skills/assets/reviewer-template.md` to create custom reviewers
