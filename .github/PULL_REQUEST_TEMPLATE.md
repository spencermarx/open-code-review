<!--
Thanks for contributing! Before a maintainer reviews this PR, please complete the
OCR review loop (see CONTRIBUTING.md → "Required: OCR review loop before maintainer review").
A bot keeps a `needs-ocr-review` label on the PR until the loop is done.
-->

## Summary

<!-- 1-3 sentences describing what this PR does and why. -->

## Related Issue

<!--
Link the issue where the approach was agreed (CONTRIBUTING.md → "Start with an issue").
Trivial changes (a typo, docs, a small obvious fix) can skip this.
-->

Closes #

## Type of Change

<!-- Please title the PR with Conventional Commits, e.g. `feat(cli): ...`, `fix: ...`, `docs: ...`. -->

- [ ] Bug fix (`fix:`)
- [ ] New feature (`feat:`)
- [ ] Breaking change (`!`)
- [ ] Documentation (`docs:`)
- [ ] Refactor / performance (`refactor:` / `perf:`)
- [ ] Tests / chore / CI / build / style / revert

## Packages Affected

- [ ] `agents` (skills, commands, reviewer personas)
- [ ] `cli` (setup, progress tracking, config)
- [ ] `dashboard` (web UI)
- [ ] Root / config / CI

## Self-Review Checklist

- [ ] I have read and understood every change in this PR and can explain it without an AI
- [ ] `pnpm nx run-many -t typecheck lint test` passes
- [ ] Updated documentation if user-facing behavior changed
- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat:`, `fix:`, `docs:`)

## OCR Review Loop (required)

<!--
Claude Code: run `/ocr-review-loop` (e.g. `--team principal:2,quality:2,security:1`); it posts every round for you.
Other tools: run `/ocr:review` and `/ocr:address` (`/ocr-review` and `/ocr-address` in Windsurf and other flat-command tools) on the whole PR, round by round, and post each with its marker (CONTRIBUTING.md → "Other AI tools: manual fallback").
No AI tooling? Open an issue describing the change instead (CONTRIBUTING.md → "No AI tooling?").
Think this PR should be exempt (typo, trivial docs)? Say so here and a maintainer can apply `ocr-review-exempt`.
-->

- [ ] Every review and address round is posted to this PR as a comment (with its marker)
- [ ] The latest review round's verdict is **APPROVE**
- [ ] The reviewer team had **at least 2 distinct personas** (3+ encouraged)
- [ ] The loop covers the PR's **current head commit** (re-run it after pushing more commits)

**Team used:** <!-- e.g. principal:2, quality:2, security:1 -->
**Review rounds:** <!-- e.g. 2 (REQUEST CHANGES → APPROVE), plus a final address pass -->

## AI Use

<!--
Which AI tools did you use, if any, and roughly how? For example:
"Claude Code drafted the parser; I wrote the tests and reworked the error handling." or "None."
This isn't a judgment; it helps reviewers know where to look harder.
-->

**Tools:**
**How they were used:**
