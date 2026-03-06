---
description: Post the current OCR review to a GitHub PR.
name: "OCR: Post"
category: Code Review
tags: [ocr, github, pr]
---

**Usage**
```
/ocr-post [session] [--human-translated-review <path>]
```

**Arguments**
- `session` (optional): Session ID to post. Defaults to most recent.
- `--human-translated-review <path>` (optional): Explicit path to a human-translated review file to post instead of `final.md`.

**Prerequisites**
- GitHub CLI (`gh`) must be installed and authenticated
- Must be on a branch with an open PR

**Steps**

1. Verify `gh` is available and authenticated
2. Find the PR for current branch
3. Determine current round from `ocr state show` -> `current_round` (or enumerate `rounds/` directory)
4. **Select the review content to post** (in priority order):
   a. If `--human-translated-review <path>` is provided, use that file
   b. Otherwise, check if `rounds/round-{current_round}/final-human.md` exists -- if yes, prefer it
   c. Fall back to `rounds/round-{current_round}/final.md`
5. Post as PR comment via `gh pr comment`

**Convention Over Configuration**

When no `--human-translated-review` flag is given, the post command automatically checks for a human-translated review before falling back to the raw synthesized review. This means if you've run `/ocr-translate-review-to-single-human` beforehand, the translated version is picked up without any extra flags.

The explicit `--human-translated-review` flag overrides this auto-detection and lets you point to any arbitrary file.

**Reference**
- Run `/ocr-translate-review-to-single-human` to generate a human-voice translation before posting
- Run `/ocr-doctor` to check GitHub CLI status
