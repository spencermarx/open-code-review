---
name: "OCR Review-to-Approval Loop"
description: "Drive a PR to an approved code review by looping OCR's multi-agent review and address steps. Runs /ocr:review then /ocr:address repeatedly until the review verdict is APPROVE, then one final /ocr:address for leftover suggestions, posting every review and every address round to the GitHub PR as comments with machine-readable markers. This is the pre-review CONTRIBUTING.md requires before maintainer review (APPROVE verdict, at least 2 distinct personas, covering the PR head). Use when the user asks to 'review and address in a loop', 'iterate review until approved', 'auto review-and-fix this PR', 'loop /ocr:review and /ocr:address', or to take a changeset all the way to a clean APPROVE with the default reviewer team. Wraps the /ocr:review (.ocr/commands/review.md) and /ocr:address (.ocr/commands/address.md) skills; needs a feature branch with an open GitHub PR and the gh CLI for posting."
---

# OCR Review-to-Approval Loop

## What This Skill Does

Orchestrates an autonomous **review → address → re-review** loop on a pull request,
using OCR's existing multi-agent review pipeline, until the review reaches an **APPROVE**
verdict — then runs one final address pass for leftover suggestions. Every review and every
address round is posted to the GitHub PR as a comment, producing a transparent, reviewable
audit trail.

In this repo the loop is **required before maintainer review** (CONTRIBUTING.md → "Required: OCR
review loop before maintainer review"). Each posted comment carries a hidden marker that the
`ocr-review-gate` workflow reads to decide whether the PR keeps its `needs-ocr-review` label. The
policy needs: the latest review verdict is APPROVE, the team had **at least 2 distinct personas**
(3+ encouraged), and the latest loop comment covers the PR's **current head commit**.

It is a thin **orchestrator** over two skills it does not reimplement:
- **`/ocr:review`** → `.ocr/commands/review.md` (the 8-phase multi-agent review that emits a verdict)
- **`/ocr:address`** → `.ocr/commands/address.md` (corroborate feedback against code, then implement)

## When to Use

- "Review and address in a loop until it's approved."
- "Iterate /ocr:review and /ocr:address on this PR."
- "Auto review-and-fix PR #N to a clean approval."
- Getting a PR ready for maintainer review under the contribution policy.

## When NOT to Use (use the underlying skills directly)

- A **single** review with no auto-fixing → `/ocr:review`.
- Addressing **one** existing review's feedback → `/ocr:address`.
- There is no PR / not on a feature branch (this skill commits and posts).

## Prerequisites

- On a **non-default** git branch with an **open GitHub PR** (the loop commits + pushes each round).
- `gh` CLI installed and authenticated (for posting; skip with `--no-post`).
- OCR set up in the repo (`.ocr/` exists, `ocr` CLI available). Run `/ocr:doctor` if unsure.
- A green-ish working tree: any uncommitted changes will become part of what is reviewed.

## Arguments

```
/ocr-review-loop [pr] [--team <spec>] [--max-rounds N] [--no-final-suggestions] [--no-post]
```

- `pr` (optional): PR number. Default: the open PR for the current branch.
- `--team <spec>` (optional): reviewer team override (`reviewer-id:count,...`), forwarded to
  `/ocr:review`. **Default: the project's default team** (`ocr team resolve`). Must contain at
  least 2 distinct personas; 3+ encouraged, e.g. `principal:2,quality:2,security:1`.
- `--max-rounds N` (optional): safety cap on review rounds. **Default: 5.** The loop never
  runs forever.
- `--no-final-suggestions` (optional): stop at APPROVE; skip the final suggestions pass.
- `--no-post` (optional): run locally; do not post to GitHub. Present the trail in-chat instead.
  This leaves no evidence on the PR, so it does **not** satisfy the contribution policy.

---

## The Loop (core algorithm)

> Execute this inline, to completion, in the conversation. Do not schedule across turns or
> background the work. Drive each review's phases 4→7 within one turn (OCR's "don't strand
> the pipeline" rule). See `reference/loop-mechanics.md` for the exact CLI/session details,
> the marker formats, and the GitHub comment templates.

**0. Preconditions.** Resolve the PR and branch; refuse to run on the default branch. Confirm
`gh` (unless `--no-post`) and OCR setup. Resolve the reviewer team (default unless `--team`) with
`ocr team resolve [--team "<spec>"] --json`, which returns `[{persona, instance_index, name, model}]`,
and count the **distinct `persona` values**. **If there are fewer than 2, STOP** before reviewing
and explain the policy: the loop needs at least 2 distinct personas (e.g. `--team
principal:2,quality:2`, which is the default), and 3 or more are encouraged (e.g. `--team
principal:2,quality:2,security:1`). Instance counts don't help (`principal:3` is still one
persona), and ephemeral `--reviewer` personas don't count because they have no persona id.

**1. Review-address loop.** Starting at `round = 1`, while the verdict is not `APPROVE` and
`round <= max-rounds`:

1. **Push, then review** — commit anything pending, `git push`, and confirm the PR's head SHA
   equals local `HEAD`, so the reviewed commit is the PR's commit. Record that full 40-hex SHA.
   Invoke `/ocr:review` (default team, or `--team`). It runs the full pipeline and finalizes
   `rounds/round-{round}/final.md` + `round-meta.json` with a `verdict`.
2. **Post the review** to the PR, headed `OCR review — Round {round}`, with the review marker
   (`<!-- ocr-review-loop:review round=… verdict=… personas=… sha=… -->`) as its first line.
   *(skip if `--no-post`)*
3. **Gate on the verdict** (read it from `round-meta.json` / `final.md`):
   - **`APPROVE`** → exit the loop (proceed to step 2 below).
   - **`NEEDS DISCUSSION`** → **STOP the loop.** This is a human gate — surface the
     clarifying questions to the user and await direction. Do **not** fabricate a fix.
   - **`REQUEST CHANGES`** → continue.
4. **Address** — invoke `/ocr:address` on `rounds/round-{round}/final.md`. Corroborate every
   item against the actual code; implement the **blockers and should-fixes** (these clear the
   gate); decline incorrect feedback with evidence; you MAY defer pure **suggestions** to the
   final pass. **Verify** (typecheck + lint + tests) until green, then **commit** (atomic,
   conventional) and **push**.
5. **Post the address round** to the PR: what was addressed, declined (with reasoning), and
   deferred, with the address marker (`<!-- ocr-review-loop:address round=… sha=<pushed SHA> -->`)
   as its first line. *(skip if `--no-post`)*
6. `round += 1`; loop.

**2. Final suggestions pass** (only after `APPROVE`, unless `--no-final-suggestions`):
invoke `/ocr:address` once more to clear remaining **suggestions**, verify, commit, push, and
post a final address comment (marker `round=final`, `sha=` the pushed commit) that includes a
**loop-summary table** (round → verdict → outcome). If this pass changes nothing, still post it,
with `sha=` the unchanged `HEAD`.

**3. Stop conditions.** If `round` exceeds `max-rounds` without `APPROVE`, **stop** and report
the outstanding blockers — never loop indefinitely. If APPROVE was reached on round 1, skip the
loop body and go straight to the final suggestions pass.

---

## Guardrails (critical — do not skip)

- **Markers are evidence.** Never post a marker for a round that didn't run, never alter a
  verdict (the marker's verdict is exactly `round-meta.json`'s, spaces → underscores), and never
  list a persona that didn't review. `sha` is always the real full SHA (`git rev-parse HEAD`
  after the push). Exactly one marker per comment, on its own line, outside any code block.
- **Two-persona minimum.** Stop in preconditions if the resolved team has fewer than 2 distinct
  personas; don't run rounds that can't satisfy the policy.
- **Reviewed SHA = PR SHA.** Always push before reviewing. If new commits land after the loop
  finished, the loop has to run again.
- **Bounded.** Honor `--max-rounds` (default 5). If not approved by then, stop and surface why.
- **`NEEDS DISCUSSION` is a human gate.** Pause and ask; never invent a resolution for genuine
  ambiguity.
- **Corroborate, don't obey.** Per `.ocr/commands/address.md`: verify each finding against the
  code; implement valid items; **decline wrong feedback with evidence**. Don't gold-plate —
  fix only what the review actually raised.
- **Never push red.** Run the project's typecheck + lint + tests before every commit; fix
  failures before pushing.
- **Branch safety.** Refuse to run on the default branch; this skill commits and pushes.
- **Faithful reporting.** Report verdicts and outcomes honestly. If a blocker genuinely can't
  be fixed (needs a product/architecture decision), stop and say so rather than forcing APPROVE.
- **The human still owns the change.** The loop is a pre-review. The contributor must read and
  understand every change it makes before asking for maintainer review.
- **New round, same session.** Each iteration is a new OCR review round in the same session
  (a closed session starts `round-{n+1}`), reusing `discovered-standards.md` / `context.md`.

## Reference

- **Detailed per-round mechanics, verdict gating, session/round handling, the marker formats, and
  the GitHub comment templates** → [`reference/loop-mechanics.md`](reference/loop-mechanics.md)
- **The contribution policy and how the gate reads markers** →
  [`CONTRIBUTING.md`](../../../CONTRIBUTING.md#required-ocr-review-loop-before-maintainer-review)
- Underlying skills: [`/ocr:review`](../../../.ocr/commands/review.md),
  [`/ocr:address`](../../../.ocr/commands/address.md)
