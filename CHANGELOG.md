## 1.1.0 (2026-01-26)

### 🚀 Features

- add github-npm releases from nx cli ([29cd02b](https://github.com/spencermarx/open-code-review/commit/29cd02b))

### ❤️ Thank You

- Spencer Marx

## 1.0.3 (2026-01-26)

This was a version bump only, there were no code changes.

## 1.0.2 (2026-01-26)

This was a version bump only, there were no code changes.

## 1.0.1 (2026-01-26)

### 🩹 Fixes

- revert premature cli package.json ref change ([a624843](https://github.com/spencermarx/open-code-review/commit/a624843))

### ❤️ Thank You

- Spencer Marx

# Changelog

All notable changes to Open Code Review will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-26

### Added

- **Multi-Agent Code Review System**
  - Tech Lead orchestration of specialized reviewer personas
  - Default team: 2× Principal + 2× Quality engineers
  - Optional Security and Testing reviewers

- **Reviewer Personas**
  - Principal Engineer — Architecture, design, maintainability
  - Security Engineer — Auth, vulnerabilities, data protection
  - Quality Engineer — Code style, readability, best practices
  - Testing Engineer — Coverage, edge cases, testability
  - Custom reviewer support via templates

- **Redundancy System**
  - Multiple reviewers for higher confidence
  - Configurable per-reviewer redundancy
  - Consensus detection across redundant runs

- **Discourse Phase**
  - Reviewers challenge and validate each other
  - AGREE, CHALLENGE, CONNECT, SURFACE response types
  - Skip with `--quick` flag

- **Requirements Context**
  - Flexible input (inline, document reference, pasted text)
  - Agent-driven discovery of requirements
  - Requirements assessment in final synthesis

- **Clarifying Questions**
  - Surface requirements ambiguity
  - Scope boundary questions
  - Edge case uncertainty
  - Prominently displayed in synthesis

- **Reviewer Agency**
  - Full codebase exploration beyond diff
  - Professional judgment like real engineers
  - Document exploration in review output

- **Commands**
  - `/ocr:review` — Run code review
  - `/ocr:doctor` — Health check
  - `/ocr:reviewers` — List reviewers
  - `/ocr:add-reviewer` — Create custom reviewer
  - `/ocr:edit-reviewer` — Modify reviewer
  - `/ocr:history` — List sessions
  - `/ocr:show` — Display session
  - `/ocr:post` — Post to GitHub PR

- **Context Discovery**
  - Auto-discover CLAUDE.md, AGENTS.md, .cursorrules, etc.
  - Priority-based merging
  - Custom standards support

- **Session Management**
  - Persistent storage in `.ocr/sessions/`
  - Session history and retrieval
  - Configurable gitignore

- **GitHub Integration**
  - PR review support
  - Post reviews as PR comments
  - Inline comment format option

- **Cross-Platform Support**
  - Claude Code plugin structure
  - Agent Skills specification compliance
  - Cursor and Windsurf compatibility

### Technical

- Zero runtime dependencies
- Pure markdown-based skill definition
- Progressive disclosure pattern for efficiency
