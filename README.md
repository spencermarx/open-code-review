<p align="center">
  <img src="assets/open-code-review-logo.png" alt="Open Code Review" width="400" />
</p>

<h1 align="center">Open Code Review</h1>

<p align="center">
  <strong>Customizable multi-agent code review for AI-Assisted Development</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@open-code-review/cli"><img src="https://img.shields.io/npm/v/@open-code-review/cli.svg" alt="npm version"></a>
  <a href="https://github.com/spencermarx/open-code-review/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License"></a>
</p>

---

## The Problem

AI-assisted development is transforming how we write code. But there's a gap in the workflow: when you ask an AI to "review my code," you get a single perspective—one pass through the code, reflecting whatever the model happens to focus on first.

**The last mile is still human-intensive.** Even with spec-driven development, code changes typically go through multiple rounds of human review and refinement before they're ready. Each iteration takes time. Each context switch costs focus.

Real code review doesn't work as a single pass. In a healthy engineering culture, multiple reviewers examine code from different angles. A security-minded engineer catches authentication issues. A quality-focused engineer spots missing error handling. A principal engineer questions the architectural fit. And critically, these reviewers *talk to each other*—they challenge assumptions, connect related findings, and surface questions that no single reviewer would think to ask.

**Open Code Review shifts this quality gate left.** By running multi-agent review *before* human review, code arrives at your team already refined—with architectural concerns, security issues, and quality gaps already surfaced and addressed. This doesn't replace human review; it makes human review faster and more focused on the things machines can't catch.

## The Core Idea

OCR gives you **full control over your review team composition**. You define:

- **Which reviewer personas** examine your code (Principal, Quality, Security, Testing, or custom reviewers you create)
- **How many of each** run in parallel (redundancy catches what single passes miss)
- **What context they use** (your project standards, specs, requirements)

```
                    ┌─────────────┐
                    │  Tech Lead  │  ← Orchestrates the review
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│   Your Team     │ │  Your Team  │ │   Your Team     │
│   Composition   │ │  Composition│ │   Composition   │
└─────────────────┘ └─────────────┘ └─────────────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                    ┌──────▼──────┐
                    │  Discourse  │  ← Reviewers debate findings
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Synthesis  │  ← Unified, prioritized feedback
                    └─────────────┘
```

**Key design decisions:**

1. **Customizable redundancy**: Run multiple instances of any reviewer type. Different prompts, different attention patterns, different catches. What one instance misses, another often finds.

2. **Discourse before synthesis**: Before producing the final review, reviewers examine each other's findings. They AGREE with valid points, CHALLENGE questionable ones, CONNECT related issues, and SURFACE new concerns.

3. **Requirements-aware**: Pass in a spec, proposal, or acceptance criteria—OCR evaluates the code against your stated requirements, not just general best practices.

4. **Project context**: OCR discovers your project's standards from `CLAUDE.md`, `.cursorrules`, OpenSpec configs, and other common patterns. Reviewers apply *your* conventions, not generic ones.

> **Note**: OCR does not replace human code review. Even the best LLMs make mistakes. The goal is to reduce the burden on human reviewers by catching issues earlier—not to eliminate human judgment from your process.

## Installation

OCR supports two distribution methods. Choose based on your environment:

### CLI Installation

Works with **any AI coding assistant** (Claude Code, Cursor, Windsurf, GitHub Copilot, and more). Provides progress tracking and multi-tool configuration.

```bash
# Install the CLI
npm install -g @open-code-review/cli

# Initialize in your project
cd your-project
ocr init
```

The CLI detects your installed AI tools and configures each appropriately.

### Claude Code Plugin

For **Claude Code** users who prefer plugin-based installation with automatic updates:

```bash
/plugin marketplace add spencermarx/open-code-review
/plugin install ocr@aclarify
```

Plugin commands use the `/ocr:` prefix: `/ocr:review`, `/ocr:doctor`, etc.

> **Next step:** After initialization, launch the dashboard to run your first review:
> ```bash
> ocr dashboard
> ```

---

## The Dashboard (Recommended)

The dashboard is the recommended way to run reviews, browse results, and manage your review workflow. Launch it with `ocr dashboard` and open your browser — everything else happens in the UI.

<p align="center">
  <img src="assets/ocr-tool-command-center.png" alt="OCR Dashboard Command Center" width="700" />
</p>

### Run reviews and maps

The **Command Center** lets you launch multi-agent code reviews and Code Review Maps directly from the dashboard. Specify targets, add requirements, toggle fresh starts — then watch live terminal output as agents work.

### Browse and triage reviews

View verdict banners, individual reviewer cards, findings tables, and cross-reviewer discourse for every review round. Set triage status on findings (needs review, in progress, changes made, acknowledged, dismissed) with filtering and sorting.

<p align="center">
  <img src="assets/ocr-tool-focused-review.png" alt="OCR review output with findings" width="700" />
</p>

### Explore Code Review Maps

Navigate large changesets with section-based breakdowns, rendered Mermaid dependency graphs, and file-level progress tracking. Mark files as reviewed to track your progress through the map.

<p align="center">
  <img src="assets/ocr-tool-focused-code-review-map.png" alt="OCR Code Review Map" width="700" />
</p>

### Post to GitHub

Two posting modes are available from the review round page:

- **Post Team Review** — Posts the multi-reviewer synthesis as-is
- **Generate Human Review** — AI-rewrites all findings into a single, natural human voice following [Google's code review guidelines](https://google.github.io/eng-practices/review/reviewer/). Preview, edit, and save drafts before posting.

<p align="center">
  <img src="assets/ocr-tool-translate-to-human-review-button.png" alt="Post Review to GitHub dialog" width="700" />
</p>

<p align="center">
  <img src="assets/ocr-tool-example-translated-human-review.png" alt="Human-voice review posted to GitHub PR" width="700" />
</p>

### Address Feedback

After reviewing the findings, address them directly. The dashboard provides a portable AI prompt you can copy into any coding tool, or — with Claude Code or OpenCode detected — run an agent directly from the dashboard to corroborate, validate, and implement changes from the review.

### Ask the Team

AI-powered chat is available on every review round and map run page. Ask follow-up questions about specific findings, request clarification on reviewer reasoning, or explore alternative approaches — all without leaving the dashboard.

### Real-time progress

Watch active reviews and maps as they run. WebSocket-based live updates show phase transitions, reviewer completions, and finding counts in real-time.

### Session notes

Attach notes to any session for tracking follow-up items, decisions, or context that doesn't belong in the review itself.

---

The dashboard reads from the same `.ocr/` directory and SQLite database used by the CLI and review workflow. No separate configuration is needed.

---

## IDE Workflows

You can also run all OCR commands directly in your AI coding assistant using slash commands. This is useful when you prefer staying in your editor or working without the dashboard.

### Using the CLI (Claude Code, Cursor, Windsurf, etc.)

**1. Stage your changes and start a review:**

```bash
git add .
```

Then in your AI assistant:

```
/ocr-review
```

**2. (Optional) Watch progress in real-time:**

In a separate terminal:

```bash
ocr progress
```

```
  Open Code Review

  2026-01-26-main  ·  Round 2  ·  1m 23s

  ━━━━━━━━━━━━━━━━────────  60%  ·  Parallel Reviews

  ✓ Context Discovery
  ✓ Change Context
  ✓ Tech Lead Analysis
  ▸ Parallel Reviews
    Round 2
    ✓ Principal #1 2  │  ✓ Principal #2 1  │  ○ Quality #1 0  │  ○ Quality #2 0
    Round 1 ✓ 4 reviewers
  · Aggregate Findings
  · Reviewer Discourse
  · Final Synthesis

  Ctrl+C to exit
```

**3. Review the output:**

```markdown
# Code Review: Feature/Auth Implementation

## Verdict: APPROVE with suggestions

### Critical (0)
No blocking issues.

### Suggestions (3)
1. **Add rate limiting** — Auth endpoints lack rate limiting
2. **Token expiry** — Consider shorter JWT expiry for security
3. **Error messages** — Avoid leaking user existence in login errors

### Requirements Verification
| Requirement | Status |
|-------------|--------|
| JWT authentication | Implemented |
| Refresh tokens | Implemented |
| Password hashing | Using bcrypt |
```

### Using the Claude Code Plugin

**1. Run a review:**

```
/ocr:review
```

**2. Review against a spec file:**

```
/ocr:review Review my staged changes against openspec/specs/cli/spec.md
```

**3. Check installation:**

```
/ocr:doctor
```

---

## Code Review Maps

For large changesets that span dozens or hundreds of files, **Code Review Maps** give you a structured navigation document — grouping related changes into sections, identifying key files, and surfacing dependencies.

```
/ocr-map                           # Map staged changes
/ocr-map HEAD~10                   # Map last 10 commits
/ocr-map feature/big-refactor      # Map branch vs main
/ocr-map --requirements spec.md    # Map with requirements context
/ocr-map --fresh                   # Regenerate from scratch
```

Maps produce a section-based breakdown of your changeset with file groupings, risk annotations, and suggested review order — ideal for orienting yourself (or a teammate) before diving into the code. You can also browse maps visually in the [dashboard](#the-dashboard-recommended) with dependency graphs and file-level progress tracking.

### When to Use a Map

- **Large changesets** — 20+ files where you'd spend hours just figuring out where to start
- **Navigation aid** — You want a structured reading order before diving into details
- **Onboarding a reviewer** — Share the map with a teammate so they can orient themselves quickly

### When Review Alone is Sufficient

For most changesets, `/ocr-review` is all you need. The Tech Lead and reviewers already trace upstream/downstream dependencies and explore beyond the diff. That lighter-weight context gathering is token-efficient and sufficient for the vast majority of changes. Maps add specialized agents (Map Architect, Flow Analysts) with redundancy — valuable for human navigation, but typically unnecessary for AI-driven feedback.

### Using Both Tools

Map and review are independent but complement each other best in this order:

1. Run `/ocr-review` first — let the AI reviewers surface findings on quality, security, and architecture
2. Run `/ocr-map` to generate a structured reading order for human review of the changeset
3. Use the map as your "last mile" navigation guide — walk through the code yourself, informed by the AI's findings

### Map Configuration

```yaml
# .ocr/config.yaml
code-review-map:
  agents:
    flow_analysts: 2        # Default: 2 (range: 1-10)
    requirements_mappers: 2  # Default: 2 (range: 1-10)
```

For large codebases, increase redundancy to 3-4 for higher-confidence groupings. For speed, set to 1.

---

## Providing Requirements

OCR is most powerful when reviewing code against explicit requirements. This is where spec-driven development shines:

**Review against a spec file:**
```
/ocr-review Review my staged changes against openspec/specs/cli/spec.md
```

**Reference an active proposal:**
```
/ocr-review Check this implementation against openspec/changes/add-auth/proposal.md
```

**Inline requirements:**
```
/ocr-review Requirements:
- Max 100 requests per minute per user
- Return 429 with Retry-After header when exceeded
- Log all rate limit violations
```

**From a ticket or bug report:**
```
/ocr-review This fixes BUG-1234 where users bypassed rate limiting by rotating API keys.
Verify the fix prevents this attack vector.
```

Requirements propagate to all reviewers—each evaluates the code against both their expertise *and* your stated requirements. The final synthesis includes a **Requirements Verification** section showing which requirements are met, which have gaps, and any ambiguities that need clarification.

---

## Posting to GitHub PRs

After completing a review, post it directly to your PR as a comment.

### From the Dashboard

The dashboard's review round page includes a **Post to GitHub** button with two posting modes — team review or human review translation. See [The Dashboard > Post to GitHub](#post-to-github) above for details.

### From Your AI Assistant

The `/ocr-post` command posts the most recent review round to your PR:

```
/ocr-post
```

<p align="center">
  <img src="assets/github-code-review-example.png" alt="OCR review posted to GitHub PR" width="700" />
</p>

The posted review includes your summary, findings breakdown, and requirements assessment—giving human reviewers immediate context when they open the PR.

**Prerequisites:**
- GitHub CLI (`gh`) must be installed and authenticated
- Your branch must have an open PR

### Workflow Integration

OCR fits naturally into your development workflow at multiple points:

**Local pre-push hook:**
```bash
# .git/hooks/pre-push
#!/bin/bash
echo "Running OCR review..."
# Trigger review in your AI assistant, or run via CLI
# Post results to PR if one exists
```

**Manual quality gate:**
```bash
# Before requesting human review
git push origin feature-branch
# Open PR, then in your AI assistant:
/ocr-review
/ocr-post
```

**CI integration:**
```yaml
# .github/workflows/code-review.yml
name: Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run OCR
        run: |
          npx @open-code-review/cli init --tools claude
          # Trigger review via API or CLI
          # Post to PR via gh pr comment
```

> **Tip**: Running OCR before human review means reviewers see code that's already been refined—they can focus on architectural decisions and business logic rather than catching routine issues.

---

## How It Works

OCR follows an 8-phase workflow:

| Phase | Description |
|-------|-------------|
| **1. Context Discovery** | Load `.ocr/config.yaml`, discover project standards, read OpenSpec context |
| **2. Change Analysis** | Analyze `git diff`, understand what changed and why |
| **3. Tech Lead Assessment** | Summarize changes, identify risk areas, select reviewer team |
| **4. Parallel Reviews** | Each reviewer examines code independently (based on your team config) |
| **5. Aggregation** | Merge findings from redundant reviewers |
| **6. Discourse** | Reviewers challenge, validate, and connect findings |
| **7. Synthesis** | Produce prioritized, deduplicated final review |
| **8. Presentation** | Display results; optionally post to GitHub |

---

## Commands

### AI Assistant Commands

| Command | Description |
|---------|-------------|
| `/ocr-review [target]` | Review staged changes, commits, or branches |
| `/ocr-review --fresh` | Clear session and start fresh |
| `/ocr-map [target]` | Generate a Code Review Map for large changesets |
| `/ocr-doctor` | Verify installation and dependencies |
| `/ocr-reviewers` | List available reviewer personas |
| `/ocr-history` | List past review sessions |
| `/ocr-show [session]` | Display a specific past review |
| `/ocr-post` | Post review as a GitHub PR comment |

*For Claude Code plugin, use `/ocr:review`, `/ocr:doctor`, etc.*

### CLI Commands

| Command | Description |
|---------|-------------|
| `ocr init` | Initialize OCR for your AI tools |
| `ocr doctor` | Check installation and verify dependencies |
| `ocr progress` | Watch review progress live |
| `ocr dashboard` | Start the web dashboard interface |
| `ocr update` | Update skills and commands to latest version |
| `ocr state` | Manage session state (internal) |

---

## Configuration

After running `ocr init`, edit `.ocr/config.yaml` to customize your review team:

```yaml
# Project context injected into all reviews
context: |
  Tech stack: TypeScript, React, Node.js
  Critical: All public APIs must be backwards compatible

# Customize your reviewer team composition
default_team:
  principal: 2    # Run 2 Principal reviewers (architecture, design)
  quality: 2      # Run 2 Quality reviewers (code style, best practices)
  security: 1     # Run 1 Security reviewer (auth, data handling)
  testing: 1      # Run 1 Testing reviewer (coverage, edge cases)

# Or request changes inline: "add 3 security reviewers", "skip quality"
```

**Team composition is fully customizable:**
- Increase redundancy for critical reviews: `principal: 4`
- Add specialized reviewers: `security: 2`, `testing: 1`
- Request changes via natural language: "use 3 principal reviewers and add security"
- Create custom reviewer personas (see below)

---

## Creating Custom Reviewers

Create domain-specific reviewers by adding files to `.ocr/skills/references/reviewers/`:

```markdown
# .ocr/skills/references/reviewers/performance.md

# Performance Engineer

You are a performance-focused code reviewer.

## Focus Areas
- Response times and latency
- Memory usage and leaks
- Database query efficiency
- Caching strategies

## Anti-Patterns to Flag
- N+1 queries
- Unbounded loops over large datasets
- Missing database indexes
- Synchronous operations that should be async
```

Then use it:
- In config: `default_team: { performance: 2, principal: 1 }`
- Via natural language: "add 2 performance reviewers"
- Mix with defaults: "use the default team plus a performance reviewer"

---

## Session Storage

Reviews are persisted to `.ocr/sessions/{date}-{branch}/`:

```
.ocr/sessions/2026-01-26-feature-auth/
├── state.json              # Phase tracking (for progress CLI)
├── discovered-standards.md # Merged project context (shared)
├── context.md              # Change summary + Tech Lead guidance (shared)
├── requirements.md         # User-provided requirements (shared, if any)
└── rounds/
    └── round-1/            # Review round (per-round artifacts)
        ├── reviews/
        │   ├── principal-1.md
        │   ├── principal-2.md
        │   ├── quality-1.md
        │   └── quality-2.md
        ├── discourse.md    # Cross-reviewer discussion
        └── final.md        # Synthesized final review
```

Sessions are gitignored by default.

---

## Updating OCR

After upgrading the `@open-code-review/cli` package, run:

```bash
ocr update
```

This updates skills, references, and commands to the latest version while **preserving your customizations**.

### What Gets Updated

| Asset | Updated | Notes |
|-------|---------|-------|
| `.ocr/skills/SKILL.md` | Yes | Tech Lead orchestration |
| `.ocr/skills/references/` | Yes | Workflow, discourse rules |
| `.ocr/skills/assets/reviewer-template.md` | Yes | Template for custom reviewers |
| `.ocr/skills/references/reviewers/` | No | **Preserved** — all reviewer personas kept |
| `.ocr/config.yaml` | No | **Preserved** — your customizations are kept |
| Tool commands (`.windsurf/`, etc.) | Yes | Slash command definitions |
| `AGENTS.md` / `CLAUDE.md` | Yes | OCR managed blocks only |
| `.ocr/sessions/` | No | Review history untouched |

### Update Options

```bash
# Preview changes without modifying files
ocr update --dry-run

# Update only specific components
ocr update --commands    # Commands only
ocr update --skills      # Skills and references only
ocr update --inject      # AGENTS.md/CLAUDE.md only
```

### FAQ

**Will my `.ocr/config.yaml` be overwritten?**

No. Your configuration file is explicitly preserved during updates. Any customizations you've made to `context`, `default_team`, or other settings remain intact.

**What about my reviewers?**

All reviewers in `.ocr/skills/references/reviewers/` are preserved—both default and custom. Updates never overwrite reviewer files. This prepares for future template-based reviewer management where you'll be able to add reviewers from a curated library.

**Do I need to re-run `ocr init`?**

No. Use `ocr update` instead — it remembers which tools you configured and updates them automatically. Only run `ocr init` if you want to add support for a new AI tool.

**I deleted a default reviewer. How do I get it back?**

Since updates preserve all existing reviewers, deleted reviewers won't be restored automatically. To restore a default reviewer, delete the entire `.ocr/` directory and run `ocr init` again, or manually copy the reviewer file from the [@open-code-review/agents](https://github.com/spencermarx/open-code-review/tree/main/packages/agents/skills/ocr/references/reviewers) package. We're planning to release a template library feature that will let you easily add reviewers on demand — stay tuned!

---

### Multi-Round Reviews

OCR uses a **round-first architecture** that supports iterative review cycles:

| Round | Trigger | Use Case |
|-------|---------|----------|
| `round-1/` | First `/ocr-review` | Initial code review |
| `round-2/` | Second `/ocr-review` on same day/branch | Re-review after addressing feedback |
| `round-3/` | Third `/ocr-review` | Further iteration |

**How it works:**
- Running `/ocr-review` on an existing session checks if the current round is complete (has `final.md`)
- If complete → starts a new round (`round-2/`, `round-3/`, etc.)
- If incomplete → resumes the current round
- Previous rounds are **preserved**, not overwritten
- Shared context (`discovered-standards.md`, `context.md`) is reused across rounds

**When to use multiple rounds:**
- Author addresses review feedback and wants verification
- Scope changes mid-review require fresh analysis
- Different reviewer team composition needed for a second pass

This enables a natural "review → fix → re-review" workflow without losing history.

---

## Requirements

- **Node.js** >= 20.0.0
- **Git** — For diff analysis
- **An AI coding assistant** — Claude Code, Cursor, Windsurf, or [any supported tool](#installation)
- **GitHub CLI** (`gh`) — Optional, for `/ocr-post`

> **Important**: The CLI (`npm install -g @open-code-review/cli`) is required for all OCR workflows. Both review and map commands use `ocr state` for progress tracking at every phase transition. Install it globally or use `npx`.

Run `ocr doctor` to verify your setup.

---

## License

Apache-2.0

---

## Links

- **GitHub**: [github.com/spencermarx/open-code-review](https://github.com/spencermarx/open-code-review)
- **npm (CLI)**: [@open-code-review/cli](https://www.npmjs.com/package/@open-code-review/cli)
- **npm (Agents)**: [@open-code-review/agents](https://www.npmjs.com/package/@open-code-review/agents)
