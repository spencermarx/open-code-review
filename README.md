<p align="center">
  <img src="assets/open-code-review-logo.png" alt="Open Code Review" width="400" />
</p>

<h1 align="center">Open Code Review</h1>

<p align="center">
  <strong>Multi-agent code review for AI coding assistants</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@open-code-review/cli"><img src="https://img.shields.io/npm/v/@open-code-review/cli.svg" alt="npm version"></a>
  <a href="https://github.com/spencermarx/open-code-review/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License"></a>
</p>

---

## The Problem

When you ask an AI assistant to "review my code," you get a single perspective. The assistant does its best, but it's one pass through the code—and that pass reflects whatever the model happens to focus on first.

Real code review doesn't work this way. In a healthy engineering culture, multiple reviewers examine code from different angles. A security-minded engineer catches authentication issues. A quality-focused engineer spots missing error handling. A principal engineer questions the architectural fit. And critically, these reviewers *talk to each other*—they challenge assumptions, connect related findings, and surface questions that no single reviewer would think to ask.

**Open Code Review brings this multi-perspective model to AI-assisted development.**

## The Mental Model

OCR orchestrates a team of specialized reviewer personas, each examining your code through a distinct lens:

```
                    ┌─────────────┐
                    │  Tech Lead  │  ← Orchestrates the review
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│   Principal ×2  │ │  Quality ×2 │ │ Security/Testing│
│   (Architecture)│ │ (Code Style)│ │   (Optional)    │
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

1. **Redundancy over single-pass**: Two Principal reviewers and two Quality reviewers run independently. Different prompts, different attention patterns, different catches. What one misses, the other often finds.

2. **Discourse before synthesis**: Before producing the final review, reviewers examine each other's findings. They AGREE with valid points, CHALLENGE questionable ones, CONNECT related issues, and SURFACE new concerns. This catches false positives and strengthens real findings.

3. **Requirements-aware**: Pass in a spec, proposal, or acceptance criteria—OCR evaluates the code against your stated requirements, not just general best practices.

4. **Project context**: OCR discovers your project's standards from `CLAUDE.md`, `.cursorrules`, OpenSpec configs, and other common patterns. Reviewers apply *your* conventions, not generic ones.

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

Native integration for **Claude Code** users. Automatic updates, no local installation required.

```bash
# Step 1: Add the marketplace
/plugin marketplace add spencermarx/open-code-review

# Step 2: Install the plugin
/plugin install open-code-review@spencermarx-open-code-review
```

Commands are namespaced as `/open-code-review:review`, `/open-code-review:doctor`, etc.

---

## Quick Start

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
┌────────────────────────────────────┐
│  Open Code Review - Live Progress  │
└────────────────────────────────────┘

Session:  2026-01-26-main
Elapsed:  01:23

████████████░░░░░░░░ 60%

─── Workflow Phases ───

✓ Context Discovery
✓ Tech Lead Analysis
● Parallel Reviews
   └─ ✓ Principal #1 → 2 findings
   └─ ○ Principal #2
   └─ ○ Quality #1
   └─ ○ Quality #2
○ Reviewer Discourse
○ Final Synthesis
```

**3. Review the output:**

```markdown
# Code Review: Feature/Auth Implementation

## Verdict: ✅ APPROVE with suggestions

### Critical (0)
No blocking issues.

### Suggestions (3)
1. **Add rate limiting** — Auth endpoints lack rate limiting
2. **Token expiry** — Consider shorter JWT expiry for security
3. **Error messages** — Avoid leaking user existence in login errors

### Requirements Verification
| Requirement | Status |
|-------------|--------|
| JWT authentication | ✅ Implemented |
| Refresh tokens | ✅ Implemented |
| Password hashing | ✅ Using bcrypt |
```

### Using the Claude Code Plugin

**1. Run a review:**

```
/open-code-review:review
```

**2. Check installation:**

```
/open-code-review:doctor
```

**3. View past reviews:**

```
/open-code-review:history
```

---

## Providing Requirements

OCR is most effective when given context about what the code *should* do. Provide requirements naturally:

**Reference a spec file:**
```
Review my code against openspec/changes/add-auth/proposal.md
```

**Inline requirements:**
```
Review this PR. Requirements:
- Max 100 requests per minute per user
- Return 429 with Retry-After header when exceeded
```

**From a ticket or bug report:**
```
Review this fix for BUG-1234. The issue was that users could 
bypass rate limiting by rotating API keys.
```

Requirements propagate to all reviewers—each evaluates the code against both their expertise *and* your stated requirements.

---

## How It Works

OCR follows an 8-phase workflow:

| Phase | Description |
|-------|-------------|
| **1. Context Discovery** | Load `.ocr/config.yaml`, discover project standards, read OpenSpec context |
| **2. Change Analysis** | Analyze `git diff`, understand what changed and why |
| **3. Tech Lead Assessment** | Summarize changes, identify risk areas, select reviewer team |
| **4. Parallel Reviews** | Each reviewer examines code independently (2× Principal, 2× Quality) |
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
| `/ocr-doctor` | Verify installation and dependencies |
| `/ocr-reviewers` | List available reviewer personas |
| `/ocr-history` | List past review sessions |
| `/ocr-show [session]` | Display a specific past review |
| `/ocr-post` | Post review as a GitHub PR comment |

*For Claude Code plugin, use `/open-code-review:review`, etc.*

### CLI Commands

| Command | Description |
|---------|-------------|
| `ocr init` | Initialize OCR for your AI tools |
| `ocr progress` | Watch review progress live |

---

## Configuration

After running `ocr init`, edit `.ocr/config.yaml`:

```yaml
# Project context injected into all reviews
context: |
  Tech stack: TypeScript, React, Node.js
  Critical: All public APIs must be backwards compatible

# Default reviewer team
default_team:
  principal: 2    # Architecture and design
  quality: 2      # Code style and best practices
  # security: 1   # Uncomment for auth/API/data changes
  # testing: 1    # Uncomment for logic-heavy changes

# Context discovery settings
context_discovery:
  openspec:
    enabled: true
    config: "openspec/config.yaml"      # Or "openspec/project.md" for legacy
    specs: "openspec/specs/**/*.md"
    active_changes: "openspec/changes/**/*.md"
  references:
    - "AGENTS.md"
    - "CLAUDE.md"
    - ".cursorrules"
    - "CONTRIBUTING.md"
```

---

## Creating Custom Reviewers

Add domain-specific reviewers to `.ocr/skills/references/reviewers/`:

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

Then reference in your config or request: "add a performance reviewer."

---

## Session Storage

Reviews are persisted to `.ocr/sessions/{date}-{branch}/`:

```
.ocr/sessions/2026-01-26-feature-auth/
├── state.json              # Phase tracking (for progress CLI)
├── discovered-standards.md # Merged project context
├── context.md              # Change summary
├── requirements.md         # User-provided requirements
├── reviews/
│   ├── principal-1.md
│   ├── principal-2.md
│   ├── quality-1.md
│   └── quality-2.md
├── discourse.md            # Cross-reviewer discussion
└── final.md                # Synthesized final review
```

Sessions are gitignored by default.

---

## Requirements

- **Node.js** ≥ 20.0.0 (for CLI)
- **Git** — For diff analysis
- **GitHub CLI** (`gh`) — Optional, for `/ocr-post`

Run `/ocr-doctor` to verify your setup.

---

## License

Apache-2.0

---

## Links

- **GitHub**: [github.com/spencermarx/open-code-review](https://github.com/spencermarx/open-code-review)
- **npm (CLI)**: [@open-code-review/cli](https://www.npmjs.com/package/@open-code-review/cli)
- **npm (Agents)**: [@open-code-review/agents](https://www.npmjs.com/package/@open-code-review/agents)
