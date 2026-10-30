<!--
Thanks for contributing! Before a maintainer reviews this PR, please complete the
OCR review loop (see CONTRIBUTING.md → "Required: OCR review loop before maintainer review").
A bot keeps a `needs-ocr-review` label on the PR until the loop is approved and covers the latest commit.
-->

## Summary

<!-- 1-3 sentences describing what this PR does and why. -->

## Related Issue

<!--
`feat:`, `refactor:`, `perf:` and breaking (`!`) PRs must link an issue a maintainer has labelled `accepted`.
`fix:` PRs need a clear reproduction (here or in a linked issue). `docs:`, `test:`, `chore:`, `ci:`, `build:` can skip this.
Use "Closes #123" so the issue is linked and closed on merge.
-->

Closes #

## Type of Change

<!-- The PR title must follow Conventional Commits, e.g. `feat(cli): ...`, `fix: ...`, `docs: ...`. -->

- [ ] Bug fix (`fix:`)
- [ ] New feature (`feat:`, needs an `accepted` issue)
- [ ] Breaking change (`!`, needs an `accepted` issue)
- [ ] Documentation (`docs:`)
- [ ] Refactor / performance (`refactor:` / `perf:`, needs an `accepted` issue)
- [ ] Tests / chore / CI / build

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
Other tools: run `/ocr:review` and `/ocr:address` round by round and post each with its marker (CONTRIBUTING.md → "Other AI tools: manual fallback").
No AI tooling, or think this PR should be exempt (typo, trivial docs)? Say so here and a maintainer will help.
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
