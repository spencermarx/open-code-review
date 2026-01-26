# Design: Open Code Review Core System

## Context

OCR is a multi-agent AI code review framework designed for Claude Code and portable to other Agent Skills-compatible environments. The system must:

1. Work immediately after installation (zero-config)
2. Leverage built-in AI capabilities (no external CLI)
3. Support cross-tool portability (Claude Code, Copilot, Codex CLI, Cursor, Windsurf)
4. Enable team customization without requiring code changes

**Stakeholders**: Individual developers, small teams, open source maintainers, enterprise teams.

**Constraints**:
- Pure markdown + shell (no Node.js, Python, or other runtime dependencies)
- Must work within Agent Skills standard
- Session data stored locally (`.ocr/` directory)
- Git 2.0+ required; GitHub CLI optional

## Goals / Non-Goals

### Goals
- Multi-agent orchestration with specialized reviewer personas
- Automatic context discovery from project configuration files
- Configurable redundancy for critical reviewers
- Discourse phase for cross-reviewer discussion
- Portable implementation using Agent Skills standard
- Interactive reviewer management through conversation

### Non-Goals (v1.0)
- IDE extensions (VS Code, JetBrains)
- CI/CD integration (GitHub Actions)
- Review analytics and trend tracking
- Real-time collaborative review
- Custom LLM provider configuration

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OPEN CODE REVIEW                                   │
│                         (Agent Skills Architecture)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User Interaction Layer                                                      │
│  ─────────────────────                                                       │
│  • Natural language: "review my code", "check this PR"                       │
│  • Slash commands: /ocr:review, /ocr:doctor, /ocr:add-reviewer               │
│  • Requirements input: --spec, --proposal, --context, inline descriptions   │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                 CONTEXT DISCOVERY + REQUIREMENTS INPUT                  │ │
│  │  Config-driven: .ocr/config.yaml (context, rules, discovery settings)  │ │
│  │  OpenSpec integration: openspec/config.yaml context + specs            │ │
│  │  Auto-discovered: AGENTS.md, CLAUDE.md, .cursorrules, .windsurfrules   │ │
│  │  Merged into: discovered-standards.md + requirements.md                 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         SKILL + COMMANDS                                │ │
│  │  .ocr/skills/SKILL.md (auto-invoke via tool-specific paths)            │ │
│  │  .ocr/commands/*.md or tool-specific command paths                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    AI ORCHESTRATION (Tech Lead)                         │ │
│  │  1. Discover context + requirements  →  2. Analyze change vs reqs       │ │
│  │  3. Assign reviewers  →  4. Spawn Tasks (with redundancy)               │ │
│  │  5. Facilitate discourse  →  6. Synthesize (incl. requirements check)   │ │
│  │                                                                          │ │
│  │  Built-in tools: Bash, Read, Write, Glob, Grep, Task                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                   REVIEWER SUB-AGENTS (Full Agency)                     │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                   │ │
│  │  │Principal │ │Security  │ │Quality   │ │Testing   │ + Custom          │ │
│  │  │(1x)      │ │(2x)      │ │(1x)      │ │(1x)      │                   │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘                   │ │
│  │  Each receives: Persona + Context + Requirements + Guidance + Diff      │ │
│  │  Each has AGENCY to explore codebase as they see fit (like real eng)   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                           SESSION STORAGE                               │ │
│  │  .ocr/sessions/{YYYY-MM-DD}-{branch}/                                   │ │
│  │  ├── context.md, discovered-standards.md                                │ │
│  │  ├── reviews/{reviewer}-{n}.md                                          │ │
│  │  ├── discourse.md                                                       │ │
│  │  └── final.md                                                           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Decisions

### Decision 1: Agent Skills Architecture (No External CLI)

**Choice**: Implement entirely within Agent Skills standard using SKILL.md, slash commands, and markdown reference documents.

**Why**: 
- Claude Code already provides all needed capabilities (Bash, Read, Write, Glob, Grep, Task)
- No runtime dependencies = maximum portability
- Works immediately without npm/pip install
- Cross-tool compatible (Copilot, Codex CLI, etc.)

**Alternatives Considered**:
- **Node.js CLI**: Would require npm install, breaks zero-config goal
- **Python CLI**: Same issues as Node.js
- **Shell scripts**: Less portable, harder to maintain

### Decision 2: Automatic Context Discovery

**Choice**: Automatically search for and merge project context from known configuration files.

**Priority Order**:
1. `.ocr/config.yaml` context and rules (OCR-specific, highest)
2. `openspec/config.yaml` context (if OpenSpec integration enabled)
3. `AGENTS.md`, `CLAUDE.md` (primary project instructions)
4. `.cursorrules`, `.windsurfrules`, `.github/copilot-instructions.md` (tool-specific)
5. `CONTRIBUTING.md` (general project docs)

**Why**:
- Zero-config experience—works immediately
- Respects existing project standards
- Enables cross-tool awareness (Cursor rules work in Claude Code reviews)

**Merge Strategy**: Concatenate with source attribution, higher priority wins on conflicts.

### Decision 3: Multi-Agent via Task Tool

**Choice**: Use Claude Code's `Task` tool to spawn independent reviewer sub-agents.

**Why**:
- True independence—each reviewer explores without seeing others' work
- Parallel execution where supported
- Clean separation of concerns
- Enables redundancy (same reviewer, multiple runs)

**Implementation**:
```
Tech Lead spawns Task for each (reviewer × redundancy):
  - principal-1 (1 task)
  - security-1, security-2 (2 tasks if redundancy=2)
  - quality-1 (1 task)
  - testing-1 (1 task)
```

### Decision 4: Redundancy Configuration

**Choice**: Configurable redundancy at default and per-reviewer levels.

```yaml
default_redundancy: 1
reviewer_redundancy:
  security: 2  # Critical—run twice
```

**Why**:
- Higher confidence for critical reviewers (security, performance)
- Same findings from multiple runs = very high confidence
- Opt-in complexity—default is simple (redundancy=1)

**Aggregation**:
- Findings in N/N runs = "Confirmed by redundancy" (very high confidence)
- Findings in 1/N runs = "Single observation" (lower confidence)

### Decision 5: Flexible Requirements Input (Simplified DX)

**Choice**: Accept requirements flexibly—let the AI agent discover and interpret context from whatever the user provides.

**Input Flexibility**:
- Inline in request: "review this against the requirement that..."
- Document reference: "see the spec at openspec/changes/add-auth/proposal.md"
- Pasted text: Bug reports, acceptance criteria, notes
- No explicit requirements: Proceed with discovered standards + best practices

**Why Simplified**:
- No rigid CLI flags to remember (`--spec`, `--proposal`, etc.)
- AI agent can interpret intent and read referenced files
- Lean on agent's discovery capabilities
- Natural language is the interface

**Agent Behavior**:
- Recognize when user is providing requirements context
- Read referenced documents automatically
- Search for likely spec files if reference is ambiguous
- Propagate requirements to ALL sub-agents

### Decision 6: Clarifying Questions (Real Code Review Model)

**Choice**: Tech Lead and all reviewers surface clarifying questions about requirements ambiguity and scope boundaries.

**Question Types**:
- **Requirements Ambiguity**: "The spec says 'fast response'—what's the target latency?"
- **Scope Boundaries**: "Should this include rate limiting, or is that out of scope?"
- **Missing Acceptance Criteria**: "How should edge case X be handled?"
- **Intentional Exclusions**: "Was feature Y intentionally left out?"

**Why**:
- Real engineers ask questions during code review
- Ambiguity caught early prevents rework
- Scope questions prevent both over-engineering and missing features
- Demonstrates reviewer agency and critical thinking

**Output**:
- Final synthesis includes a "Clarifying Questions" section
- Questions surfaced prominently for stakeholder response

### Decision 7: Reviewer Agency (Real Engineer Model)

**Choice**: Each reviewer sub-agent has full agency to explore the codebase as they see fit.

**What This Means**:
- Reviewers autonomously decide what files to examine
- Reviewers trace upstream/downstream dependencies at will
- Reviewers examine tests, configs, docs as needed
- Reviewers use professional judgment like real engineers

**Why**:
- Real engineers don't just look at diffs
- Context matters—need to understand surrounding code
- Different reviewers may explore different paths
- Encourages thorough, contextual reviews

**Guidance, Not Restriction**:
- Persona guides focus area, not limits exploration
- Tech Lead guidance suggests focus, doesn't mandate it
- Reviewers document what they explored and why

### Decision 8: Discourse Phase

**Choice**: After individual reviews, run a discourse phase where reviewers respond to each other.

**Response Types** (Fixed, NOT user-configurable):
- **AGREE**: Endorse findings (increases confidence)
- **CHALLENGE**: Push back with reasoning
- **CONNECT**: Link findings across reviewers
- **SURFACE**: Raise new concerns from discussion

**Why Response Types Are Fixed**:
- These types are carefully designed for effective discourse
- Changing them could harm review quality
- Mimics real team dynamics that work

**Why Discourse**:
- Mimics real team dynamics
- Catches issues individual reviewers miss
- Resolves false positives through debate
- Can be skipped with `--quick` flag

### Decision 9: Default Reviewer Team Composition

**Choice**: Default to 2 principal + 2 quality reviewers, with security and testing optional based on change type.

**Default Team**:
- **2× Principal Engineers**: Holistic architecture review with redundancy
- **2× Quality Engineers**: Code quality review with redundancy

**Optional Reviewers** (added based on change type or user request):
- **1× Security Engineer**: If auth, API, or data handling changes detected
- **1× Testing Engineer**: If significant logic changes detected

**Why This Composition**:
- Principal + Quality cover 90% of review needs
- Redundancy on core reviewers = higher confidence baseline
- Security/Testing are specialized—add only when relevant
- Avoids token waste on unnecessary reviews

**User Override**:
- User can adjust team via natural language: "add security focus", "use 3 principal reviewers"
- Static config provides defaults, but runtime requests take precedence

### Decision 10: Plugin Structure for Claude Code

**Choice**: Organize as a Claude Code plugin with clear separation.

```
packages/agents/                    # Source package
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── skills/ocr/
│   ├── SKILL.md                 # Auto-invoke skill
│   ├── assets/
│   │   ├── config.yaml          # Config template (installed to .ocr/)
│   │   └── reviewer-template.md
│   └── references/              # Workflow docs + reviewers
├── commands/                    # Slash commands
└── README.md

.ocr/                               # Installed to user project
├── config.yaml                  # Project context and rules
├── skills/                      # Skill files
├── commands/                    # Command files (tool-specific)
└── sessions/                    # Review artifacts
```

**Why**:
- Standard plugin structure for Claude Code
- Clear namespace (`/ocr:*`) prevents conflicts
- Distributable via marketplace or git clone
- Portable—can be adapted for other environments

### Decision 11: Session Storage

**Choice**: Store all review artifacts in `.ocr/sessions/{id}/`.

**Session ID Format**: `{YYYY-MM-DD}-{branch-name}`

**Contents**:
- `context.md` - Change summary and intent
- `requirements.md` - User-provided requirements/specs (if any)
- `discovered-standards.md` - Merged project context
- `reviews/{reviewer}-{n}.md` - Individual reviews
- `discourse.md` - Discourse results
- `final.md` - Synthesized final review

**Why**:
- Enables history browsing (`/ocr:history`, `/ocr:show`)
- Debugging and auditing
- Can be git-ignored (default) or committed
- Supports session comparison

## File Structure

```
.ocr/
├── config.yaml                     # Project context, rules, discovery settings
├── skills/
│   ├── SKILL.md                    # Main skill (auto-invoke)
│   ├── AGENTS.md                   # OCR-specific instructions
│   ├── assets/
│   │   └── reviewer-template.md    # For /ocr:add-reviewer
│   └── references/
│       ├── workflow.md             # Complete workflow
│       ├── context-discovery.md    # Discovery process
│       ├── discourse.md            # Discourse instructions
│       ├── synthesis.md            # Final synthesis
│       └── reviewers/
│           ├── principal.md        # Architecture focus
│           ├── security.md         # Security focus
│           ├── quality.md          # Code quality focus
│           └── testing.md          # Testing focus
├── commands/                       # Tool-specific command location
│   ├── review.md                   # /ocr-review
│   ├── doctor.md                   # /ocr-doctor
│   ├── reviewers.md                # /ocr-reviewers
│   ├── history.md                  # /ocr-history
│   ├── show.md                     # /ocr-show
│   └── post.md                     # /ocr-post
└── sessions/
    └── {YYYY-MM-DD}-{branch}/
        ├── state.json              # Session state for CLI progress tracking (REQUIRED)
        ├── context.md
        ├── discovered-standards.md
        ├── reviews/
        │   ├── principal-1.md
        │   ├── security-1.md
        │   ├── security-2.md
        │   └── ...
        ├── discourse.md
        └── final.md
```

## Review Workflow (8 Phases)

```
Phase 1: Context Discovery
    ↓ Search for CLAUDE.md, AGENTS.md, .cursorrules, etc.
    ↓ Merge into discovered-standards.md
Phase 2: Gather Change Context
    ↓ git diff, git log, branch info
    ↓ Create session directory
Phase 3: Tech Lead Analysis
    ↓ Summarize change, identify risks
    ↓ Select reviewers, create dynamic guidance
Phase 4: Spawn Reviewers (with Redundancy)
    ↓ For each reviewer × redundancy, spawn Task
    ↓ Save to reviews/{reviewer}-{n}.md
Phase 5: Aggregate Redundant Findings
    ↓ Compare runs, mark confidence levels
Phase 6: Discourse (unless --quick)
    ↓ Reviewers respond: AGREE, CHALLENGE, CONNECT, SURFACE
    ↓ Save to discourse.md
Phase 7: Synthesis
    ↓ Dedupe, prioritize, weight by confidence
    ↓ Save to final.md
Phase 8: Present
    ↓ Display final review
    ↓ If --post, post to GitHub PR
```

## Cross-Platform Distribution Architecture

This is a **critical architectural decision**. OCR must be distributable to a public repository and installable across ANY Agentic IDE environment that uses skills/agent standards.

### The Agent Skills Open Standard

All major agentic IDEs are converging on the **Agent Skills** standard ([agentskills.io](https://agentskills.io)):

| Platform | Skill Discovery Path | Command/Workflow Path | Invocation |
|----------|---------------------|----------------------|------------|
| **Claude Code** | `.claude/skills/` | `.claude/commands/` | `/plugin:command` |
| **Cursor** | `.cursor/skills/`, `.claude/skills/`, `.codex/skills/` | `.cursor/commands/` | `/command-name` |
| **Windsurf** | `.windsurf/skills/` | `.windsurf/workflows/` | `/workflow-name`, `@skill-name` |
| **Codex CLI** | `.codex/skills/` | - | Natural language |
| **GitHub Copilot** | `.github/copilot-instructions.md` | - | Natural language |

**Key Insight**: Cursor explicitly supports Claude and Codex compatibility paths. All platforms use `SKILL.md` with YAML frontmatter.

### Repository Structure (Public Distribution)

The OCR repository is structured for **direct installation** across all platforms:

```
open-code-review/                    # Public GitHub repo
├── .claude-plugin/
│   └── plugin.json                  # Claude Code plugin manifest
├── skills/
│   └── ocr/                         # Skill name must match directory
│       ├── SKILL.md                 # Required: instructions + metadata
│       ├── scripts/                 # Optional: executable code (per spec)
│       │   └── validate-config.sh   # Configuration validation
│       ├── references/              # Optional: documentation (per spec)
│       │   ├── workflow.md          # Complete review workflow
│       │   ├── context-discovery.md # Context discovery process
│       │   ├── reviewer-task.md     # Reviewer task template
│       │   ├── discourse.md         # Discourse phase instructions
│       │   ├── synthesis.md         # Final synthesis process
│       │   └── reviewers/           # Reviewer persona definitions
│       │       ├── principal.md
│       │       ├── security.md
│       │       ├── quality.md
│       │       └── testing.md
│       └── assets/                  # Optional: templates, resources (per spec)
│           ├── config.yaml          # Default OCR configuration
│           ├── reviewer-template.md # Template for new reviewers
│           └── standards/           # Team customization placeholder
│               └── README.md
├── commands/                        # Slash commands (Claude Code)
│   └── ocr/
│       ├── review.md
│       ├── doctor.md
│       ├── reviewers.md
│       ├── add-reviewer.md
│       ├── edit-reviewer.md
│       ├── history.md
│       ├── show.md
│       └── post.md
├── workflows/                       # Windsurf-compatible workflows
│   ├── ocr-review.md
│   ├── ocr-doctor.md
│   └── ocr-add-reviewer.md
├── install.sh                       # Universal installer script
├── README.md                        # Installation & usage docs
└── CHANGELOG.md
```

### SKILL.md Format (Agent Skills Compliant)

The core skill definition follows the **Agent Skills specification** exactly:

```yaml
---
# Required fields
name: ocr
description: |
  AI-powered multi-agent code review. Simulates a team of Principal Engineers 
  reviewing code from different perspectives. Use when asked to review code, 
  check a PR, analyze changes, or perform code review.

# Optional fields (per Agent Skills spec)
license: Apache-2.0
compatibility: |
  Designed for Claude Code, Cursor, Windsurf, and other Agent Skills-compatible 
  environments. Requires git. Optional: gh CLI for GitHub integration.
metadata:
  author: spencermarx
  version: "1.0.0"
  repository: https://github.com/spencermarx/open-code-review
---

# Open Code Review

You are the Tech Lead orchestrating a multi-agent code review...

## When to use this skill
Use when the user asks to:
- Review code or changes
- Check a PR or pull request
- Analyze code quality, security, or architecture
- Get feedback on implementation

## How to run a review
1. Discover project context (see references/context-discovery.md)
2. Gather change context via git diff
3. Assign and spawn reviewers (see references/reviewers/)
4. Aggregate findings and run discourse
5. Synthesize final review

For complete workflow details, see references/workflow.md
```

### Progressive Disclosure (Agent Skills Pattern)

OCR follows the Agent Skills progressive disclosure pattern:

| Stage | Content | Token Budget |
|-------|---------|-------------|
| **Discovery** | `name` + `description` only | ~100 tokens |
| **Activation** | Full SKILL.md body | <5000 tokens |
| **Execution** | `references/*.md`, `scripts/*.sh` | On-demand |

**Key constraints**:
- SKILL.md body MUST be under 500 lines
- Detailed instructions moved to `references/` directory
- Reviewer personas in `references/reviewers/` (loaded per-reviewer)
- Keep file references one level deep from SKILL.md

### Installation Methods

#### Method 1: Claude Code Plugin Marketplace (Primary)
```bash
# User runs in Claude Code
/plugin install github:spencermarx/open-code-review
```

**plugin.json manifest**:
```json
{
  "name": "open-code-review",
  "description": "AI-powered multi-agent code review",
  "version": "1.0.0",
  "author": { "name": "Spencer Marx" },
  "homepage": "https://github.com/spencermarx/open-code-review",
  "repository": "https://github.com/spencermarx/open-code-review"
}
```

#### Method 2: Git Clone (Universal)
```bash
# Clone and symlink to target platform
git clone https://github.com/spencermarx/open-code-review.git ~/.ocr

# Run installer for your platform
~/.ocr/install.sh --platform claude    # Creates .claude/skills/ocr -> ~/.ocr/skills/ocr
~/.ocr/install.sh --platform cursor    # Creates .cursor/skills/ocr -> ~/.ocr/skills/ocr
~/.ocr/install.sh --platform windsurf  # Creates .windsurf/skills/ocr -> ~/.ocr/skills/ocr
~/.ocr/install.sh --platform all       # All platforms
```

#### Method 3: Direct Copy (Project-Level)
```bash
# Copy skill directly into project
cp -r ~/.ocr/skills/ocr .claude/skills/
cp -r ~/.ocr/commands/ocr .claude/commands/  # For Claude Code
```

#### Method 4: npx Wrapper (Future)
```bash
npx open-code-review init          # Initialize in current project
npx open-code-review init --global # Initialize globally
```

### Platform-Specific Adapters

#### Claude Code
- **Full support**: Plugin manifest, skills, commands
- **Namespace**: `/ocr:review`, `/ocr:doctor`, etc.
- **Auto-invoke**: SKILL.md triggers on "review my code"

#### Cursor
- **Skill compatibility**: Reads from `.claude/skills/` natively
- **Commands**: `.cursor/commands/` for slash commands
- **Context files**: Discovers `.cursorrules` for project standards
- **Installation**:
  ```bash
  # Cursor reads .claude/skills/ by default
  cp -r skills/ocr .claude/skills/
  cp -r commands/ocr .cursor/commands/
  ```

#### Windsurf
- **Skills**: `.windsurf/skills/` with SKILL.md
- **Workflows**: `.windsurf/workflows/` for slash-invoked multi-step processes
- **Context files**: Discovers `.windsurfrules`
- **Installation**:
  ```bash
  cp -r skills/ocr .windsurf/skills/
  cp -r workflows/*.md .windsurf/workflows/
  ```

#### Codex CLI / GitHub Copilot
- **Skills**: `.codex/skills/` (Codex), `.github/` (Copilot)
- **Natural language**: No slash commands; skill auto-invokes
- **Installation**:
  ```bash
  cp -r skills/ocr .codex/skills/  # Codex
  # Copilot: Reference SKILL.md content in copilot-instructions.md
  ```

### install.sh Script

```bash
#!/bin/bash
# Universal OCR installer

OCR_ROOT="$(dirname "$0")"
PLATFORM="${1:-all}"
TARGET_DIR="${2:-.}"

install_claude() {
  mkdir -p "$TARGET_DIR/.claude/skills"
  mkdir -p "$TARGET_DIR/.claude/commands"
  ln -sf "$OCR_ROOT/skills/ocr" "$TARGET_DIR/.claude/skills/ocr"
  ln -sf "$OCR_ROOT/commands/ocr" "$TARGET_DIR/.claude/commands/ocr"
  echo "✓ Installed for Claude Code"
}

install_cursor() {
  mkdir -p "$TARGET_DIR/.cursor/skills"
  mkdir -p "$TARGET_DIR/.cursor/commands"
  ln -sf "$OCR_ROOT/skills/ocr" "$TARGET_DIR/.cursor/skills/ocr"
  ln -sf "$OCR_ROOT/commands/ocr" "$TARGET_DIR/.cursor/commands/ocr"
  echo "✓ Installed for Cursor"
}

install_windsurf() {
  mkdir -p "$TARGET_DIR/.windsurf/skills"
  mkdir -p "$TARGET_DIR/.windsurf/workflows"
  ln -sf "$OCR_ROOT/skills/ocr" "$TARGET_DIR/.windsurf/skills/ocr"
  for wf in "$OCR_ROOT/workflows"/*.md; do
    ln -sf "$wf" "$TARGET_DIR/.windsurf/workflows/"
  done
  echo "✓ Installed for Windsurf"
}

case "$PLATFORM" in
  claude)   install_claude ;;
  cursor)   install_cursor ;;
  windsurf) install_windsurf ;;
  all)      install_claude; install_cursor; install_windsurf ;;
  *)        echo "Usage: install.sh [claude|cursor|windsurf|all] [target-dir]" ;;
esac
```

### Workflow Files (Windsurf Compatibility)

Windsurf uses `.windsurf/workflows/*.md` for slash-invoked processes:

**workflows/ocr-review.md**:
```markdown
---
description: Run a full multi-agent code review
---

1. Invoke the OCR skill at `.windsurf/skills/ocr/SKILL.md`
2. Follow the 8-phase workflow in `reference/workflow.md`
3. Present the final review from `.ocr/sessions/*/final.md`
```

### Graceful Feature Degradation

| Feature | Full Support | Degraded Mode |
|---------|--------------|---------------|
| Slash commands | Claude Code, Cursor | Natural language fallback |
| Task spawning (parallel) | Claude Code | Sequential reviewer execution |
| GitHub posting | gh CLI installed | Display review only |
| Redundancy | All platforms | Single-run fallback |
| Discourse | All platforms | Skippable with --quick |

### Context Discovery (Cross-Platform)

OCR discovers project standards from multiple sources:

```
Priority 1 (OCR-specific):
  .claude/skills/ocr/standards/*.md
  .cursor/skills/ocr/standards/*.md
  .windsurf/skills/ocr/standards/*.md

Priority 2 (Platform instructions):
  CLAUDE.md, AGENTS.md
  .cursorrules, .cursor/rules/*.md
  .windsurfrules, .windsurf/rules/*.md
  .github/copilot-instructions.md

Priority 3 (General project docs):
  CONTRIBUTING.md
  .editorconfig
  docs/ARCHITECTURE.md
```

### Version Management

- **Semantic versioning**: `1.0.0`, `1.1.0`, etc.
- **Changelog**: `CHANGELOG.md` in repository root
- **Update mechanism**: `git pull` for clone installs; marketplace handles plugin updates
- **Breaking changes**: Major version bump, documented migration path

### Distribution Checklist

- [ ] Public GitHub repository: `github.com/spencermarx/open-code-review`
- [ ] plugin.json for Claude Code marketplace
- [ ] install.sh for universal installation
- [ ] README with platform-specific instructions
- [ ] Windsurf workflow files in `workflows/`
- [ ] Cursor command files in `commands/`
- [ ] AGENTS.md for repo-level agent instructions

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Long review time | `--quick` flag skips discourse; configurable redundancy |
| High token usage | Default redundancy=1; opt-in for critical reviewers |
| Context discovery latency | Cache in session directory |
| Reviewers miss critical issues | Redundancy + discourse catch more |
| GitHub CLI not installed | Graceful degradation; `/ocr:doctor` warns |
| Large diffs exceed context | Document limits; future: chunking strategy |
| Parallel Task execution unclear | Works sequentially if not parallel; still effective |

## Open Questions

1. **Session cleanup**: Auto-prune old sessions? If so, after how long? 
   - *Proposed*: Manual cleanup via future `/ocr:clean` command

2. **Token limits**: How to handle very large diffs that exceed context windows?
   - *Proposed*: Document limitation in v1.0; add chunking in future version

3. **Custom reviewer validation**: Should `/ocr:add-reviewer` validate persona quality?
   - *Proposed*: Show preview and ask for confirmation; no automated validation

4. **Conflict resolution in context discovery**: When CLAUDE.md and .cursorrules conflict?
   - *Proposed*: Higher priority wins; document in merged output

## Future Considerations

### Phase 2 Features
- Review templates (security audit, refactor review)
- Team reviewer sets
- CI/CD integration (GitHub Action)

### Phase 3 Features
- Review analytics
- IDE extensions
- Custom LLM providers
