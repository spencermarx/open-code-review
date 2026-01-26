# Change: Add Open Code Review Core System

## Why

Code review remains one of the most valuable yet challenging practices in software engineering. Senior engineers become bottlenecks, reviews vary in quality, and important issues get missed while trivial ones are flagged. Teams lack time for thorough, multi-perspective review.

**Open Code Review (OCR)** solves this by providing an AI-powered multi-agent code review framework that simulates a real engineering team review process—orchestrating multiple AI "Principal Engineers" who independently review code, engage in discourse, and produce unified, actionable feedback.

## What Changes

This proposal introduces the complete OCR v1.0 system as a Claude Code plugin with cross-tool portability:

### Core Capabilities
- **Multi-agent orchestration**: Tech Lead coordinates specialized reviewer sub-agents
- **Automatic context discovery**: Zero-config by loading CLAUDE.md, AGENTS.md, .cursorrules, etc.
- **Redundancy configuration**: Run critical reviewers multiple times for higher confidence
- **Discourse phase**: Reviewers discuss and challenge each other's findings
- **Session management**: Persistent review history with artifacts

### Plugin Structure (Claude Code)
- **SKILL.md**: Auto-invoked when user asks to "review code"
- **Slash commands**: `/ocr:review`, `/ocr:doctor`, `/ocr:reviewers`, `/ocr:add-reviewer`, etc.
- **Reference documents**: workflow.md, context-discovery.md, discourse.md, synthesis.md
- **Default reviewers**: principal, security, quality, testing personas

### Cross-Tool Portability
- Pure markdown + shell implementation (no runtime dependencies)
- Agent Skills standard compliance for GitHub Copilot, Codex CLI compatibility
- Discovers .cursorrules, .windsurfrules for Cursor/Windsurf environments

### Distribution
- Claude Code plugin marketplace installation
- Git clone for project-local or user-global installation
- Initializable for any SKILLS/AGENTS-compatible environment

## Impact

- **Affected specs**: None (new capability)
- **New capabilities**:
  - `review-orchestration` - Core multi-agent review workflow
  - `context-discovery` - Automatic project standards loading
  - `reviewer-management` - Reviewer personas and configuration
  - `slash-commands` - User-facing command interface
  - `session-management` - Review history and artifacts
  - `plugin-distribution` - Installation and packaging

## Success Criteria

| Criterion | Target |
|-----------|--------|
| Time to first review | < 1 minute after install |
| Zero-config activation | "review my code" works immediately |
| Context discovery | Finds CLAUDE.md, AGENTS.md, .cursorrules automatically |
| Cross-tool compatibility | Works with Claude Code; portable to Agent Skills tools |
| Redundancy support | Configurable per-reviewer redundancy |

## Dependencies

- Git 2.0+ (required)
- GitHub CLI `gh` (optional, for PR features)
- Claude Code or Agent Skills-compatible environment

## Risks

| Risk | Mitigation |
|------|------------|
| Long review time | `--quick` flag skips discourse phase |
| High token usage | Configurable redundancy; default=1 |
| Context discovery latency | Cache in session directory |
| Large diffs exceed context | Document limits; future chunking strategy |
