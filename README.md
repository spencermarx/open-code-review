<p align="center">
  <img src="assets/open-code-review-logo.png" alt="Open Code Review" width="400" />
</p>

<h1 align="center">Open Code Review (OCR)</h1>

<p align="center">
  AI-powered multi-agent code review that simulates a team of Principal Engineers reviewing your code from different perspectives.
</p>

---

## Features

- **Multi-Agent Review**: 2× Principal Engineers + 2× Quality Engineers by default, with optional Security and Testing reviewers
- **Redundancy for Confidence**: Multiple reviewers catch what one might miss
- **Discourse Phase**: Reviewers challenge and validate each other's findings
- **Requirements-Aware**: Review code against specs, proposals, or acceptance criteria
- **Live Progress Tracking**: Watch reviews happen in real-time with `ocr progress`
- **Cross-Platform**: Works with Claude Code, Cursor, Windsurf, and other AI assistants

---

## Quick Start

OCR can be installed in two ways:

### Option A: CLI Installation (Recommended)

The CLI installs OCR as a skill in your project and provides progress tracking.

```bash
# Install globally
npm install -g @open-code-review/cli

# Initialize in your project
cd your-project
ocr init

# Watch reviews in real-time
ocr progress
```

**What `ocr init` does:**
- Creates `.ocr/` directory with skills, commands, and config
- Injects instructions into `AGENTS.md` / `CLAUDE.md`
- Detects and configures Claude Code, Cursor, and Windsurf

### Option B: Claude Code Plugin

Install directly from the marketplace:

```bash
# In Claude Code, run:
/plugin marketplace add spencermarx/open-code-review

# Then install the plugin:
/plugin install open-code-review@spencermarx-open-code-review
```

### Option C: Manual Installation

For other AI assistants (Cursor, Windsurf, etc.) without the CLI:

```bash
# Clone the repository
git clone https://github.com/spencermarx/open-code-review.git

# Copy the agents package to your project
cp -r open-code-review/packages/agents/skills/ocr .cursor/skills/
cp -r open-code-review/packages/agents/commands .cursor/commands/
```

Or reference the skill directly in your agent's configuration.

### Usage

**Natural Language** (auto-activates):
```
Review my code
Check these changes
Can you do a code review?
```

**Slash Commands**:
```
/ocr-review                    # Review staged changes
/ocr-review HEAD~3             # Review last 3 commits  
/ocr-review feature/auth       # Review branch vs main
/ocr-review --fresh            # Clear session and start over
```

**With Requirements Context**:
```
Review my code against the spec at openspec/changes/add-auth/proposal.md

Review this PR - it should implement rate limiting per the requirements:
- Max 100 requests per minute per user
- Return 429 with Retry-After header
```

---

## Example Workflow

Here's what a typical OCR review session looks like:

### 1. Start the Review

```bash
# Stage your changes
git add .

# In your AI assistant (Claude Code, Cursor, Windsurf)
/ocr-review
```

### 2. Watch Progress (Optional)

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
  ✓ Requirements Gathering
  ✓ Tech Lead Analysis
  ● Parallel Reviews
     └─ ✓ Principal #1 → 2 findings
     └─ ○ Principal #2
     └─ ○ Quality #1
     └─ ○ Quality #2
  ○ Aggregate Findings
  ○ Reviewer Discourse
  ○ Final Synthesis
  ○ Review Complete

  Press Ctrl+C to exit
```

### 3. Review Completes

The AI assistant produces a final review:

```markdown
# Code Review: Feature/Auth Implementation

## Verdict: ✅ APPROVE with suggestions

### Critical (0)
No blocking issues.

### Suggestions (3)
1. **Add rate limiting** — Auth endpoints should be rate-limited
2. **Token expiry** — Consider shorter JWT expiry for security
3. **Error messages** — Avoid leaking user existence in login errors

### Requirements Verification
| Requirement | Status |
|-------------|--------|
| JWT authentication | ✅ Implemented |
| Refresh tokens | ✅ Implemented |
| Password hashing | ✅ Using bcrypt |
```

### 4. Post to GitHub (Optional)

```bash
/ocr-post
```

This posts the review as a PR comment.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  1. Context Discovery                                        │
│     Find project standards (CLAUDE.md, .cursorrules, etc.)  │
│     Gather user-provided requirements                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  2. Tech Lead Analysis                                       │
│     Understand changes, evaluate against requirements        │
│     Identify risks, select reviewers                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  3. Spawn Reviewers (with redundancy)                        │
│     ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│     │Principal │ │Principal │ │Quality   │ │Quality   │    │
│     │    1     │ │    2     │ │    1     │ │    2     │    │
│     └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│     + Security (optional)  + Testing (optional)             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  4. Discourse Phase                                          │
│     Reviewers AGREE, CHALLENGE, CONNECT, SURFACE            │
│     (skip with --quick)                                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  5. Synthesis                                                │
│     Deduplicate, prioritize, assess requirements            │
│     Surface clarifying questions                             │
│     Generate final verdict                                   │
└─────────────────────────────────────────────────────────────┘
```

## Commands

| Command | Description |
|---------|-------------|
| `/ocr-review [target]` | Run a code review |
| `/ocr-review --fresh` | Clear session and start fresh |
| `/ocr-doctor` | Check installation status |
| `/ocr-reviewers` | List available reviewers |
| `/ocr-history` | List past review sessions |
| `/ocr-show [session]` | Display a past review |
| `/ocr-post` | Post review to GitHub PR |

**CLI Commands** (if installed via CLI):

| Command | Description |
|---------|-------------|
| `ocr init` | Initialize OCR in your project |
| `ocr update` | Update to latest version |
| `ocr progress` | Watch review progress live |

## Configuration

Edit `.ocr/config.yaml`:

```yaml
# Default reviewer team
default_team:
  principal: 2    # 2× holistic architecture review
  quality: 2      # 2× code quality review
  # security: 1   # Add for auth/API/data changes
  # testing: 1    # Add for logic changes

# Context discovery
context_discovery:
  platform_instructions:
    - "CLAUDE.md"
    - "AGENTS.md"
    - ".cursorrules"
  openspec:
    - "openspec/config.yaml"
    - "openspec/changes/*/proposal.md"
```

## Custom Reviewers

Create domain-specific reviewers by adding files to `.ocr/skills/references/reviewers/`:

```markdown
# .ocr/skills/references/reviewers/performance.md

# Performance Engineer

## Focus
Response times, memory usage, database queries, caching

## Anti-Patterns
- N+1 queries
- Unbounded loops  
- Missing indexes
- Memory leaks
```

See `.ocr/skills/assets/reviewer-template.md` for the full template.

## Session Storage

Reviews are saved to `.ocr/sessions/{date}-{branch}/`:

```
.ocr/sessions/2026-01-26-main/
├── state.json              # Phase tracking (for progress CLI)
├── discovered-standards.md # Project context
├── context.md              # Change summary
├── reviews/
│   ├── principal-1.md      # Individual reviewer outputs
│   ├── principal-2.md
│   ├── quality-1.md
│   └── quality-2.md
├── discourse.md            # Reviewer cross-discussion
└── final.md                # Synthesized final review
```

Sessions are gitignored by default (see `.ocr/.gitignore`).

## Requirements

- **Node.js** ≥ 20.0.0
- **Git** — For diff analysis
- **pnpm** — For CLI installation (or npm/yarn)
- **GitHub CLI** (`gh`) — Optional, for PR integration

Run `/ocr-doctor` to verify your setup.

## License

Apache-2.0

## Contributing

We encourage contributors to use OCR to review their own changes before submitting!

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Links

- [GitHub Repository](https://github.com/open-code-review/open-code-review)
- [npm Package](https://www.npmjs.com/package/@open-code-review/cli)
