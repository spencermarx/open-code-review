# Tasks: Add Open Code Review Core System

Implementation checklist organized by phase. Tasks are ordered for incremental delivery with each phase building on the previous.

## Phase 1: Core Skill Foundation

- [x] 1.1 Create plugin manifest `.claude-plugin/plugin.json`
- [x] 1.2 Create main skill `skills/ocr/SKILL.md` with auto-invoke triggers
- [x] 1.3 Create configuration `skills/ocr/assets/config.yaml` with redundancy settings
- [x] 1.4 Create `skills/ocr/references/workflow.md` with 8-phase process
- [x] 1.5 Create `skills/ocr/references/context-discovery.md` with discovery algorithm
- [x] 1.6 Create `skills/ocr/references/reviewer-task.md` with reviewer template

**Validation**: `/ocr:doctor` displays skill installation status (partial)

## Phase 2: Default Reviewers

- [x] 2.1 Create `skills/ocr/references/reviewers/principal.md` persona
- [x] 2.2 Create `skills/ocr/references/reviewers/security.md` persona
- [x] 2.3 Create `skills/ocr/references/reviewers/quality.md` persona
- [x] 2.4 Create `skills/ocr/references/reviewers/testing.md` persona
- [x] 2.5 Create `skills/ocr/assets/reviewer-template.md` for custom reviewers
- [x] 2.6 Create `skills/ocr/assets/standards/README.md` explaining custom standards

**Validation**: 4 default reviewers listed, template available

## Phase 3: Primary Commands

- [x] 3.1 Create `commands/ocr/review.md` with target and flag parsing
- [x] 3.2 Create `commands/ocr/doctor.md` with health checks
- [x] 3.3 Create `commands/ocr/reviewers.md` to list reviewers

**Validation**: `/ocr:review` runs basic review on staged changes, `/ocr:doctor` shows full status

## Phase 4: Reviewer Management Commands

- [x] 4.1 Create `commands/ocr/add-reviewer.md` with interactive flow
- [x] 4.2 Create `commands/ocr/edit-reviewer.md` with edit flow

**Validation**: Can create and modify custom reviewers interactively

## Phase 5: Advanced Workflow

- [x] 5.1 Create `skills/ocr/references/discourse.md` with discourse instructions
- [x] 5.2 Create `skills/ocr/references/synthesis.md` with synthesis process
- [x] 5.3 Update workflow.md to integrate discourse and synthesis phases (already integrated)

**Validation**: Full review with discourse produces prioritized final.md

## Phase 6: Session Management

- [x] 6.1 Implement session directory creation in workflow (documented in workflow.md)
- [x] 6.2 Create `commands/ocr/history.md` to list sessions
- [x] 6.3 Create `commands/ocr/show.md` to display sessions
- [x] 6.4 Create `.ocr/.gitignore` template (skills/ocr/assets/ocr-gitignore)

**Validation**: `/ocr:history` lists past reviews, `/ocr:show` displays them

## Phase 7: GitHub Integration

- [x] 7.1 Create `commands/ocr/post.md` for PR posting
- [x] 7.2 Add PR review support to `/ocr:review pr <number>` (documented in review.md)
- [x] 7.3 Add `gh` CLI detection to `/ocr:doctor` (already included)

**Validation**: `/ocr:post` successfully posts to GitHub PR

## Phase 8: Documentation & Packaging

- [x] 8.1 Create project `README.md` with installation and usage
- [x] 8.2 Create `CHANGELOG.md`
- [x] 8.3 Update plugin.json with final metadata (already complete)
- [x] 8.4 Create generic initialization guide for non-Claude environments (docs/INSTALLATION.md)

**Validation**: README covers all installation methods, examples work

## Phase 9: Testing & Validation

- [x] 9.1 Test zero-config activation with "review my code"
- [x] 9.2 Test context discovery with CLAUDE.md, .cursorrules
- [x] 9.3 Test redundancy with security=2 configuration
- [x] 9.4 Test `--quick` flag skips discourse
- [x] 9.5 Test commit range review `HEAD~3..HEAD`
- [x] 9.6 Test PR review (requires gh CLI)
- [x] 9.7 Test custom reviewer creation and usage

**Validation**: All scenarios pass manual testing

---

## Dependencies

| Task | Depends On |
|------|------------|
| Phase 2 | Phase 1 (skill foundation) |
| Phase 3 | Phase 1-2 (skill + reviewers) |
| Phase 4 | Phase 2 (reviewer template) |
| Phase 5 | Phase 3 (review command) |
| Phase 6 | Phase 5 (workflow with sessions) |
| Phase 7 | Phase 3 (review command) |
| Phase 8 | All phases |
| Phase 9 | All phases |

## Parallelizable Work

The following can be developed in parallel:
- Phase 4 and Phase 5 (after Phase 3)
- Phase 6 and Phase 7 (after Phase 5)

## Deliverables per Phase

| Phase | User-Visible Feature |
|-------|---------------------|
| 1-3 | Basic review works: `/ocr:review` on staged changes |
| 4 | Custom reviewers: `/ocr:add-reviewer performance` |
| 5 | Full discourse: multi-perspective review with debate |
| 6 | History: browse and view past reviews |
| 7 | GitHub: post reviews to PRs |
| 8-9 | Production-ready with documentation |
