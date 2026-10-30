# OCR Review-to-Approval Loop

A project skill that drives a pull request to an **approved** OCR review automatically.

In this repo, running it (or its [manual equivalent](../../../CONTRIBUTING.md#other-ai-tools-manual-fallback))
is **required before maintainer review**: see
[CONTRIBUTING.md](../../../CONTRIBUTING.md#required-ocr-review-loop-before-maintainer-review).

## What it does

Loops OCR's multi-agent review and address steps:

```
team check (≥2 distinct personas, else stop)
  → push → /ocr:review → post review to PR (with marker) → verdict?
                                        ├─ APPROVE          → final /ocr:address (suggestions) → done
                                        ├─ NEEDS DISCUSSION → stop, ask the human
                                        └─ REQUEST CHANGES  → /ocr:address (fix + verify + commit + push)
                                                              → post address comment (with marker) → re-review
```

Every review and every address round is posted to the GitHub PR, so the whole iteration is an
auditable trail. Each comment starts with a hidden marker, for example
`<!-- ocr-review-loop:review round=2 verdict=APPROVE personas=principal,quality sha=<40-hex> -->`,
which the `ocr-review-gate` workflow reads to manage the PR's `needs-ocr-review` label. It is an
orchestrator only — the actual review and fixing are done by the existing
[`/ocr:review`](../../../.ocr/commands/review.md) and
[`/ocr:address`](../../../.ocr/commands/address.md) skills.

## Usage

```
/ocr-review-loop                       # current branch's PR, default team, max 5 rounds
/ocr-review-loop 54                    # target PR #54
/ocr-review-loop --team principal:2,quality:2,security:1   # 3 personas: encouraged
/ocr-review-loop --max-rounds 3 --no-final-suggestions
/ocr-review-loop --no-post             # run locally, present the trail in-chat (doesn't satisfy the policy)
```

## Requirements

- A feature branch (not the default branch) with an open GitHub PR.
- `gh` CLI authenticated (unless `--no-post`).
- OCR set up in the repo (`/ocr:doctor` to check).
- A reviewer team with at least 2 distinct personas (the default `principal:2, quality:2` qualifies).

## Files

- `SKILL.md` — the orchestration loop, arguments, and guardrails (loaded when the skill runs).
- `reference/loop-mechanics.md` — per-round CLI/session details, verdict gating, the evidence
  markers, and the GitHub comment templates (loaded on demand).

## Design notes

- **Bounded** by `--max-rounds` (default 5) — it never loops forever.
- **`NEEDS DISCUSSION` is a human gate** — the loop pauses for a decision rather than
  fabricating a fix.
- **Corroborate, don't obey** — feedback is verified against the code before it is acted on;
  wrong findings are declined with evidence.
- **Never pushes red** — typecheck + lint + tests run before every commit.
- **Markers are evidence** — one per comment, only for rounds that actually ran, with the verdict
  the round actually produced.
- **Reviewed SHA = PR SHA** — it pushes before every review, so the evidence points at real PR
  commits.

## Future work

Shipping this as a product command (`/ocr:review-loop` in `packages/agents`) so every OCR user
gets it is a separate follow-up; for now it lives here as a project skill.
