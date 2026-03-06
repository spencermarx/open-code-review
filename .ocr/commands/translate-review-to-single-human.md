---
description: Translate a multi-reviewer code review into a single human-voice GitHub PR comment.
name: "OCR: Translate Review to Single Human"
category: Code Review
tags: [ocr, post, github, human-voice]
---

**Usage**
```
/ocr-translate-review-to-single-human [session] [--round <N>]
```

**Arguments**
- `session` (optional): Session ID to translate. Defaults to most recent.
- `--round <N>` (optional): Round number to translate. Defaults to current round.

**Examples**
```
/ocr-translate-review-to-single-human                        # Translate latest round of latest session
/ocr-translate-review-to-single-human --round 2              # Translate round 2
/ocr-translate-review-to-single-human 2026-03-06-feat-auth   # Translate specific session
```

**Prerequisites**
- A completed review round with `final.md` and reviewer outputs in `reviews/*.md`

---

## Steps

1. **Locate the session and round**
   - If no session specified, find the most recent in `.ocr/sessions/`
   - Determine the round number from `ocr state show` -> `current_round`, or use `--round` if provided
   - Verify the round directory exists: `.ocr/sessions/{id}/rounds/round-{N}/`

2. **Read the source material**
   - Read `rounds/round-{N}/final.md` for the synthesized review
   - Read ALL individual reviewer outputs in `rounds/round-{N}/reviews/*.md` for raw findings

3. **Apply the human voice translation** following the rules below

4. **Write the output** to `rounds/round-{N}/final-human.md` in the same round directory

---

## Translation Rules

You are rewriting a multi-reviewer code review into a single PR comment that reads like one real person wrote it after carefully reading through the code. Not an AI. Not a committee. Just a developer who spent time on this and has opinions.

### Voice & Tone (Google code review guidelines)

- Comment on the CODE, never the developer. "This function could be simplified" not "you wrote this wrong."
- Always explain WHY something matters. Don't just say "change this" -- say why it's worth changing.
- Label severity naturally: prefix minor stuff with "Nit:" or "Minor:", flag blockers clearly.
- When something is good, say so briefly. Don't over-praise, but acknowledge solid work where you see it.
- Be direct. "This needs a bounds check" is better than "It might be worth considering whether bounds checking could potentially be beneficial."

### Writing Style -- Sound Like a Human

Your writing must be indistinguishable from a real person's PR review. Follow these rules:

**Sentence variety**: Mix short punchy sentences with longer ones. Start some with "So", "Also", "Oh and", "One thing --". Real people don't start every sentence the same way.

**Word choice**: Pick unexpected but natural words. Say "this is a bit gnarly" not "this is complex". Say "nice catch" not "good observation". Say "I'd probably" not "I would recommend".

**Banned words and phrases** (these are AI tells -- NEVER use them):
- "comprehensive", "robust", "leverage", "utilize", "furthermore", "additionally"
- "ensure", "facilitate", "streamline", "encompass", "delve"
- "it's worth noting", "it should be noted", "upon review"

**Structure disruption**: Don't use the classic AI pattern of intro paragraph -> numbered list -> conclusion. Instead, jump right into the review. Maybe start with the most interesting finding, or a quick overall impression. Let the structure feel organic -- group related things but don't over-organize.

**Natural imperfections**: Real reviews have personality. Use dashes for asides -- like this -- and parenthetical thoughts (when they fit). An occasional "tbh" or "fwiw" is fine. Contractions are mandatory ("don't", "isn't", "I'd").

**Emotional reality**: If something is genuinely concerning, let that come through -- "this worries me a bit because..." If something is clever, say so -- "oh this is a neat approach." If something is tedious but necessary, acknowledge it -- "I know this is annoying but we really need..."

### Severity Labels

Every technical finding must include a severity label:

| Label | Meaning |
|-------|---------|
| **Blocker** | Must fix before merge. Bugs, data loss risks, security issues. |
| **Should-fix** | Strongly recommended. Not a ship-blocker but will cause pain later. |
| **Suggestion** | Take it or leave it. A better approach exists but current code works. |
| **Nit** | Style, naming, minor readability. Prefix with "Nit:" naturally in the text. |

### Content Rules (NON-NEGOTIABLE)

- Preserve EVERY substantive technical finding from the source material. Do not drop, skip, or summarize away any concrete issue.
- Include specific file paths and line numbers exactly as referenced in the source material.
- Consolidate duplicates -- if two reviewers flagged the same thing, mention it once.
- Strip all meta-commentary about "the review process" or "analysis methodology."
- Use GitHub-flavored markdown.

### Absolute Don'ts

- Never mention multiple reviewers, AI, agents, automated analysis, or tools.
- Never use "the team", "our analysis", "upon review", "it was noted that".
- Never write a formulaic sign-off or summary conclusion paragraph.
- Never start with "Overall, this is a..." -- that's the number one AI tell.
- Never mention this translation process or that you're rewriting anything.

---

## Output Format

Write ONLY the review comment in GitHub-flavored markdown. Jump straight into the review -- no meta-preamble, no explanation of what you're doing, no wrapper text.

The output goes directly into `final-human.md` and will be posted as-is to a GitHub PR.

---

**Reference**
- Use `/ocr-post` to post the translated review to GitHub
- Use `/ocr-show` to view the original synthesized review
