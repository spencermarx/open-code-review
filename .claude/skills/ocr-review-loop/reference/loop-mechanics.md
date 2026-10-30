# Loop Mechanics (detailed reference)

Read this when executing the OCR Review-to-Approval Loop. It captures the exact
session/round handling, how to read the verdict, the address-pass policy, the evidence
markers, and the GitHub comment templates. The `/ocr:review` and `/ocr:address` skills own
their own internals — this file only covers the **orchestration** around them.

---

## 0. Preconditions (resolve once, up front)

```bash
BRANCH="$(git branch --show-current)"
# Refuse to run on the default branch — this skill commits and pushes.
DEFAULT="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"
[ "$BRANCH" = "${DEFAULT:-main}" ] && { echo "Refusing to run on the default branch."; exit 1; }

# Resolve the PR (arg wins; else the open PR for this branch).
PR="${ARG_PR:-$(gh pr view --json number -q .number 2>/dev/null)}"   # needs gh unless --no-post
```

- If posting is requested but no PR exists, ask the user whether to `gh pr create` first, or
  fall back to `--no-post` (local-only).
- Confirm OCR is set up (`.ocr/` present, `ocr` CLI on PATH). `/ocr:doctor` if unsure.
- Resolve the team: default is `ocr team resolve --json`; with `--team`, forward the spec
  verbatim to `/ocr:review` (it calls `ocr team resolve --team "<spec>" --json`).

### Team policy check (STOP if it fails)

`ocr team resolve --json` returns one entry per reviewer instance:
`[{ "persona": "principal", "instance_index": 1, "name": "principal-1", "model": null }, ...]`.
Count **distinct `persona` values**:

```bash
# With --team: ocr team resolve --team "$TEAM" --json
TEAM_JSON="$(ocr team resolve --json)"
PERSONAS="$(printf '%s' "$TEAM_JSON" | jq -r '[.[].persona] | unique | join(",")')"
COUNT="$(printf '%s' "$TEAM_JSON" | jq '[.[].persona] | unique | length')"
```

If `COUNT < 2`, **stop before any review** and tell the user, in plain words:

> This repo's contribution policy needs the OCR review loop to run with at least **2 distinct
> reviewer personas** (the default team `principal:2, quality:2` qualifies), so one perspective
> can't approve its own blind spots. 3 or more are encouraged, e.g.
> `--team principal:2,quality:2,security:1`. Re-run with a team like that.

This check is about the *planned* team. The marker's `personas` field records who *actually*
reviewed each round (see 1b), since the Tech Lead may auto-add a reviewer and a sub-agent can fail.
Ephemeral `--reviewer` personas have no persona id, so they never appear in the marker or the count.

---

## 1. Per-round mechanics

### a. Push, then review the whole PR

The working tree must be clean first. If `git status --porcelain` shows anything the loop didn't
produce, **ask the user** whether it belongs in the PR; never `git add -A` untracked files into a
public PR. Then push and verify that the reviewed commit is the PR's commit (GitHub can lag a
moment behind a push, so check twice):

```bash
git push                                  # (git push -u origin "$BRANCH" the first time)
SHA="$(git rev-parse HEAD)"               # full 40-hex
pr_head() { gh pr view "$PR" --json headRefOid -q .headRefOid; }
PR_HEAD="$(pr_head)"
[ "$SHA" = "$PR_HEAD" ] || { sleep 5; PR_HEAD="$(pr_head)"; }
[ "$SHA" = "$PR_HEAD" ] || { echo "PR head ($PR_HEAD) != local HEAD ($SHA); push or pull first."; exit 1; }

# The PR's base commit, fetched from the repository the PR targets (a fork's
# local main may be stale). The base repo comes from the PR's own URL, not from
# gh's default-repo guess, which can resolve to the fork.
BASE_SHA="$(gh pr view "$PR" --json baseRefOid -q .baseRefOid)"
BASE_REF="$(gh pr view "$PR" --json baseRefName -q .baseRefName)"
BASE_REPO="$(gh pr view "$PR" --json url -q .url | sed 's#/pull/[0-9]*$##').git"
git cat-file -e "$BASE_SHA^{commit}" 2>/dev/null || git fetch --quiet "$BASE_REPO" "$BASE_REF"
git cat-file -e "$BASE_SHA^{commit}" || { echo "Base commit $BASE_SHA not available after fetching $BASE_REPO"; exit 1; }
```

Then invoke `/ocr:review` with the **full PR range as the target**, `"$BASE_SHA...HEAD"`, passing
`--team <spec>` only if the user supplied one. `/ocr:review`'s default target is *staged
changes*, which is empty right after a push; reviewing only the commits since the last round, or
against a stale local `main`, would leave the marker claiming different coverage than the review
had. It runs the full 8-phase pipeline and finalizes the round, writing:

- `.ocr/sessions/{YYYY-MM-DD}-{branch}/rounds/round-{n}/final.md`
- `.ocr/sessions/{YYYY-MM-DD}-{branch}/rounds/round-{n}/round-meta.json`  (verdict + counts)

**Round/session handling across iterations** — every loop iteration is a **new round in the
same session**:

- Round 1 creates the session (`ocr state begin`) and walks `context → … → synthesis →
  complete-round → finish`.
- After a round finalizes, `/ocr:review`'s Phase 8 calls `ocr state finish` (session
  `closed`). For the next round, `ocr state begin` again on the **same** `--session-id`
  starts `round-{n+1}` and resets the phase to `context`; then **advance the phase graph one
  step at a time** (`context → change-context → analysis → reviews …`) — the CLI rejects
  illegal jumps. Reuse the existing `discovered-standards.md` and `context.md`; only the
  `rounds/round-{n+1}/` artifacts are new.
- Regenerate the full `"$BASE_SHA...HEAD"` diff each round (the branch has new commits from the
  prior address pass).
- `{n}` is **OCR's** round number, not the loop's iteration count. A same-day re-run of the
  loop continues the session at `round-{n+1}`, so read `n` from the round that was just
  finalized (`ocr state show`, or the highest `rounds/round-*` directory) and use it for both
  the file paths and the marker.

### b. Read the verdict and who reviewed (the loop gate)

```bash
ROUND_DIR=".ocr/sessions/{id}/rounds/round-{n}"
VERDICT="$(jq -r .verdict "$ROUND_DIR/round-meta.json")"  # "APPROVE" | "REQUEST CHANGES" | "NEEDS DISCUSSION"
MARKER_VERDICT="$(printf '%s' "$VERDICT" | tr ' ' '_')"   # APPROVE | REQUEST_CHANGES | NEEDS_DISCUSSION
# Personas that actually reviewed: strip the -<instance> suffix, drop ephemeral reviewers.
PERSONAS="$(ls "$ROUND_DIR/reviews" | sed -n 's/^\(.*\)-[0-9][0-9]*\.md$/\1/p' | grep -v '^ephemeral$' | sort -u | paste -sd, -)"
```

The verdict is the **merge gate** and the loop condition:

| Verdict | Blockers | Loop action |
|---|---|---|
| `APPROVE` | 0 | **Exit loop** → final suggestions pass |
| `REQUEST CHANGES` | ≥1 | **Address**, then re-review |
| `NEEDS DISCUSSION` | n/a | **Stop & ask the user** (human gate — don't auto-resolve) |

### c. Address (only on `REQUEST CHANGES`)

Invoke `/ocr:address` on `rounds/round-{n}/final.md`. Its own guardrails apply
(`.ocr/commands/address.md`): corroborate every item against the actual code, implement valid
findings, decline incorrect ones with evidence, propose a better fix when the suggested one is
suboptimal.

**Loop-specific address policy:**
- **Always** address **blockers** and **should-fixes** this round — they're what clears the
  gate to APPROVE.
- You **may defer pure suggestions** to the final pass (keeps each round focused on the gate).
  This is a judgment call; addressing a cheap suggestion inline is fine too.
- **Verify before committing:** run the project's typecheck + lint + tests (e.g.
  `pnpm nx run-many -t typecheck lint`, the relevant `nx test`/`nx e2e`). Fix until green.
- **Commit** atomically with conventional messages (see the repo's `/atomic-commits` style),
  then **push**. Follow the repo's commit conventions (CLAUDE.md / CONTRIBUTING.md).
- Record `ADDRESS_SHA="$(git rev-parse HEAD)"` **after** the push, for the address marker. If
  every item was declined and nothing was committed, it is simply the unchanged `HEAD`.

---

## 2. Verification expectations

Never push red. For this repo specifically, the relevant gates per change are typically:
`nx typecheck`, `nx lint`, plus the affected `nx test <project>` / `nx e2e <project>` (rebuild
the CLI with `nx build cli` before running `*-e2e` if CLI source changed), and
`node --test ".github/scripts/*.test.ts"` if the workflow scripts changed. Mirror whatever the
underlying address pass touched.

---

## 3. Final suggestions pass (after APPROVE)

Once a round returns `APPROVE`, run `/ocr:address` **one more time** against the approving
round's `final.md` to clear remaining **suggestions** (the items deferred during the loop).
Verify, commit, push. Then post the final comment (marker `round=final`) with the loop-summary
table (template below).

Skip this pass if `--no-final-suggestions` was given. Note that if you skip it and later push
anything, the approving review no longer covers the PR head and the loop must run again.

---

## 4. Evidence markers

Every posted comment carries **exactly one** hidden marker, as its **first line**, outside any
code block. The `ocr-review-gate` workflow reads these (only from the PR author and maintainers)
to decide whether the PR keeps its `needs-ocr-review` label:

```text
<!-- ocr-review-loop:review round=<n> verdict=<APPROVE|REQUEST_CHANGES|NEEDS_DISCUSSION> personas=<comma-separated distinct persona ids> sha=<full 40-hex HEAD reviewed> -->
<!-- ocr-review-loop:address round=<n|final> sha=<full 40-hex commit pushed> -->
```

| Field | Value | Rule the gate enforces |
|---|---|---|
| `round` | review round number, or `final` (address only) | `^(\d{1,3}\|final)$` |
| `verdict` | `round-meta.json` verdict, spaces → underscores | one of the three values |
| `personas` | `$PERSONAS` from 1b, e.g. `principal,quality,security` | each `^[a-z0-9][a-z0-9-]{0,63}$` (a `-<digits>` instance suffix is ignored), ≥2 distinct to pass |
| `sha` | `git rev-parse HEAD` after the push | `^[0-9a-f]{7,40}$` (always write the full 40) |

The gate passes when the **latest review marker** is `APPROVE` with ≥2 personas **and** the PR
head is covered by that review's `sha` or by an address marker posted after it with
`round=final` (or the same or a later round). That's how the final address pass, which pushes
after APPROVE, covers the head. Markers with any malformed field are ignored, and the bot only
reports how many it couldn't use, so copy the values rather than retyping them.

**Markers are evidence.** Never post one for a round that didn't run, never change a verdict or
SHA, and never edit a posted marker to make the gate pass. Fixing a *typo* so the marker
faithfully records what ran is fine; edit the comment in place and the gate re-checks. If the
round itself was wrong (wrong target, missing reviewers), re-run it instead.

---

## 5. GitHub comment templates

Post with `gh pr comment <PR> --body-file <file>`. Write bodies to a temp file rather than
inline `-m` to avoid shell-escaping issues with backticks/`$()`.

### Review comment (each round)

````markdown
<!-- ocr-review-loop:review round={n} verdict={MARKER_VERDICT} personas={PERSONAS} sha={SHA} -->
🤖 **OCR multi-agent review — Round {n}** ({team summary, e.g. principal×2, quality×2}, independent parallel sub-agents)

{paste the round's final.md verbatim}
````

### Address comment (each round)

````markdown
<!-- ocr-review-loop:address round={n} sha={ADDRESS_SHA} -->
## 🔧 OCR Address — Round {n} response (commit {short sha})

Addressed the round-{n} review. Each point corroborated against the code before acting.

### Blockers — fixed ✅
{per blocker: what was wrong, the fix, the verification}

### Should-fix — {fixed/partially} ✅
{per item}

### Declined / Deferred
{declined items with evidence; suggestions deferred to the final pass}

### Verification
{typecheck/lint/test results}
````

### Final comment (after APPROVE)

````markdown
<!-- ocr-review-loop:address round=final sha={ADDRESS_SHA} -->
## 🔧 OCR Address — Final pass (commit {short sha})

Cleared the remaining suggestions from the approving review (comments/tests only — no behavior change):
{list}

Left as-is by reviewer consensus: {items the reviewers explicitly said to leave}

**Verification:** {results}

---

### 🔁 Loop summary

| Round | Verdict | Outcome |
|-------|---------|---------|
| 1 | **REQUEST CHANGES** (… blockers) | {one-line} |
| — | address | {one-line} |
| 2 | **✅ APPROVE** | {one-line} |
| — | final address | {one-line} |
````

---

## 6. Stop conditions & edge cases

- **Team has fewer than 2 distinct personas** → stop in preconditions with the policy
  explanation; don't run a round.
- **PR head ≠ local HEAD before a review** → push (or pull, if someone else pushed) first; never
  review a commit the PR doesn't point at.
- **Approved on round 1** → skip the loop body; go straight to the final suggestions pass.
- **`max-rounds` reached without APPROVE** → stop, post/print the outstanding blockers, and
  hand back to the user. Do not loop indefinitely.
- **`NEEDS DISCUSSION`** → stop; present the review's Clarifying Questions and await the user.
- **A blocker that can't be auto-fixed** (needs a product/architecture decision) → stop and
  say so; do not force an APPROVE by mis-categorizing it.
- **`--no-post`** → run the whole loop locally and present the review/address trail (and the
  summary table) in-chat instead of on the PR. This does not satisfy the contribution policy.
- **Convergence sanity** → if a re-review reintroduces the *same* blocker the prior address
  claimed to fix, treat the fix as unverified: re-open it, don't just loop.
- **New commits after the loop finished** → the loop no longer covers the head; run it again
  (typically one round plus a final pass).
