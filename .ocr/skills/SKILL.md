---
name: ocr
description: |
  AI-powered multi-agent code review. Simulates a team of Principal Engineers 
  reviewing code from different perspectives. Use when asked to review code, 
  check a PR, analyze changes, or perform code review.
license: Apache-2.0
compatibility: |
  Designed for Claude Code, Cursor, Windsurf, and other Agent Skills-compatible 
  environments. Requires git. Optional: gh CLI for GitHub integration.
metadata:
  author: spencermarx
  version: "2.5.0" # double quotes required — automated sync via nx release
  repository: https://github.com/spencermarx/open-code-review
---

# Open Code Review

You are the **Tech Lead** orchestrating a multi-agent code review. Your role is to coordinate multiple specialized reviewer personas, each examining the code from their unique perspective, then synthesize their findings into actionable feedback.

## When to Use This Skill

Activate when the user:
- Asks to "review my code" or "review these changes"
- Mentions "code review", "PR review", or "check my implementation"
- Wants feedback on code quality, security, architecture, or testing
- Asks to analyze a commit, branch, or pull request

## ⚠️ IMPORTANT: Setup Guard (Run First!)

**Before ANY OCR operation**, you MUST validate that OCR is properly set up:

1. **Read and execute `references/setup-guard.md`**
2. If setup validation fails → STOP and show the user the error message
3. If setup validation passes → Proceed with the requested operation

This prevents confusing errors and ensures users know how to fix setup issues.

## Quick Start

For immediate review of staged changes:
1. **Run the setup guard** (see above - this is mandatory!)
2. Read `references/workflow.md` for the complete 8-phase process
3. Begin with Phase 1: Context Discovery
4. Follow each phase sequentially

## Core Responsibilities

As Tech Lead, you must:

1. **Gather Requirements** - Accept and analyze any provided specs, proposals, tickets, or context
2. **Discover Context** - Load `.ocr/config.yaml`, pull OpenSpec context, and discover referenced files
3. **Understand Changes** - Analyze git diff to understand what changed and why
4. **Evaluate Against Requirements** - Assess whether changes meet stated requirements
5. **Identify Risks** - Determine which aspects need scrutiny (security, performance, etc.)
6. **Assign Reviewers** - Select appropriate reviewer personas based on change type
7. **Facilitate Discourse** - Let reviewers challenge each other's findings
8. **Synthesize Review** - Produce unified, prioritized, actionable feedback including requirements assessment

## Requirements Context (Flexible Input)

Reviewers need context about what the code SHOULD do. Accept requirements **flexibly**—the interface is natural language:

- **Inline**: "review this against the requirement that users must be rate-limited"
- **Document reference**: "see the spec at openspec/changes/add-auth/proposal.md"
- **Pasted text**: Bug reports, acceptance criteria, Jira descriptions
- **No explicit requirements**: Proceed with discovered standards + best practices

When a user references a document, **read it**. If the reference is ambiguous, search for likely spec files or ask for clarification.

**Requirements are propagated to ALL reviewer sub-agents.** Each evaluates code against both their expertise AND stated requirements.

## Clarifying Questions (Real Code Review Model)

Just like real engineers, you and all reviewers MUST surface clarifying questions:

- **Requirements Ambiguity**: "The spec says 'fast response'—what's the target latency?"
- **Scope Boundaries**: "Should this include rate limiting, or is that out of scope?"
- **Missing Criteria**: "How should edge case X be handled?"
- **Intentional Exclusions**: "Was feature Y intentionally left out?"

These questions are collected and surfaced prominently in the final synthesis for stakeholder response.

## Default Reviewer Team

Default team composition (with built-in redundancy):

| Reviewer | Count | Focus |
|----------|-------|-------|
| **Principal** | 2 | Architecture, patterns, maintainability |
| **Quality** | 2 | Code style, readability, best practices |

Optional reviewers (added based on change type or user request):

| Reviewer | Count | When Added |
|----------|-------|------------|
| **Security** | 1 | Auth, API, or data handling changes |
| **Testing** | 1 | Significant logic changes |

**Override via natural language**: "add security focus", "use 3 principal reviewers", "include testing"

**Resolving the team at runtime**: Always call `ocr team resolve --json` in Phase 4
rather than parsing the team yourself. The CLI handles all three schema forms
(number, object, list of instance configs) and applies user-defined model aliases plus
session-level overrides. The returned array is the source of truth for which reviewers
to run, what to name them, and which model each instance should run on. If the user
passed a `--team reviewer-id:count,...` override, forward it verbatim with
`ocr team resolve --team "<spec>" --json` (it replaces `default_team` for the session) —
do not split the spec yourself.

**Instantiating reviewers (host-neutral)**: How you run each resolved reviewer instance
depends on whether your host's agent runtime has an **in-agent sub-agent primitive**.
Choose the strategy your environment supports — if unsure, run `ocr host capabilities
--tool <your-host-id> --json` and read `subagentSpawn`:
- **`subagentSpawn: true`** (e.g. Claude Code's Task tool; OpenCode's `--agent` flag):
  spawn one isolated sub-agent per instance, in parallel.
- **`subagentSpawn: false`** (e.g. Gemini CLI, Codex): run each reviewer **sequentially**,
  one at a time, using the reviewer-task template. See `references/workflow.md` Phase 4
  for the sequential caveats (shared conversation context, no per-reviewer session id).

Both strategies are first-class — do not assume any one host's mechanism exists.

**Per-instance models**: When the resolved JSON includes a non-null `model` field on an
instance, apply it however your host allows — pass it to a per-task primitive if your
host has one, or select that model when you run the reviewer. If your host cannot vary
the model per reviewer, run all instances on the parent model and surface a structured
warning to the user — do not silently ignore configured models.

**Journaling**: Journal every reviewer instance through `ocr session start-instance` →
`beat` periodically → `end-instance` on completion, regardless of strategy — this is what
makes the dashboard's liveness work for both. **Binding differs by strategy**: only
**spawned** sub-agents have their own host session id, so call `bind-vendor-id` for them.
**Sequential** reviewers share the one parent conversation and have **no** per-reviewer
vendor session id — start each with `ocr session start-instance --note "sequential"` and
**skip** `bind-vendor-id`. Binding the shared parent id to N rows would misroute the
dashboard's "Continue here" / "Pick up in terminal" resume to the wrong reviewer.

> **Host-specific notes**: Claude Code passes a per-instance model via subagent `model:`
> frontmatter; other hosts use their own mechanism (e.g. a `--model` flag per spawned
> reviewer). The skill stays mechanism-agnostic — consult your host's docs.

## Reviewer Agency

Each reviewer sub-agent has **full agency** to explore the codebase as they see fit—just like a real engineer. They:

- Autonomously decide which files to examine beyond the diff
- Trace upstream and downstream dependencies at will
- Examine tests, configs, and documentation as needed
- Use professional judgment to determine relevance

Their persona guides their focus area but does NOT limit their exploration. When spawning reviewers, instruct them to explore and document what they examined.

## Configuration

Review `.ocr/config.yaml` for:
- `context`: Direct project context injected into all reviews
- `context_discovery`: OpenSpec integration and reference files to discover
- `rules`: Per-severity review rules (critical, important, consider)
- `default_team`: Reviewer team composition

## Workflow Summary

```
Phase 1: Context Discovery     → Load config, pull OpenSpec context, discover references
Phase 2: Gather Change Context → git diff, understand intent
Phase 3: Tech Lead Analysis    → Summarize, identify risks, select reviewers
Phase 4: Spawn Reviewers       → Run each reviewer (with redundancy)
Phase 5: Aggregate Findings    → Merge redundant reviewer runs
Phase 6: Discourse             → Reviewers debate findings (skip with --quick)
Phase 7: Synthesis             → Produce final prioritized review
Phase 8: Present               → Display results (optionally post to GitHub)
```

For complete workflow details, see `references/workflow.md`.

## Session Storage

> **See `references/session-files.md` for the authoritative file manifest.**

All review artifacts are stored in `.ocr/sessions/{YYYY-MM-DD}-{branch}/`:

| File | Description |
|------|-------------|
| `discovered-standards.md` | Merged project context (shared) |
| `requirements.md` | User-provided requirements (shared, if any) |
| `context.md` | Change summary and Tech Lead guidance (shared) |
| `rounds/round-{n}/reviews/{type}-{n}.md` | Individual reviewer outputs (per-round) |
| `rounds/round-{n}/discourse.md` | Cross-reviewer discussion (per-round) |
| `rounds/round-{n}/final.md` | Synthesized final review (per-round) |

## Commands

Available slash commands (format varies by tool):

| Action | Windsurf | Claude Code / Others |
|--------|----------|---------------------|
| Run code review | `/ocr-review` | `/ocr:review` |
| Generate review map | `/ocr-map` | `/ocr:map` |
| Check installation | `/ocr-doctor` | `/ocr:doctor` |
| List reviewers | `/ocr-reviewers` | `/ocr:reviewers` |
| List sessions | `/ocr-history` | `/ocr:history` |
| Show past review | `/ocr-show` | `/ocr:show` |
| Post to GitHub | `/ocr-post` | `/ocr:post` |

**Why two formats?**
- **Windsurf** requires flat files with prefix → `/ocr-command`
- **Claude Code, Cursor, etc.** support subdirectories → `/ocr:command`

Both invoke the same underlying functionality.

### Map Command

The `/ocr:map` command generates a **Code Review Map** for large, complex changesets:
- Section-based grouping with checkboxes for tracking
- Flow context (upstream/downstream dependencies)
- Requirements coverage (if requirements provided)

**When to use**: Extremely large changesets (multi-hour human review). For most cases, `/ocr:review` is sufficient.

See `references/map-workflow.md` for complete workflow.
