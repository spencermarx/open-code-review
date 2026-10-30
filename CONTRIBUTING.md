# Contributing to Open Code Review

Thank you for your interest in contributing to Open Code Review! We welcome contributions from the community and are excited to have you on board.

This guide covers how to set up the repo, how a change goes from idea to merged PR, and the one thing we ask of every PR before a maintainer reviews it: **an approved OCR review loop**.

## At a glance

1. **Non-trivial change?** [Open an issue first](#open-an-issue-first-for-non-trivial-changes) and wait for a maintainer to mark it `accepted`.
2. **Make the change** on a branch, with tests and docs. Read and understand every line, whoever (or whatever) wrote it.
3. **Open a PR** using the template, including the short [AI-use disclosure](#ai-use-disclosure).
4. **Run the OCR review loop** on the PR until the latest round is **APPROVE** ([details](#required-ocr-review-loop-before-maintainer-review)). A bot keeps a `needs-ocr-review` label on the PR while something is on your side, or `needs-accepted-issue` while a linked issue is waiting on us.
5. **A maintainer reviews.**

No AI tooling? That's fine, see [No AI tooling?](#no-ai-tooling).

## Quick start

> **Prerequisite:** Node.js **>= 22.5** (OCR's storage engine is Node's built-in
> `node:sqlite`). Use `nvm install 22 && nvm use 22` if needed.

1. **Fork the repository** and clone your fork
2. **Install dependencies**: `pnpm install`
3. **Run the CLI locally**: `nx run cli:init` or `nx run cli:progress`

## Open an issue first for non-trivial changes

Some changes need a design conversation before code. Agreeing on the shape up front saves you from building something we can't merge, and saves us from reviewing a large PR we'd have steered differently. We follow the issue-first practice used by projects like Ghostty.

| PR title type | Issue needed? |
|---|---|
| `feat:`, `refactor:`, `perf:` | **Yes**: link an issue a maintainer has labelled `accepted` |
| Anything breaking (`feat!:`, `fix!:`, ...) | **Yes**: link an `accepted` issue |
| `fix:` | No, but include a clear reproduction (in the PR or a linked issue) |
| `docs:`, `test:`, `chore:`, `ci:`, `build:`, `style:`, `revert:` | No, go straight to a PR |

- PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/) (`type(scope): summary`) using **one of the types in the table**. The gate reads the type to decide whether an issue is required, so a title with another type (or none) keeps the `needs-ocr-review` label until it's retitled. GitHub's own `Revert "…"` titles count as `revert:`.
- Link the issue with a closing keyword in the PR description (`Closes #123`) or via the PR's **Development** sidebar. Only issues in this repository count.
- `accepted` is applied by maintainers once an issue's direction is agreed. While an open *linked* issue waits for that, the PR carries `needs-accepted-issue`: it's waiting on us, so the inactivity clock is paused. (A PR that hasn't linked an issue at all, or whose linked issue was closed without `accepted`, keeps `needs-ocr-review`, since the next step is yours.) Once the issue is accepted, comment on the PR or edit its description and the gate re-checks.
- Use the [bug report](https://github.com/spencermarx/open-code-review/issues/new?template=bug_report.yml) and [feature request](https://github.com/spencermarx/open-code-review/issues/new?template=feature_request.yml) templates. For open-ended ideas, start a [Discussion](https://github.com/spencermarx/open-code-review/discussions).

## You own your change

AI assistants are welcome here; OCR is itself an AI tool. What we need is a human in the loop, in the spirit of the LLVM, PROJ and NumPy contribution policies:

- **You must have read and understood every change in your PR**, and be able to explain it (why it's needed, why it's correct, what you tested) in your own words, without an AI. Maintainers may ask.
- **The OCR review loop is a pre-review, not a substitute for your judgment.** It catches a lot, but it can be wrong; you decide which findings to fix and which to decline (with reasoning).
- **No fully autonomous agents opening PRs.** An agent can draft code, but a person has to own, check and submit it. PRs that look unattended may be closed.

### AI-use disclosure

The PR template has a short **AI use** section: which tools you used (if any) and roughly how, for example "Claude Code drafted the parser, I wrote the tests and reworked the error handling", or "none". This follows disclosure practices from projects like Kyverno, earthaccess and Ghostty. It isn't a judgment; it tells reviewers where to look harder.

## Required: OCR review loop before maintainer review

**Every PR needs an approved OCR review loop, with each round posted to the PR, before a maintainer reviews it.**

### Why

Many PRs we receive are AI-assisted, which is great, but it means a large diff can arrive quickly and the first thorough review lands on maintainers, often as an expensive multi-agent review on our side before a human can even judge the change. We'd rather that work happen first, using the project's own tool, with the evidence on the PR. It's also the best way to dogfood OCR: if the loop is painful, we want to feel that pain too. That's why **maintainers' own PRs go through it as well**.

In return, you get a multi-perspective review (architecture, code quality, and optionally security) before any human looks at your PR, and maintainers can spend their time on design and judgment instead of first-pass findings.

### What counts as done

- **The latest review round's verdict is APPROVE.** You loop review → address → re-review until it is. `NEEDS_DISCUSSION` is a pause for humans: ask your questions on the PR.
- **The reviewer team has at least 2 distinct personas.** The default team (`principal:2, quality:2`) meets this. **3 or more are encouraged**, e.g. `--team principal:2,quality:2,security:1`, and security is especially welcome for anything touching auth, CI, workflows, or user data.
- **The loop covers the PR's current head commit.** The head must be the commit the latest APPROVE round reviewed, or the commit pushed by an address pass posted after it (normally the final pass, `round=final`, which only applies that review's leftover suggestions). Anything else pushed after the loop, including merging `main` into your branch or GitHub's **Update branch** button, needs another review round (it's usually a quick one).
- **Each round reviews the whole PR** (from the PR's base to `HEAD`), not just the commits since the last round.
- **Every round is posted to the PR** as a comment carrying a hidden marker (see below). That's the evidence the gate reads, and the trail maintainers read.

### Claude Code: `/ocr-review-loop`

The repo ships a project skill, [`.claude/skills/ocr-review-loop/`](.claude/skills/ocr-review-loop/SKILL.md), that runs the whole loop and posts every round for you:

```
/ocr-review-loop                                  # current branch's PR, default team
/ocr-review-loop --team principal:2,quality:2,security:1
```

It checks the team has at least 2 personas, pushes before each review so the reviewed commit is the PR's commit, reviews the whole PR every round, posts each review and address round with its marker, and stops for a human on `NEEDS_DISCUSSION`. Requirements: OCR set up locally (see [Setting up OCR](#setting-up-ocr)), the `gh` CLI authenticated, and an open PR for your branch.

### Setting up OCR

- Install the OCR CLI so `ocr` is on your PATH: `npm install -g @open-code-review/cli` (needs Node.js >= 22.5), then check with `ocr doctor`.
- **Claude Code and Windsurf** need nothing else: this repo already commits their OCR commands (`.claude/commands/ocr/`, `.windsurf/workflows/`) and the `.ocr/` skills.
- **Other AI tools:** run `ocr init` and pick your tool to install its command files. Don't commit the files that generates, or any `.ocr/` files rewritten by `ocr init` / `ocr update`, unless changing them is the point of your PR. (OCR's own assets are edited in `packages/agents/`; see [`CLAUDE.md`](CLAUDE.md).)

### Other AI tools: manual fallback

OCR's review and address commands are available in every [supported AI tool](README.md#supported-ai-tools): `/ocr:review` and `/ocr:address` in tools with namespaced commands (Claude Code, Cursor, ...), and `/ocr-review` and `/ocr-address` in Windsurf and other tools with flat command names. Run the loop by hand:

1. Push your branch and open the PR (draft is fine; mark it ready when the loop is done).
2. **Review the whole PR against an up-to-date base:** fetch the base first (`git fetch upstream` in a fork, `git fetch origin` otherwise), `git push`, then review the full range with your team, e.g. `/ocr:review upstream/main...HEAD --team principal:2,quality:2` from a fork, or `/ocr:review origin/main...HEAD --team principal:2,quality:2` from a branch in this repo. A stale local `main` would pull other people's commits into your review.
3. **Post the round** to the PR: the round's `final.md` (in `.ocr/sessions/<session>/rounds/round-<n>/`), with a review marker as the first line. Paste it yourself, or add the marker after posting: OCR's `/ocr:post` posts the review **without** a marker, and the gate can't see a round without one.
4. If the verdict is `REQUEST CHANGES`, **address it:** run `/ocr:address` on that round's `final.md`, verify (typecheck, lint, tests), commit, push, and **post an address comment** with an address marker. Then go back to step 2 for the next round. If it's `NEEDS DISCUSSION`, post the round, ask its open questions on the PR, and continue once they're settled.
5. Once a round is **APPROVE**, optionally run one final `/ocr:address` for the leftover suggestions, push, and post it with `round=final`.

Each comment needs exactly one marker, on its own line (the first line is simplest), outside any code block:

```markdown
<!-- ocr-review-loop:review round=<n> verdict=<APPROVE|REQUEST_CHANGES|NEEDS_DISCUSSION> personas=<comma-separated distinct persona ids> sha=<full 40-hex HEAD reviewed> -->
<!-- ocr-review-loop:address round=<n|final> sha=<full 40-hex commit pushed> -->
```

- `round`: OCR's round number, the `<n>` in `rounds/round-<n>/` (an address comment uses the number of the round it addresses), or `final` for the address pass after APPROVE.
- `verdict`: the round's verdict with underscores (`REQUEST CHANGES` → `REQUEST_CHANGES`).
- `personas`: the distinct **persona ids** that actually reviewed that round, e.g. `principal,quality,security`: lowercase, comma-separated, **no spaces**. Take them from the round's review files, dropping the instance number (`reviews/principal-1.md` → `principal`; the gate counts `principal-1,principal-2` as one persona). Ephemeral `--reviewer` reviewers (`ephemeral-1.md`) don't count. One-liner: `ls .ocr/sessions/<session>/rounds/round-<n>/reviews | sed -n 's/-[0-9]*\.md$//p' | grep -vx ephemeral | sort -u | paste -sd, -`.
- `sha`: `git rev-parse HEAD`, taken *after* pushing: the commit that was reviewed, or the commit the address pass pushed.

For example:

```markdown
<!-- ocr-review-loop:review round=2 verdict=APPROVE personas=principal,quality sha=3f9c0e1b8a7d6c5b4a3928170f6e5d4c3b2a1908 -->
🤖 **OCR multi-agent review — Round 2** (principal×2, quality×2)

...the round's final.md...
```

**Markers are evidence.** Only post a marker for a round that actually ran, with the verdict it actually produced, and never change a verdict or SHA after the fact. Fixing a *typo* in a marker so it correctly records what ran is fine, and the gate re-checks when you edit the comment. The gate can only check that the trail exists; maintainers read it, and a fabricated round means we can't trust the rest of the PR.

### How the check works

The [OCR review gate](.github/workflows/ocr-review-gate.yml) workflow re-evaluates the PR on every push, PR edit, label change, and comment from the PR author or a maintainer. Maintainers can also re-run it by hand (**Actions → OCR review gate → Run workflow**, from the default branch, with the PR number). It:

- reads markers only from comments by **the PR author or a maintainer** (owner, member, collaborator), ignoring markers inside code blocks or quotes and any marker with a malformed field (the bot tells you how many it couldn't use, so a typo doesn't go unnoticed);
- **passes** when the latest review marker is `APPROVE` with at least 2 distinct personas, the PR's head commit is the one covered by the most recent of that review and any address pass posted after it (`round=final`, or the same or a later round), and, for `feat`/`refactor`/`perf`/breaking PRs, an `accepted` issue is linked;
- otherwise labels the PR and keeps **one** friendly bot comment up to date with exactly what's missing. **`needs-ocr-review`** means something is still on your side (the loop, the title, or linking an issue); **`needs-accepted-issue`** means a linked issue is waiting on our decision. When the PR passes, it removes the labels and updates that comment; it never posts a new comment just to say "pass".

It's a label, not a required status check: it never blocks merging on its own, and maintainers still read the trail. The workflow never checks out or runs code from your PR. It only reads PR metadata and comments through the GitHub API.

### Exemptions

- **Bot-authored PRs** (Dependabot, Renovate, ...) are exempt automatically.
- **Maintainers can apply `ocr-review-exempt`** to PRs where the loop would be overkill: typo fixes, trivial docs, and the like. If you think your PR qualifies, just ask on the PR.
- **Maintainers' own PRs are not exempt by default.** We dogfood the loop too.
- Draft and closed PRs aren't evaluated.

### Inactivity

To keep the review queue honest, a PR labelled `needs-ocr-review` with no activity for **14 days** gets a friendly reminder (and the `ocr-review-stale` label). If there's still no activity **14 days** after that, it's closed with a note. That's not a judgment on the change: you can reopen it any time once the loop is approved, or comment and a maintainer will reopen it for you. Any push or comment resets the clock (so if you're waiting on us after a `NEEDS_DISCUSSION` round, just say so on the PR), and draft PRs and any PR carrying `needs-accepted-issue` (we owe the next step) are left alone.

### No AI tooling?

The loop needs an AI coding tool, and we don't want that to be a barrier. If you don't have one, [open an issue](https://github.com/spencermarx/open-code-review/issues/new/choose) describing the change you'd like to make (or have made). A maintainer may pick it up, run the loop on your behalf, or apply `ocr-review-exempt` to your PR.

## Contribution workflow

### 1. Create a branch

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/issue-description
```

### 2. Make your changes

- Follow the conventions in [`CLAUDE.md`](CLAUDE.md) (they apply to humans too): TypeScript only, ESM, apps never depend on apps.
- Agent assets (skills, commands, reviewer personas) are edited in `packages/agents/`, then synced with `nx run cli:update`. Never hand-edit the generated `.ocr/` copies.
- Add tests for new behavior and update docs when user-facing behavior changes.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages and the PR title.

### 3. Open the PR and run the loop

Fill in the [PR template](.github/PULL_REQUEST_TEMPLATE.md), then run the [OCR review loop](#required-ocr-review-loop-before-maintainer-review). A one-off `/ocr:review` on staged changes before you open the PR is a great habit too, but it doesn't replace the loop on the PR.

## Project structure

```
open-code-review/
├── packages/
│   ├── agents/          # Skills, commands, reviewer personas (source of truth for .ocr/)
│   ├── cli/             # TypeScript CLI (`ocr`)
│   ├── dashboard/       # Web UI for review sessions
│   ├── shared/          # Source-only libraries shared by cli + dashboard
│   │   ├── config/
│   │   ├── persistence/
│   │   └── platform/
│   └── *-e2e/           # End-to-end suites
├── .claude/skills/      # Project skills, incl. ocr-review-loop
├── .github/             # Workflows, PR/issue templates, workflow scripts
├── openspec/            # Project specifications and change proposals
└── .ocr/                # Installed OCR (sessions are gitignored)
```

## Testing

```bash
pnpm nx run-many -t typecheck lint test     # what CI runs first
pnpm nx e2e cli-e2e                         # CLI end-to-end
node --test ".github/scripts/*.test.ts"     # OCR review gate logic
```

## Code style

- **TypeScript**: Strict mode, ESM only
- **Naming**: camelCase for variables/functions, PascalCase for types
- **Comments**: Only where they add value (avoid obvious comments)

## Areas to contribute

- **Good first issues**: look for the [`good first issue`](https://github.com/spencermarx/open-code-review/labels/good%20first%20issue) label. Documentation improvements, additional reviewer personas, and CLI UX polish are often good starting points.
- **Feature ideas**: new reviewer types, IDE integrations, GitHub Actions integration, notifications. Open an issue first so we can agree on the shape.
- **Bug fixes**: check the tracker for the [`bug`](https://github.com/spencermarx/open-code-review/labels/bug) label.

## Releasing (maintainers)

Releases are cut locally from a green `main` with `nx release --skip-publish`, which versions, tags, pushes, and creates the GitHub release. npm publishing happens **only in CI** (`.github/workflows/release.yml`, OIDC trusted publishing, gated by a cross-platform install verification). Never `npm publish` by hand. The full procedure lives in the **Release Process** section of [`CLAUDE.md`](CLAUDE.md#release-process-github--npm).

## Future work

Today the loop ships as a project skill in this repo. Shipping it as a first-class OCR command (`/ocr:review-loop` in `packages/agents`) so every OCR user can run it is planned as a separate follow-up.

## Code of conduct

Be respectful, inclusive, and constructive. We're all here to build something useful together.

## Questions?

- Open a [GitHub Discussion](https://github.com/spencermarx/open-code-review/discussions)
- Check [existing issues](https://github.com/spencermarx/open-code-review/issues) and the docs first

---

**Thank you for contributing!** Every contribution, no matter how small, helps make OCR better for everyone.
